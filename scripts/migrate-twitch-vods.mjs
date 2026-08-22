// Usage: node scripts/migrate-twitch-vods.mjs /path/to/data-repo [--write]
//
// One-shot migration of data/vods.json from Twitch VOD ids to YouTube video
// ids, for the llmr data repo. Kept for provenance: it records how each of the
// 109 Twitch VODs was matched to its re-upload, which is not something that can
// be re-derived once vods.json no longer holds the Twitch ids.
//
// Twitch titles are discarded in favour of the (cleaned) YouTube ones, because
// the pairing is not 1:1 — one stream was re-uploaded as two videos, so reusing
// the Twitch title would give both parts the same name.
//
// Matching strategy: both lists are chronological, so after accounting for the
// exceptions below they align by position. Every pairing where the YouTube
// title carries a date is verified against the Twitch date, and the script
// fails if any numbered video is left unclaimed.
//
// Requires yt-dlp on PATH.
import fsPromises from "fs/promises";
import { join, resolve } from "path";
import { cleanVodTitle, DEFAULT_TAG_VOCAB } from "./vodTitle.js";
import { fetchPlaylist } from "./ytdlp.js";

const PLAYLIST =
  "https://www.youtube.com/playlist?list=PLiEbvIX7bSuMb5pHp-aO7rbm3_QdebqUL";

// Twitch VOD id -> YouTube video ids. [] means "no YouTube counterpart".
const EXCEPTIONS = {
  // The 2021-09-01 Nether stream was re-uploaded as two parts (#5-1 / #5-2).
  "1191786265": ["PbQbcBuI_UI", "n5CbulAHHZo"],
  // Two Twitch VODs from 2021-09-14 were merged into a single upload (#10).
  "1203907392": ["Vo-oxj_I8Jw"],
  "1204015262": ["Vo-oxj_I8Jw"],
  // A 雑談 stream, so it went to the Just Chatting playlist, not Minecraft.
  "2142010001": ["AxofNdRaT38"],
  // Never re-uploaded. Searched every tab and all 183 playlists on the channel.
  "2199687215": [],
};

// Numbered videos in the playlist that predate no Twitch VOD in vods.json —
// streams that were simply missing from the old archive.
const EXTRA_YT = new Set([
  "w5bGuVCcrwQ", // #70  Christmas 2022  (2022-12-24)
  "WGKrYM0h6wU", // #106 Pale Garden     (2024-12-13)
]);

// Videos pulled in from another playlist on the same channel.
const EXTERNAL = [
  {
    id: "AxofNdRaT38",
    date: "20240310",
    // Truncated on YouTube itself; site.json's title override supplies the rest.
    title: "【雑談/誕生日】🎂3/11 Happy Birthday!!ネコちゃん我が家へようこそ😼(すずが",
  },
];

// Stream dates for videos whose title has none, taken from release_date.
const DATE_OVERRIDES = { L7iP_shk848: "20251215" };

const EP = /#(\d+)(?:-(\d+))?/;
const DATE = /(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/;

const args = process.argv.slice(2);
const write = args.includes("--write");
const dataDir = resolve(args.find((a) => a !== "--write") ?? ".");

const site = JSON.parse(
  await fsPromises.readFile(join(dataDir, "site.json"), "utf-8")
);
const cleanup = site.vods?.titleCleanup ?? {};
const vocab = [...DEFAULT_TAG_VOCAB, ...(cleanup.vocab ?? [])];
const overrides = cleanup.overrides ?? {};
const vodTitle = (id, raw) => overrides[id] ?? cleanVodTitle(raw, { vocab });

const vodsPath = join(dataDir, "data/vods.json");
const vods = JSON.parse(await fsPromises.readFile(vodsPath, "utf-8"));

// This consumes Twitch ids, so it is not idempotent: running it against an
// already-migrated file would silently mispair everything.
if (!vods.every((v) => /^\d+$/.test(v.id))) {
  throw new Error(
    `${vodsPath} does not hold Twitch ids — it looks already migrated`
  );
}

const yt = [...(await fetchPlaylist(PLAYLIST)), ...EXTERNAL].map((e) => {
  const m = EP.exec(e.title);
  const d = DATE.exec(e.title);
  return {
    id: e.id,
    title: e.title,
    ep: m ? Number(m[1]) : null,
    sub: m && m[2] ? Number(m[2]) : null,
    date:
      DATE_OVERRIDES[e.id] ??
      e.date ??
      (d
        ? `${d[1]}${String(d[2]).padStart(2, "0")}${String(d[3]).padStart(2, "0")}`
        : null),
    external: Boolean(e.date),
  };
});
const ytById = new Map(yt.map((y) => [y.id, y]));

const numbered = yt
  .filter((y) => y.ep !== null)
  .sort((a, b) => a.ep - b.ep || (a.sub ?? 0) - (b.sub ?? 0));
const unnumbered = yt.filter((y) => y.ep === null && !y.external);

// --- Pair each Twitch VOD with its YouTube upload(s) ---------------------
const claimed = new Set();
const warnings = [];
const pairs = [];
let cursor = 0;

for (const v of vods) {
  let matches;
  if (EXCEPTIONS[v.id]) {
    matches = EXCEPTIONS[v.id].map((id) => {
      const y = ytById.get(id);
      if (!y) throw new Error(`exception names an unknown video: ${id}`);
      return y;
    });
    while (cursor < numbered.length && claimed.has(numbered[cursor].id)) cursor++;
    if (matches.some((y) => y.id === numbered[cursor]?.id)) cursor++;
  } else {
    while (
      cursor < numbered.length &&
      (claimed.has(numbered[cursor].id) || EXTRA_YT.has(numbered[cursor].id))
    ) {
      cursor++;
    }
    if (cursor >= numbered.length) {
      throw new Error(`ran out of videos at ${v.date} ${v.title}`);
    }
    matches = [numbered[cursor++]];
  }
  for (const y of matches) {
    claimed.add(y.id);
    if (y.date && y.date !== v.date) {
      warnings.push(
        `#${y.ep}${y.sub ? `-${y.sub}` : ""} ${y.id}: title says ${y.date}, ` +
          `Twitch says ${v.date} — using ${v.date}`
      );
    }
  }
  pairs.push({ vod: v, matches });
}

const unclaimed = numbered.filter(
  (y) => !claimed.has(y.id) && !EXTRA_YT.has(y.id)
);
if (unclaimed.length) {
  for (const y of unclaimed) console.error(`UNCLAIMED #${y.ep} ${y.id} ${y.title}`);
  throw new Error(`${unclaimed.length} numbered videos went unmatched`);
}

// --- Emit the new vods.json ---------------------------------------------
const out = [];
// A video that covers more than one Twitch VOD earns a single entry, not one
// per VOD it absorbed.
const emitted = new Set();
const push = (id, date, title) => {
  if (emitted.has(id)) return;
  emitted.add(id);
  out.push({ id, date, title });
};
for (const { vod, matches } of pairs) {
  // Keep the Twitch date: it is the stream date, and a few titles mistype it.
  for (const y of matches) push(y.id, vod.date, vodTitle(y.id, y.title));
}
for (const id of EXTRA_YT) {
  const y = ytById.get(id);
  push(y.id, y.date, vodTitle(y.id, y.title));
}
for (const y of unnumbered) {
  if (!y.date) {
    warnings.push(`no date, SKIPPED: ${y.id} ${y.title}`);
    continue;
  }
  push(y.id, y.date, vodTitle(y.id, y.title));
}
out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

const dropped = pairs.filter((p) => !p.matches.length);
console.log(`Twitch VODs in:   ${vods.length}`);
console.log(`  matched:        ${vods.length - dropped.length}`);
for (const p of dropped) {
  console.log(`  dropped:        ${p.vod.date} ${p.vod.id}  ${p.vod.title}`);
}
console.log(`YouTube videos:   ${yt.length} (numbered ${numbered.length})`);
console.log(`Entries written:  ${out.length}`);
console.log(`Date range:       ${out[0].date} .. ${out.at(-1).date}`);
console.log(`\nWarnings (${warnings.length}):`);
for (const w of warnings) console.log(`  ${w}`);

if (write) {
  await fsPromises.writeFile(vodsPath, JSON.stringify(out, null, 2) + "\n");
  console.log(`\nwrote ${vodsPath}`);
} else {
  console.log(`\ndry run — re-run with --write to overwrite ${vodsPath}`);
}
