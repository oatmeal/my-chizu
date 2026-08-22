import { describe, it, expect } from "vitest";
import { cleanVodTitle, DEFAULT_TAG_VOCAB } from "./vodTitle.js";

// Site-specific vocabulary, as a data repo would supply it via site.json.
const vocab = [
  ...DEFAULT_TAG_VOCAB,
  "りりまる",
  "りりまるサーバー",
  "りりまる村",
  "りりまるマイクラサーバー",
  "りり村",
  "りり村建築",
  "LiLimaru",
  "LiLimaru Server",
];
const clean = (title) => cleanVodTitle(title, { vocab });

describe("cleanVodTitle", () => {
  it("strips boilerplate tags and the trailing date", () => {
    expect(
      clean(
        "#3【Minecraft】🏠️みんなの家ができてきた!🐟おいしい鮭【りりまる村/マイクラ実況】2021年8月29日"
      )
    ).toBe("#3 🏠️みんなの家ができてきた!🐟おいしい鮭");
  });

  it("strips a leading date", () => {
    expect(
      clean("2025年5月11日【マイクラ】🏜️砂漠の家・村作り")
    ).toBe("🏜️砂漠の家・村作り");
  });

  it("strips version tags", () => {
    expect(
      clean(
        "【Minecraft】🐚槍とオウムガイのアップデート🎊【りりまるマイクラサーバー/LiLimaru Server】【Bedrock/統合版1.21.130】"
      )
    ).toBe("🐚槍とオウムガイのアップデート🎊");
  });

  it("treats 🟣 inside a tag as a separator", () => {
    expect(
      clean("🚃鹿鉄道を見に行こう😱【マインクラフト統合版🟣Twitch配信】2026年8月11日")
    ).toBe("🚃鹿鉄道を見に行こう😱");
  });

  it("keeps a tag block that carries real content", () => {
    expect(clean("#24【マイクラ】🎊配信2周年！【Anniversary】2021年10月8日")).toBe(
      "#24 🎊配信2周年！【Anniversary】"
    );
  });

  it("keeps a tag block mixing boilerplate with an unknown token", () => {
    expect(clean("#53【マイクラ】🎂誕生日【HappyBirthday/Minecraft実況】")).toBe(
      "#53 🎂誕生日【HappyBirthday/Minecraft実況】"
    );
  });

  it("does not let an unbalanced 【 swallow the title", () => {
    // The uploader never closed the first bracket; only the inner tag goes.
    expect(
      clean("#43【マイクラ早くも次のウィザー戦の準備が！？【Minecraft実況】2021年11月15日")
    ).toBe("#43 【マイクラ早くも次のウィザー戦の準備が！？");
  });

  it("separates the episode number from the text it was flush against", () => {
    expect(clean("#5-1【マイクラ】💀ネザーへ！")).toBe("#5-1 💀ネザーへ！");
  });

  it("leaves an already-clean title alone", () => {
    expect(clean("🏠みんなの物件を内見です！")).toBe("🏠みんなの物件を内見です！");
  });

  it("falls back to the original rather than returning an empty title", () => {
    expect(clean("【マイクラ】2021年8月27日")).toBe("【マイクラ】2021年8月27日");
  });

  it("keeps site vocabulary out of the engine defaults", () => {
    // Without the site's vocab, りりまる村 is unknown and the block survives.
    expect(cleanVodTitle("🐟おいしい鮭【りりまる村/マイクラ実況】")).toBe(
      "🐟おいしい鮭【りりまる村/マイクラ実況】"
    );
  });
});
