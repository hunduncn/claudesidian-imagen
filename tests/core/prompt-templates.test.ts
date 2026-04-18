// tests/core/prompt-templates.test.ts
import { describe, test, expect } from "bun:test";
import {
  EXTRACT_SCHEMAS,
  buildExtractSystemPrompt,
  buildImagePrompt,
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
