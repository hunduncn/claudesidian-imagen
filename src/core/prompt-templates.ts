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

/**
 * Per-type preset library. Each type gets its own set of trending styles
 * curated for that platform's visual conventions. Keys are globally unique
 * across types so `getStylePreset(key)` can resolve without knowing the type.
 */
export const STYLE_PRESETS_BY_TYPE: Record<ImageType, StylePreset[]> = {
  "xhs-cover": [
    { key: "xhs-dopamine",       label: "多巴胺撞色",      descriptor: "dopamine color clash, saturated candy palette (hot pink + lime + electric blue), chunky bold sans-serif Chinese title, solid color blocks framing a cutout subject, high-energy Gen-Z pop poster" },
    { key: "xhs-maillard",       label: "美拉德焦糖",      descriptor: "Maillard brown palette, caramel coffee cream tones, moody autumn warm film grain, quiet luxury mood, espresso beige editorial" },
    { key: "xhs-y2k",            label: "Y2K 千禧辣妹",    descriptor: "Y2K chrome bubble typography, frosted glass sparkle, silver blue gradient, butterfly and star stickers, 2000s web aesthetic" },
    { key: "xhs-film-ambient",   label: "氛围感胶片",      descriptor: "35mm film grain lifestyle photo, hazy window light, centered Chinese title inside translucent soft-blur bar, effortless mood, Kodak Portra tones" },
    { key: "xhs-magazine-collage", label: "杂志拼贴",       descriptor: "magazine collage cutout, torn paper tape scribble, product knockout arrangement, scrapbook hand-annotated, zine layout" },
    { key: "xhs-new-chinese",    label: "新中式水墨",      descriptor: "new Chinese ink wash background, vermilion seal stamp, contemporary subject with classical brushstroke, rice paper texture, oriental minimalism" },
    { key: "xhs-sporty-barbie",  label: "运动芭比",        descriptor: "sporty Barbie hot pink, rhinestone sparkle and athletic tape stripes, glossy crop top flatlay, pink and gray color block, Gen-Z sportswear" },
    { key: "xhs-porcelain",      label: "清冷白瓷 (淡人)",  descriptor: "cool porcelain white minimalism, pale blue negative space, hairline serif Chinese title, single floating object, muted quiet aesthetic" },
    { key: "xhs-handwritten",    label: "手写便签",        descriptor: "handwritten marker notebook, kraft paper or cream background, highlighter swipes with doodled arrows, study notes sticker, bullet journal cover" },
    { key: "xhs-xpiritual",      label: "玄学赛博拼贴",    descriptor: "mystical tarot collage, halftone glitch occult, neon laser zodiac, post-internet spiritual, xpiritualism aesthetic" },
    { key: "xhs-oil-portrait",   label: "厚涂油画人像",    descriptor: "impasto oil painting portrait, visible brushstroke texture, Renaissance chiaroscuro lighting, painterly editorial cover, thick paint portrait with modern Chinese title overlay" },
    { key: "xhs-raw-snapshot",   label: "原相机生图",      descriptor: "raw iPhone flash snapshot, overexposed candid, unfiltered anti-aesthetic, real life crop, casual phone photo cover with one-line title" },
  ],
  "wechat-cover": [
    { key: "wc-hk-cinema",       label: "港风电影海报",    descriptor: "1980s Hong Kong cinema poster, neon sign tungsten halo, Wong Kar-wai film grain, vertical Chinese movie type on the side, retro Cantopop banner" },
    { key: "wc-chinese-landscape", label: "新中式山水",     descriptor: "minimalist Chinese landscape ink wash stretched across panoramic banner, wide gongbi line art, vast negative space reserved for restrained serif title, new Chinese editorial banner" },
    { key: "wc-swiss",           label: "瑞士极简排版",    descriptor: "Swiss International Typographic Style, grid layout, modern Chinese grotesque sans (思源黑体 style), single accent color bar, strict hierarchy, minimal typographic banner" },
    { key: "wc-memphis",         label: "孟菲斯撞色",      descriptor: "Memphis design geometric, squiggles and confetti dots, postmodern 80s pastel and primary colors, playful geometric banner, Memphis Milano style" },
    { key: "wc-risograph",       label: "Risograph 双色",  descriptor: "risograph two-color print, halftone misregistration, fluorescent pink and navy (or yellow and blue) overlay, paper fiber grain, riso zine banner" },
    { key: "wc-cinematic-photo", label: "胶片人文摄影",    descriptor: "cinematic 2.35 letterbox photograph, teal-orange film grade, documentary wide portrait, tiny corner typography, film photo essay banner" },
    { key: "wc-newsprint",       label: "复古报刊版式",    descriptor: "vintage newspaper masthead, yellowed newsprint texture, large serif 宋体 Chinese headline, column rule, ink-stamp date, broadsheet editorial layout" },
    { key: "wc-vaporwave-east",  label: "东方蒸汽波",      descriptor: "oriental vaporwave, mauve and cyan gradient with grid horizon, terracotta warrior or Buddha bust, Latin plus hanzi mix, Chinese vaporwave banner" },
    { key: "wc-maximalist",      label: "极繁主义拼贴",    descriptor: "maximalist editorial collage, layered halftone faces, torn paper stamped slogans, dense mixed media banner, anti-minimal magazine spread" },
    { key: "wc-liquid-chrome",   label: "液态金属",        descriptor: "liquid chrome 3D blob, studio HDRI reflection, single metallic hero object, soft gradient backdrop, Octane render banner" },
    { key: "wc-watercolor-essay", label: "水彩淡墨散文",   descriptor: "loose watercolor wash with soft bleed edges, pale indigo and sepia, hand-brush Chinese lettering, literary essay banner, soft ink wash editorial" },
    { key: "wc-terminal",        label: "极客终端",        descriptor: "dark charcoal terminal aesthetic, monospace code font, ASCII rules, blinking cursor accent, phosphor green highlights, developer blog banner" },
  ],
  "wechat-illust": [
    { key: "wi-naive-scribble",  label: "天真涂鸦",        descriptor: "naive childlike scribble illustration, wobbly hand-drawn line, crayon and marker texture, imperfect proportion, loose editorial doodle, anti-AI handmade feel" },
    { key: "wi-risograph",       label: "Risograph 印刷",  descriptor: "risograph editorial illustration, two-color halftone, misregistered ink overlay, rough paper texture, print zine illustration" },
    { key: "wi-mixed-collage",   label: "混合媒介拼贴",    descriptor: "mixed media editorial collage, photo cutouts with painted shapes, scanned textures and typography fragments, layered surreal composition, magazine collage illustration" },
    { key: "wi-painterly",       label: "厚涂油画编辑",    descriptor: "painterly editorial illustration, thick oil brushstroke, cinematic lighting on a single symbolic figure, New Yorker cover style, conceptual painted metaphor" },
    { key: "wi-blobby-gradient", label: "Blobby 液态渐变",  descriptor: "blobby gradient mesh illustration, bulbous organic shapes, smooth gradient blur, dreamy floating forms, liquid abstract editorial" },
    { key: "wi-2d-3d-hybrid",    label: "2D+3D 混合",      descriptor: "flat 2D vector characters interacting with Blender 3D props, hybrid-dimension illustration, soft ambient occlusion shadow, Spline isometric feel, conceptual 2D-3D composite" },
    { key: "wi-psychedelic",     label: "迷幻极繁",        descriptor: "1970s psychedelic maximalist, hyper-saturated swirls, kaleidoscopic surreal composition, dreamlike dense illustration, acid poster editorial" },
    { key: "wi-linocut",         label: "木刻版画",        descriptor: "linocut woodblock print illustration, bold carved black lines, gouge mark texture, folk craft editorial, reductive print illustration" },
    { key: "wi-gongbi-modern",   label: "新工笔叙事",      descriptor: "gongbi fine-line painting applied to modern scene, mineral pigment greens and vermilions, contemporary Chinese brush illustration, traditional-meets-modern oriental narrative" },
    { key: "wi-pixel-lofi",      label: "Lo-Fi 像素",      descriptor: "lo-fi pixel art scene, 16-bit dithered gradient, atmospheric moody pixel, chill editorial pixel illustration, retro game scene mood" },
    { key: "wi-papercut",        label: "剪纸民艺",        descriptor: "layered paper-cut silhouettes, bold positive-negative shape play, earthy folk palette, subtle drop shadow, Chinese papercut editorial" },
    { key: "wi-surreal-metaphor", label: "超现实单隐喻",   descriptor: "conceptual surreal single metaphor (one impossible object), muted editorial palette, cinematic soft light, op-ed illustration, minimalist surrealism" },
  ],
};

/** Flat list of all presets across all types. Consumed by the legacy /api/styles (no ?type filter). */
export const STYLE_PRESETS: StylePreset[] = ([] as StylePreset[]).concat(
  STYLE_PRESETS_BY_TYPE["xhs-cover"],
  STYLE_PRESETS_BY_TYPE["wechat-cover"],
  STYLE_PRESETS_BY_TYPE["wechat-illust"],
);

export function getStylePreset(key: string): StylePreset | undefined {
  return STYLE_PRESETS.find((s) => s.key === key);
}

export function getStylePresetsForType(type: ImageType): StylePreset[] {
  return STYLE_PRESETS_BY_TYPE[type];
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
