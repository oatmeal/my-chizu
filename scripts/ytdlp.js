// Thin wrappers around the yt-dlp CLI, which must be on PATH.
import { execFile } from "child_process";
import { promisify } from "util";

const execFile_promise = promisify(execFile);

async function ytDlp(args) {
  const { stdout } = await execFile_promise("yt-dlp", args, {
    maxBuffer: 256 * 1024 * 1024,
  });
  return stdout;
}

/** List a playlist's videos as [{ id, title }], without hitting each video page. */
export async function fetchPlaylist(url) {
  const data = JSON.parse(
    await ytDlp(["--flat-playlist", "--dump-single-json", url])
  );
  return (data.entries ?? []).map((e) => ({ id: e.id, title: e.title }));
}

/**
 * Look up individual videos by id, for videos that aren't in any playlist.
 *
 * Unavailable ids are skipped rather than fatal — a pinned video that has since
 * been deleted or made private shouldn't take the whole sync down with it. The
 * caller can spot them by which ids are missing from the result.
 *
 * @returns {Promise<{id: string, title: string}[]>}
 */
export async function fetchVideos(ids) {
  if (!ids.length) return [];
  let stdout;
  try {
    stdout = await ytDlp([
      "--ignore-errors",
      "--simulate",
      "--print",
      "%(id)s\t%(title)s",
      ...ids,
    ]);
  } catch (e) {
    // --ignore-errors keeps going but still exits non-zero, so keep whatever
    // it managed to print before giving up on the bad ids.
    stdout = e.stdout ?? "";
  }
  const out = [];
  for (const line of stdout.split("\n")) {
    const [id, ...rest] = line.trim().split("\t");
    if (id && rest.length) out.push({ id, title: rest.join("\t") });
  }
  return out;
}

/**
 * Look up the release (or failing that, upload) date of specific videos.
 *
 * Note this is when the video went live on YouTube. For a re-upload of an old
 * stream that is NOT the stream date, so it is only a useful fallback for
 * videos that were streamed natively on YouTube.
 *
 * @returns {Promise<Object<string, string>>} video id -> YYYYMMDD
 */
export async function fetchReleaseDates(ids) {
  if (!ids.length) return {};
  const stdout = await ytDlp([
    "--simulate",
    "--print",
    "%(id)s\t%(release_date,upload_date)s",
    ...ids,
  ]);
  const out = {};
  for (const line of stdout.split("\n")) {
    const [id, date] = line.trim().split("\t");
    if (id && /^\d{8}$/.test(date)) out[id] = date;
  }
  return out;
}
