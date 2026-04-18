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

/* ─────────────────────────────────────────────────────────────────────────
 * Simple flow: no LLM extract. User picks type + style preset, server reads
 * the article directly and builds a strongly-typed prompt with article title
 * baked in. This is what the UI uses post-v0.2.
 * ───────────────────────────────────────────────────────────────────────── */

export interface StylePreset {
  /** Stable key used by UI + persisted config. */
  key: string;
  /** 中文标签，用于下拉显示。 */
  label: string;
  /** Prompt 中使用的描述（英文为主，模型识别率高）。 */
  descriptor: string;
}

export const STYLE_PRESETS: StylePreset[] = [
  { key: "xhs-vibrant",       label: "小红书撞色",  descriptor: "Xiaohongshu trending cover style, vibrant contrasting colors, bold large Chinese typography, lifestyle vibe, eye-catching" },
  { key: "flat-illustration", label: "扁平插画",    descriptor: "flat vector illustration, clean geometric shapes, bold flat colors, minimal shading, modern editorial feel" },
  { key: "morandi",           label: "莫兰迪色系",  descriptor: "Morandi muted color palette, soft dusty tones (sage, dusty pink, warm gray), elegant restrained atmosphere" },
  { key: "watercolor",        label: "手绘水彩",    descriptor: "hand-painted watercolor, soft wet brush strokes, translucent pigment bleeds, paper grain texture" },
  { key: "japanese-fresh",    label: "日系小清新",  descriptor: "Japanese soft fresh style, pastel sakura palette, gentle atmosphere, delicate details, light and airy" },
  { key: "3d-cartoon",        label: "3D 卡通渲染", descriptor: "3D cartoon render, Pixar-style soft lighting, rounded volumes, subtle ambient occlusion, plastic/clay materials" },
  { key: "cyberpunk",         label: "赛博朋克",    descriptor: "cyberpunk aesthetic, neon pink and cyan rim lighting, dark moody urban atmosphere, futuristic Asian city" },
  { key: "minimal-line",      label: "极简线条",    descriptor: "minimal line-art, single-color thin strokes on clean background, lots of white space, geometric simplicity" },
  { key: "chinese-ink",       label: "国风水墨",    descriptor: "traditional Chinese ink wash painting, flowing black ink on rice paper, misty mountains, calligraphic strokes" },
  { key: "retro-film",        label: "复古胶片",    descriptor: "retro 70s/80s film photography, warm grain, faded color grade, nostalgic mood, light leaks" },
  { key: "futuristic-tech",   label: "未来科技",    descriptor: "futuristic high-tech style, holographic UI elements, blue/white cool palette, sci-fi clean lines" },
  { key: "business-clean",    label: "商务简洁",    descriptor: "corporate clean design, minimal geometric composition, navy/gray palette, professional editorial tone" },
];

export function getStylePreset(key: string): StylePreset | undefined {
  return STYLE_PRESETS.find((s) => s.key === key);
}

export interface SimplePromptInput {
  type: ImageType;
  /** From filename (without .md) or first H1. */
  articleTitle: string;
  /** First ~600 chars of article body, used for thematic grounding. */
  articleExcerpt: string;
  stylePreset: StylePreset;
  /** Optional extra instructions from user. */
  extraPrompt?: string;
}

/** Extract a human-friendly title from a markdown file. First H1 wins, else filename. */
export function deriveArticleTitle(markdown: string, filenameNoExt: string): string {
  // Skip YAML frontmatter
  let body = markdown;
  if (body.startsWith("---\n")) {
    const end = body.indexOf("\n---", 4);
    if (end >= 0) body = body.slice(end + 4);
  }
  const m = body.match(/^#\s+(.+?)\s*$/m);
  if (m && m[1]) return m[1].trim();
  return filenameNoExt;
}

/** Strip YAML frontmatter and grab the first `limit` characters of body. */
export function deriveArticleExcerpt(markdown: string, limit = 600): string {
  let body = markdown;
  if (body.startsWith("---\n")) {
    const end = body.indexOf("\n---", 4);
    if (end >= 0) body = body.slice(end + 4).trimStart();
  }
  return body.slice(0, limit);
}

export function buildSimpleImagePrompt(input: SimplePromptInput): string {
  const { type, articleTitle, articleExcerpt, stylePreset, extraPrompt } = input;
  const aspect = ASPECT[type];
  const lines: string[] = [];

  switch (type) {
    case "xhs-cover":
      lines.push(
        `Create a Xiaohongshu (小红书 / Little Red Book) cover image in PORTRAIT 3:4 aspect ratio (${aspect.pixels} pixels, vertical — taller than wide).`,
        "Composition: prominent eye-catching Chinese title text as the focal point (top or center), vibrant lifestyle visual behind it, strong hook feel typical of viral xhs covers.",
        `Title text MUST appear in the image, clearly rendered in large bold modern Chinese font, no typos: 「${articleTitle}」`,
        "Title may include one subtle emoji accent for energy. Do NOT render any other long passages of text.",
      );
      break;
    case "wechat-cover":
      lines.push(
        `Create a WeChat Official Account article HEADER BANNER in ULTRA-WIDE 2.35:1 aspect ratio (${aspect.pixels} pixels — very wide, short horizontal strip like a movie banner).`,
        "Composition: a wide horizontal scene with refined typography and a single clear visual focal point. NOT a vertical portrait, NOT a square — strictly wide-screen banner proportions.",
        `Title text clearly rendered, professional editorial typography, no typos: 「${articleTitle}」`,
        "Title should be elegant and restrained, smaller than a Xiaohongshu cover — think magazine masthead, not social poster.",
      );
      break;
    case "wechat-illust":
      lines.push(
        `Create a WeChat Official Account inline ARTICLE ILLUSTRATION in LANDSCAPE 16:9 aspect ratio (${aspect.pixels} pixels, horizontal).`,
        "NO text, NO letters, NO Chinese characters in the image — pure visual illustration only.",
        "Composition: a single clear visual metaphor representing the article's core theme, suitable to sit between paragraphs of body text.",
      );
      break;
  }

  lines.push(`Art style: ${stylePreset.descriptor}.`);
  lines.push(`Article thematic context (for grounding — do NOT render any of this text into the image): ${articleExcerpt.slice(0, 600)}`);

  if (extraPrompt && extraPrompt.trim()) {
    lines.push(`Additional user instructions: ${extraPrompt.trim()}`);
  }

  return lines.join("\n");
}

/* ─────────────────────────────────────────────────────────────────────────
 * Legacy flow (kept for backward compat with existing tests).
 * ───────────────────────────────────────────────────────────────────────── */

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
