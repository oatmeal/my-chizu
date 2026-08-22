// Cleaning of YouTube video titles for use as VOD titles in the timeline.
//
// Channels pad archive titles with genre/platform tags and a redundant stream
// date. The timeline already renders the date next to every VOD, and the tags
// say nothing a viewer of a Minecraft map doesn't already know, so both are
// stripped.
//
// The rule for 【...】 blocks is deliberately conservative: a block is dropped
// only when *every* token inside it is known boilerplate vocabulary. A single
// unrecognised token keeps the whole block, so titles where the 【...】 carries
// real content survive untouched, and an unfamiliar tag on a future upload is
// left in place rather than silently swallowed.

/** Boilerplate tokens common to any Minecraft stream archive. */
export const DEFAULT_TAG_VOCAB = [
  "マイクラ",
  "マインクラフト",
  "Minecraft",
  "マイクラ実況",
  "マインクラフト実況",
  "Minecraft実況",
  "マインクラフトゲーム実況",
  "ゲーム実況",
  "実況",
  "ライブ配信",
  "配信",
  "Twitch配信",
  "建築",
  "建築回",
  "Bedrock",
  "統合版",
  "Minecraft統合版",
  "マインクラフト統合版",
  "マイクラ統合版",
  "Minecraft統合版(Bedrock)",
  "Minecraft建築",
  "Server",
  "サーバー",
];

const DATE = String.raw`\d{4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日`;
const LEADING_DATE = new RegExp(String.raw`^\s*${DATE}\s*[:：]?\s*`);
const TRAILING_DATE = new RegExp(String.raw`[\s:：\-—–]*${DATE}\s*$`);
// Non-greedy on the inner text so an unbalanced 【 can't swallow the title.
const TAG_BLOCK = /【([^【】]*)】/g;
// 🟣 and friends are used as separators inside these tags, not as decoration.
const TAG_SEPARATOR = /[\/／┃|：:、,&＆🟣]/u;
const TAG_DECORATION = /[🏡🎮\s]/gu;
const EPISODE_PREFIX = /^(#\d+(?:-\d+)?)(?=\S)/;
const VERSION = /^(?:統合版)?1\.\d+(?:\.\d+)*$/;

const normalize = (token) => token.replace(TAG_DECORATION, "");

/**
 * Clean a YouTube title for display as a VOD entry.
 *
 * @param {string} title - the raw YouTube title
 * @param {Object} [options]
 * @param {string[]} [options.vocab] - boilerplate tokens, replacing the defaults
 * @returns {string}
 */
export function cleanVodTitle(title, { vocab = DEFAULT_TAG_VOCAB } = {}) {
  const known = new Set(vocab.map(normalize));
  const isBoilerplate = (inner) => {
    const tokens = inner.split(TAG_SEPARATOR).map(normalize).filter(Boolean);
    return (
      tokens.length > 0 &&
      tokens.every((t) => known.has(t) || VERSION.test(t))
    );
  };

  let s = title
    .replace(LEADING_DATE, "")
    .replace(TAG_BLOCK, (block, inner) => (isBoilerplate(inner) ? "" : block))
    .replace(TRAILING_DATE, "");

  // Tidy up whatever the removals left behind, then re-space the "#12" that
  // the stripped tag used to be separated from.
  s = s
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s:：]+/, "")
    .replace(/[\s:：]+$/, "")
    .replace(EPISODE_PREFIX, "$1 ");

  // Never hand back an empty title — a stripped-to-nothing title is worse than
  // the padded original.
  return s || title.trim();
}
