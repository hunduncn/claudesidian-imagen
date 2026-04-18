// src/core/prompt-templates.ts
import type { ImageType } from "./path-resolver.ts";
export type { ImageType };

export interface ExtractedFields {
  title?: string;
  subtitle?: string;
  visual: string;
  style: string;
}

type JsonSchemaPrimitive = "string" | "number" | "integer" | "boolean";

interface JsonSchema {
  type: "object";
  required: string[];
  properties: Record<string, { type: JsonSchemaPrimitive; description: string }>;
}

export const EXTRACT_SCHEMAS: Record<ImageType, JsonSchema> = {
  "xhs-cover": {
    type: "object",
    required: ["title", "visual", "style"],
    properties: {
      title: { type: "string", description: "封面主标题，10-15字，要有钩子，可带 emoji" },
      subtitle: { type: "string", description: "副标题，可选，5-10字" },
      visual: { type: "string", description: "主视觉内容描述，30-60字" },
      style: { type: "string", description: "风格关键词，如：扁平插画 / 莫兰迪色系 / 手绘风" },
    },
  },
  "wechat-cover": {
    type: "object",
    required: ["title", "visual", "style"],
    properties: {
      title: { type: "string", description: "封面主标题，简洁有力，8-12字" },
      subtitle: { type: "string", description: "副标题，可选" },
      visual: { type: "string", description: "主视觉内容描述" },
      style: { type: "string", description: "风格关键词" },
    },
  },
  "wechat-illust": {
    type: "object",
    required: ["visual", "style"],
    properties: {
      visual: { type: "string", description: "插图主视觉内容，无任何文字" },
      style: { type: "string", description: "风格关键词" },
    },
  },
};

interface AspectSpec {
  ratio: string;
  english: string;
  pixels: string;
}

const ASPECT: Record<ImageType, AspectSpec> = {
  "xhs-cover": { ratio: "3:4", english: "portrait 3:4", pixels: "1242x1660" },
  "wechat-cover": { ratio: "2.35:1", english: "ultra-wide 2.35:1", pixels: "900x383" },
  "wechat-illust": { ratio: "16:9", english: "landscape 16:9", pixels: "1280x720" },
};

function typeGuidance(type: ImageType): string {
  const r = ASPECT[type].ratio;
  switch (type) {
    case "xhs-cover":
      return `你正在为小红书封面提取要素。小红书爆款封面特点：大字标题、有钩子、emoji 点缀、${r} 竖版构图。`;
    case "wechat-cover":
      return `你正在为公众号封面提取要素。公众号封面是 ${r} 横版宽幅，标题简洁、视觉冲击。`;
    case "wechat-illust":
      return "你正在为公众号正文插图提取要素。插图不需要任何文字，纯视觉表达文章核心意象。";
  }
}

export function buildExtractSystemPrompt(type: ImageType): string {
  const schema = EXTRACT_SCHEMAS[type];
  return [
    "你是一名图文设计助手，从用户提供的 Markdown 文章中提取结构化的生图字段。",
    typeGuidance(type),
    "请只输出符合下述 JSON Schema 的 JSON 对象，不要任何额外说明文字。",
    "",
    "JSON Schema:",
    JSON.stringify(schema, null, 2),
  ].join("\n");
}

export function buildImagePrompt(type: ImageType, fields: ExtractedFields): string {
  const aspect = ASPECT[type];
  const aspectLine = `画面比例：${aspect.ratio}（${aspect.english}, ${aspect.pixels} pixels）。`;

  if (type === "wechat-illust") {
    return [
      `风格：${fields.style}。`,
      `主视觉：${fields.visual}。`,
      aspectLine,
      "图中不要包含任何文字（no text in image, no letters, no characters）。",
    ].join("\n");
  }

  // xhs-cover / wechat-cover: include title text
  const titleLine = fields.title ? `主标题文字（必须出现在图中，准确无误）：「${fields.title}」` : "";
  const subtitleLine = fields.subtitle ? `副标题文字：「${fields.subtitle}」` : "";

  return [
    `风格：${fields.style}。`,
    `主视觉：${fields.visual}。`,
    titleLine,
    subtitleLine,
    aspectLine,
    "重要：标题文字必须清晰渲染、无错别字、字号醒目，使用现代简洁中文字体。",
  ]
    .filter(Boolean)
    .join("\n");
}
