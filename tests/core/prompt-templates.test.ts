// tests/core/prompt-templates.test.ts
import { describe, test, expect } from "bun:test";
import {
  EXTRACT_SCHEMAS,
  STYLE_FAMILIES,
  buildExtractSystemPrompt,
  buildImagePrompt,
  buildSimpleImagePrompt,
  type ImageType,
  type ExtractedFields,
} from "../../src/core/prompt-templates.ts";

describe("EXTRACT_SCHEMAS", () => {
  test("defines a schema for each image type", () => {
    expect(EXTRACT_SCHEMAS["xhs-cover"]).toBeDefined();
    expect(EXTRACT_SCHEMAS["wechat-cover"]).toBeDefined();
    expect(EXTRACT_SCHEMAS["wechat-illust"]).toBeDefined();
  });

  test("xhs-cover schema includes title and visual fields", () => {
    const schema = EXTRACT_SCHEMAS["xhs-cover"];
    expect(schema.properties).toHaveProperty("title");
    expect(schema.properties).toHaveProperty("visual");
    expect(schema.properties).toHaveProperty("style");
  });

  test("wechat-illust schema does NOT include title (无文字)", () => {
    const schema = EXTRACT_SCHEMAS["wechat-illust"];
    expect(schema.properties).not.toHaveProperty("title");
    expect(schema.properties).toHaveProperty("visual");
  });
});

describe("buildExtractSystemPrompt", () => {
  test("includes type-specific guidance", () => {
    const prompt = buildExtractSystemPrompt("xhs-cover");
    expect(prompt).toContain("小红书");
    expect(prompt.toLowerCase()).toContain("json");
  });

  test("includes aspect ratio in xhs-cover prompt", () => {
    expect(buildExtractSystemPrompt("xhs-cover")).toContain("3:4");
  });

  test("includes aspect ratio in wechat-cover prompt", () => {
    expect(buildExtractSystemPrompt("wechat-cover")).toContain("2.35:1");
  });
});

describe("buildImagePrompt", () => {
  test("xhs-cover prompt embeds title and visual with bilingual aspect ratio", () => {
    const fields: ExtractedFields = {
      title: "猫咪剪指甲秘籍",
      subtitle: "新手3步法",
      visual: "可爱橘猫被温柔抱住",
      style: "扁平插画 莫兰迪色系",
    };
    const result = buildImagePrompt("xhs-cover", fields);
    expect(result).toContain("猫咪剪指甲秘籍");
    expect(result).toContain("新手3步法");
    expect(result).toContain("可爱橘猫被温柔抱住");
    expect(result).toContain("扁平插画");
    expect(result).toContain("3:4");
    expect(result.toLowerCase()).toContain("portrait");
    expect(result).toContain("1242");
  });

  test("wechat-illust prompt does not include any title text", () => {
    const fields: ExtractedFields = {
      visual: "山间晨雾",
      style: "水墨风",
    };
    const result = buildImagePrompt("wechat-illust", fields);
    expect(result).toContain("山间晨雾");
    expect(result).toContain("水墨风");
    expect(result).not.toContain("title");
  });
});

/* ─────────────────────────────────────────────────────────────────────────
 * Regression: Chinese-text guarantee.
 *
 * Several styles previously rendered the title text in English/pinyin
 * because their descriptors carried strong Latin-script priors (terminal
 * monospace, Memphis, vaporwave, magazine collage, cinematic letterbox).
 * Two-layer defense: (1) every title-bearing descriptor must carry an
 * explicit Chinese marker, and (2) buildSimpleImagePrompt appends a final
 * LANGUAGE LOCK clause for xhs-cover and wechat-cover.
 * ───────────────────────────────────────────────────────────────────────── */

const CHINESE_MARKER = /chinese|中文|宋体|黑体|思源|hanzi|cjk|han\s*characters/i;
const TITLED_TYPES: ImageType[] = ["xhs-cover", "wechat-cover"];

describe("Chinese-text guarantee (per-descriptor)", () => {
  for (const family of STYLE_FAMILIES) {
    for (const type of TITLED_TYPES) {
      const descriptor = family.descriptors[type];
      if (!descriptor) continue;
      test(`style "${family.key}" descriptor for ${type} mentions Chinese typography`, () => {
        expect(descriptor).toMatch(CHINESE_MARKER);
      });
    }
  }
});

describe("buildSimpleImagePrompt LANGUAGE LOCK", () => {
  const dummyPreset = {
    key: "test-preset",
    label: "测试",
    descriptor:
      "test descriptor with monospace code font, all-Latin typography, English-only signage",
  };

  test("xhs-cover output contains Simplified Chinese language lock with exact title", () => {
    const result = buildSimpleImagePrompt({
      type: "xhs-cover",
      articleTitle: "猫咪剪指甲秘籍",
      stylePreset: dummyPreset,
    });
    expect(result).toContain("Simplified Chinese");
    expect(result).toContain("简体中文");
    expect(result).toContain("猫咪剪指甲秘籍");
    expect(result).toMatch(/do not translate/i);
    expect(result).toMatch(/do not use pinyin/i);
  });

  test("wechat-cover output contains Simplified Chinese language lock", () => {
    const result = buildSimpleImagePrompt({
      type: "wechat-cover",
      articleTitle: "量化交易入门",
      stylePreset: dummyPreset,
    });
    expect(result).toContain("Simplified Chinese");
    expect(result).toContain("量化交易入门");
  });

  test("wechat-illust output does NOT contain language lock (no title)", () => {
    const result = buildSimpleImagePrompt({
      type: "wechat-illust",
      articleTitle: "山间晨雾",
      stylePreset: dummyPreset,
    });
    // No-text instruction is the only language directive; lock would conflict.
    expect(result).not.toContain("Simplified Chinese");
    expect(result).not.toContain("简体中文");
    expect(result.toLowerCase()).toContain("no text");
  });

  test("language lock appears AFTER style descriptor and extraPrompt (highest attention weight)", () => {
    const result = buildSimpleImagePrompt({
      type: "xhs-cover",
      articleTitle: "测试标题",
      stylePreset: dummyPreset,
      extraPrompt: "make it pop",
    });
    const styleIdx = result.indexOf("Art style:");
    const extraIdx = result.indexOf("Additional user instructions");
    const lockIdx = result.indexOf("Simplified Chinese");
    expect(styleIdx).toBeGreaterThanOrEqual(0);
    expect(extraIdx).toBeGreaterThan(styleIdx);
    expect(lockIdx).toBeGreaterThan(extraIdx);
  });
});
