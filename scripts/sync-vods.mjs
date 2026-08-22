// Usage: node scripts/sync-vods.mjs /path/to/data-repo [--write]
//                                    [--playlist URL ...] [--video ID ...]
//
// Syncs data/vods.json in a data repo against one or more YouTube playlists.
// Existing entries are never modified (manual title/date edits are preserved);
// videos that aren't in vods.json yet are appended and the list is re-sorted by
// date. Without --write this is a dry run that only prints the report.
//
// Playlist URLs come from --playlist flags, or from `vods.playlists` in the
// data repo's site.json.
//
// Streams that belong in the timeline but sit outside those playlists — a
// crossover episode filed under another game, say — can be pinned by id via
// --video or `vods.extraVideos`. Pinning one both pulls it in and keeps it out
// of the "not in any playlist" report, so that report stays meaningful: an
// entry showing up there means the video was removed, privated, or deleted.
//
// The stream date is taken from a YYYY年M月D日 substring in the video title,
// which is how this channel titles its archives. Videos without one fall back
// to the YouTube release/upload date; anything still undated is reported and
// skipped so it can be added by hand.
//
// Titles are run through cleanVodTitle to drop genre tags and the redundant
// date. Site-specific settings come from `vods.titleCleanup` in site.json:
//   vocab     - extra boilerplate tokens, added to the engine defaults
//   overrides - video id -> final title, for titles the rules can't fix
//
// Requires yt-dlp on PATH.
import fsPromises from "fs/promises";
import { join, resolve } from "path";
import { cleanVodTitle, DEFAULT_TAG_VOCAB } from "./vodTitle.js";
import { fetchPlaylist, fetchReleaseDates, fetchVideos } from "./ytdlp.js";

const TITLE_DATE = /(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/;

const USAGE =
  "usage: node scripts/sync-vods.mjs /path/to/data-repo [--write] " +
  "[--playlist URL ...] [--video ID ...]";

function parseArgs(argv) {
  const playlists = [];
  const videos = [];
  let dataDir = null;
  let write = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--write") write = true;
    else if (argv[i] === "--playlist") playlists.push(argv[++i]);
    else if (argv[i] === "--video") videos.push(argv[++i]);
    else if (!dataDir) dataDir = argv[i];
    else throw new Error(`unexpected argument: ${argv[i]}`);
  }
  if (!dataDir) throw new Error(USAGE);
  if (playlists.includes(undefined) || videos.includes(undefined)) {
    throw new Error(USAGE);
  }
  return { dataDir: resolve(dataDir), playlists, videos, write };
}

function titleDate(title) {
  const m = TITLE_DATE.exec(title);
  if (!m) return null;
  return `${m[1]}${String(m[2]).padStart(2, "0")}${String(m[3]).padStart(2, "0")}`;
}

const {
  dataDir,
  playlists: cliPlaylists,
  videos: cliVideos,
  write,
} = parseArgs(process.argv.slice(2));

const sitePath = join(dataDir, "site.json");
const site = JSON.parse(await fsPromises.readFile(sitePath, "utf-8"));
const playlists = cliPlaylists.length ? cliPlaylists : site.vods?.playlists ?? [];
const extraIds = [...cliVideos, ...(site.vods?.extraVideos ?? [])];
if (!playlists.length && !extraIds.length) {
  throw new Error(
    `nothing to sync: pass --playlist/--video, or set vods.playlists in ${sitePath}`
  );
}

const cleanup = site.vods?.titleCleanup ?? {};
const vocab = [...DEFAULT_TAG_VOCAB, ...(cleanup.vocab ?? [])];
const overrides = cleanup.overrides ?? {};
const vodTitle = (id, raw) => overrides[id] ?? cleanVodTitle(raw, { vocab });

const vodsPath = join(dataDir, "data/vods.json");
const vods = JSON.parse(await fsPromises.readFile(vodsPath, "utf-8"));
const known = new Set(vods.map((v) => v.id));

const seen = new Map();
for (const url of playlists) {
  const entries = await fetchPlaylist(url);
  console.log(`${url}\n  ${entries.length} videos`);
  for (const e of entries) if (!seen.has(e.id)) seen.set(e.id, e);
}

const pinned = await fetchVideos(extraIds);
for (const e of pinned) if (!seen.has(e.id)) seen.set(e.id, e);
if (extraIds.length) {
  console.log(`pinned videos\n  ${pinned.length}/${extraIds.length} resolved`);
}
const unresolved = extraIds.filter((id) => !seen.has(id));

const fresh = [...seen.values()].filter((e) => !known.has(e.id));
const needDate = fresh.filter((e) => !titleDate(e.title)).map((e) => e.id);
const released = await fetchReleaseDates(needDate);

const added = [];
const undated = [];
for (const e of fresh) {
  const date = titleDate(e.title) ?? released[e.id] ?? null;
  if (!date) undated.push(e);
  else added.push({ id: e.id, date, title: vodTitle(e.id, e.title) });
}

const merged = [...vods, ...added].sort((a, b) =>
  a.date < b.date ? -1 : a.date > b.date ? 1 : 0
);

console.log(`\nexisting entries: ${vods.length}`);
console.log(`new entries:      ${added.length}`);
for (const v of added) {
  const raw = seen.get(v.id).title;
  const src = titleDate(raw) ? "title" : "release_date";
  console.log(`  + ${v.date} [${src}] ${v.id}  ${v.title}`);
  if (v.title !== raw) console.log(`      raw: ${raw}`);
}
if (undated.length) {
  console.log(`\nno date found — add these by hand (${undated.length}):`);
  for (const e of undated) console.log(`  ? ${e.id}  ${e.title}`);
}

if (unresolved.length) {
  console.log(`\npinned but unavailable on YouTube (${unresolved.length}):`);
  for (const id of unresolved) {
    const v = vods.find((x) => x.id === id);
    console.log(`  ! ${id}${v ? `  ${v.title}` : ""}`);
  }
}

const stale = vods.filter((v) => !seen.has(v.id) && !extraIds.includes(v.id));
if (stale.length) {
  console.log(
    `\nin vods.json but not in any playlist (${stale.length}) — removed, ` +
      `privated, or needs pinning via vods.extraVideos:`
  );
  for (const v of stale) console.log(`  - ${v.date} ${v.id}  ${v.title}`);
}

if (write && added.length) {
  await fsPromises.writeFile(vodsPath, JSON.stringify(merged, null, 2) + "\n");
  console.log(`\nwrote ${merged.length} entries to ${vodsPath}`);
} else if (write) {
  console.log(`\nnothing to add; ${vodsPath} unchanged`);
} else {
  console.log(`\ndry run — re-run with --write to update ${vodsPath}`);
}
