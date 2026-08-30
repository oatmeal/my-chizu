# VODs in the timeline

Entries in a data repo's `data/vods.json` appear in the timeline as links to the
stream a snapshot came from. This covers the file, the sync tool that maintains
it, and the two functions that know which video site is on the other end.

## The file

```json
[ { "id": "dQw4w9WgXcQ", "date": "20230311", "title": "…", "t": 1830 } ]
```

`id` is a bare YouTube video id. `t` is an optional start offset in seconds, to
deep-link part way into a long stream; `vodUrl()` renders it as YouTube's
`&t=<n>s`.

**`t` is a separate field on purpose.** `id` must stay a bare id, because
`scripts/sync-vods.mjs` matches ids against playlist entries verbatim — a `?t=`
glued onto an id makes the sync re-add the video as a duplicate and report the
offset entry as stale. That is not hypothetical; it is why the field exists.

## Which site the links point at

`vodUrl()` and `vodIconHtml()` in `lib/timeline.js` are the **only** places the
provider is named. Pointing the timeline at something other than YouTube means
changing those two functions and `static/youtube.svg`, and nothing else.

Where an entry sits in the timeline is `buildTimelineEntries()`'s business, and
it takes VODs as one pre-sorted stream among any number — see
[`viewer.md`](viewer.md#adding-a-timeline-entry-kind).

## Syncing from YouTube

`scripts/sync-vods.mjs` pulls entries from YouTube into `data/vods.json`, so the
timeline's stream links can be refreshed without hand-editing JSON. Needs
[yt-dlp](https://github.com/yt-dlp/yt-dlp) on PATH.

```bash
node scripts/sync-vods.mjs /path/to/data-repo            # dry run — prints the report
node scripts/sync-vods.mjs /path/to/data-repo --write    # apply it
```

Sources come from `vods.playlists` / `vods.extraVideos` in the data repo's
`site.json`, overridable ad hoc with `--playlist URL` and `--video ID`.
`extraVideos` pins videos that belong in the timeline but sit outside the
playlists.

**Existing entries are never modified**, so manual title and date fixes survive
a re-run: only videos whose id isn't already in `vods.json` are appended, and the
list is re-sorted by date. Extra fields on an existing entry, such as `t`, are
carried through untouched.

**The date comes from a `YYYY年M月D日` substring in the title**, falling back to
the video's YouTube release date — which for a re-upload of an older stream is
the *upload* date, not the stream date. The report labels which source each date
came from, for exactly that reason. Undated videos are skipped and listed for
manual entry.

The report also flags entries in `vods.json` that no longer appear in any source,
which means the video was removed, privated, or needs pinning via
`vods.extraVideos`.

### Titles

Titles are stripped of genre tags and the redundant date by `scripts/vodTitle.js`
(pure, tested). A data repo tunes it through `site.json`:

- `vods.titleCleanup.vocab` — site-specific boilerplate tokens, added to the
  engine's defaults.
- `vods.titleCleanup.overrides` — a final title for videos the rules cannot fix:
  an unbalanced `【`, or a title truncated on YouTube itself.

### `migrate-twitch-vods.mjs`

A one-shot, kept for provenance: it records how llmr's 109 Twitch VODs were
paired with their YouTube re-uploads. It refuses to run against an
already-migrated `vods.json`.

## Known gap

`scripts/sync-vods.mjs` has no tests — the known/stale/dedupe logic is untested,
which is why a `?t=` suffix on an id silently became a duplicate-append path.
`scripts/vodTitle.js` is the only part of the sync tooling with coverage. See
[`plans/backlog.md`](plans/backlog.md).
