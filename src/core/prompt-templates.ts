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
 * Simple flow: no LLM extract. User picks type + style family, server reads
 * the article directly and builds a strongly-typed prompt with article title
 * baked in. This is what the UI uses post-v0.2.
 *
 * Family architecture (v0.3+):
 *   A "family" is a visual identity that may span multiple image types. When
 *   a brand-type self-media account commits to e.g. 莫兰迪, they want xhs
 *   covers, 公众号 banners, AND inline illustrations to all read as the same
 *   brand. Each family declares which types it `supports` and carries a
 *   per-type `descriptor` tightened for that type's layout conventions.
 *
 *   Keys are globally unique. UI calls /api/styles?type=xxx to get families
 *   supporting that type only.
 *
 *   `StylePreset` is the legacy per-type shape. It is kept as the public
 *   return type of getStylePreset() so generate.ts / buildSimpleImagePrompt
 *   don't need to change. Internally we derive it from the family table.
 * ───────────────────────────────────────────────────────────────────────── */

export interface StylePreset {
  /** Stable key used by UI + persisted config. */
  key: string;
  /** 中文标签，用于下拉显示。 */
  label: string;
  /** Prompt 中使用的描述（英文为主，模型识别率高）。 */
  descriptor: string;
}

export interface StyleFamily {
  /** Stable key, globally unique across all families. */
  key: string;
  /** 中文标签，下拉显示用。 */
  label: string;
  /** Which image types this family provides a descriptor for. */
  supports: ImageType[];
  /**
   * Per-type rendered descriptor. A family MUST have an entry for every
   * type in `supports`. English-first (image models respond better), with
   * locked hex color values and typography direction where possible so
   * multiple generations feel like the same brand.
   */
  descriptors: Partial<Record<ImageType, string>>;
  /**
   * True for families intended as stable brand presets (daily driver for
   * brand-type self-media accounts). Drives UI hinting like ⭐.
   */
  brandReady?: boolean;
}

/**
 * Full family library. Organized as:
 *   1. Cross-type daily-driver families (brand-ready) — consistent across
 *      all three image types. These are the recommended picks for anyone
 *      building a stable visual identity.
 *   2. Cross-type aesthetic families — a trending look consistent across
 *      two or three types.
 *   3. Type-locked families — platform-specific trending styles that only
 *      make sense in one context (e.g. Y2K辣妹 is xhs-native).
 */
export const STYLE_FAMILIES: StyleFamily[] = [
  // ─── brand-ready daily drivers (cross-type) ─────────────────────────────
  {
    key: "business-clean",
    label: "商务简洁 ⭐",
    supports: ["xhs-cover", "wechat-cover", "wechat-illust"],
    brandReady: true,
    descriptors: {
      "xhs-cover":
        "business clean minimalism, pure white background (#FFFFFF) with navy accent (#1F3A5F) and muted slate gray, centered modern Chinese sans-serif title in bold weight, single authoritative product or abstract icon shot, generous negative space, corporate trust aesthetic, no decorative noise",
      "wechat-cover":
        "business clean banner, pure white (#FFFFFF) with navy (#1F3A5F) accent bar, restrained modern sans-serif Chinese headline left-aligned, single clean object on right, thin hairline rule divider, editorial corporate masthead, strictly no clutter",
      "wechat-illust":
        "business clean editorial illustration, flat minimal geometric composition, navy (#1F3A5F) + muted slate gray + single warm accent (#D4A373), clean vector linework, single conceptual metaphor, negative-space-heavy, corporate-report illustration, no text",
    },
  },
  {
    key: "editorial-minimal",
    label: "编辑极简 ⭐",
    supports: ["xhs-cover", "wechat-cover", "wechat-illust"],
    brandReady: true,
    descriptors: {
      "xhs-cover":
        "editorial minimal magazine cover, off-white paper background (#F4F1EC), deep charcoal text (#2A2A2A) with a thin hairline serif title (思源宋体 / Noto Serif CJK), one small tasteful photo or illustration anchor, vast margin, restrained Kinfolk-style quiet luxury, Japan-magazine editorial feel",
      "wechat-cover":
        "editorial minimal masthead banner, off-white paper (#F4F1EC), deep charcoal (#2A2A2A) hairline serif title (宋体 style) small and elegant, thin horizontal rule, one lifestyle black-and-white photograph on one side, vast negative space, Kinfolk editorial banner",
      "wechat-illust":
        "editorial minimal illustration, off-white paper (#F4F1EC) + deep charcoal line (#2A2A2A) + single sage or terracotta accent, single understated pen-and-ink drawing or black-and-white photo, quiet Kinfolk-style composition, lots of negative space, no text",
    },
  },
  {
    key: "knowledge-blogger",
    label: "知识博主 ⭐",
    supports: ["xhs-cover", "wechat-cover", "wechat-illust"],
    brandReady: true,
    descriptors: {
      "xhs-cover":
        "knowledge blogger infographic cover, cream or light gray background (#F5F1E8), bold modern Chinese sans-serif title with one highlight-colored keyword (mustard #E8B83B), small simple diagram element (arrow / bracket / checklist dot), clean and legible, 'study notes' trustworthy tone",
      "wechat-cover":
        "knowledge blogger banner, cream background (#F5F1E8), bold modern sans-serif Chinese headline left side with one mustard (#E8B83B) highlight bar, small icon or diagram on right, clean pedagogical masthead, study-notes credibility",
      "wechat-illust":
        "knowledge blogger diagram illustration, cream (#F5F1E8) + charcoal stroke (#2A2A2A) + mustard accent (#E8B83B), clean flat vector infographic style, single conceptual schematic (flow arrow / venn / bracket), pedagogical clarity, no dense text labels",
    },
  },

  // ─── cross-type aesthetic families ──────────────────────────────────────
  {
    key: "morandi",
    label: "莫兰迪",
    supports: ["xhs-cover", "wechat-cover", "wechat-illust"],
    descriptors: {
      "xhs-cover":
        "Morandi muted palette (dusty sage #B7B39E, pale clay #C8A98A, foggy blue #9DA6A8, cream #E8E1D3), chalky matte texture, hairline modern Chinese sans or thin serif title centered, single quiet still-life object, painterly restraint, quiet luxury",
      "wechat-cover":
        "Morandi muted palette banner (dusty sage #B7B39E, pale clay #C8A98A, foggy blue #9DA6A8), chalky matte finish, thin serif Chinese title left-aligned with generous margin, one quiet still-life object on the right, painterly editorial calm",
      "wechat-illust":
        "Morandi palette painterly illustration (dusty sage #B7B39E, pale clay #C8A98A, foggy blue #9DA6A8, cream #E8E1D3), soft chalky matte brushwork, single quiet symbolic object or figure, gentle gradient background, painterly editorial calm, no text",
    },
  },
  {
    key: "new-chinese",
    label: "新中式水墨",
    supports: ["xhs-cover", "wechat-cover", "wechat-illust"],
    descriptors: {
      "xhs-cover":
        "new Chinese ink wash (水墨) aesthetic, rice paper texture (#EFE7D6) background with soft sumi ink bleed, vermilion (#C8372D) seal stamp accent, restrained serif Chinese title (宋体) vertical or centered, one classical brushstroke subject, oriental minimalism",
      "wechat-cover":
        "new Chinese landscape ink-wash banner, rice paper background (#EFE7D6), soft sumi ink wash stretched across panoramic strip, gongbi fine-line mountain silhouettes, vast negative space, restrained serif (宋体) Chinese title on one side, vermilion (#C8372D) seal stamp",
      "wechat-illust":
        "new Chinese gongbi fine-line illustration, rice paper (#EFE7D6) background, mineral pigment vermilion (#C8372D) and sage green (#5A6E4D) accents, soft sumi ink wash, single classical-meets-modern subject, traditional Chinese brush editorial, no text",
    },
  },
  {
    key: "film-cinematic",
    label: "胶片电影感",
    supports: ["xhs-cover", "wechat-cover", "wechat-illust"],
    descriptors: {
      "xhs-cover":
        "35mm film grain lifestyle photo, Kodak Portra tones (warm skin, muted teal shadows), hazy window light, shallow depth of field, centered modern Chinese title inside a translucent soft-blur bar, effortless mood, analog film aesthetic",
      "wechat-cover":
        "cinematic 2.35 letterbox photograph, teal-orange film grade, subtle 35mm grain, documentary wide composition, tiny restrained corner typography, film photo essay banner, no heavy titles",
      "wechat-illust":
        "cinematic film-still illustration, teal-orange film grade with 35mm grain, shallow depth of field, single cinematic moment, soft window light, editorial film-photograph feel, no text",
    },
  },
  {
    key: "risograph",
    label: "Risograph 双色印刷",
    supports: ["xhs-cover", "wechat-cover", "wechat-illust"],
    descriptors: {
      "xhs-cover":
        "risograph two-color print, fluorescent pink (#FF3D7F) and navy (#1F2E6D) with halftone misregistration, rough paper fiber grain (#F5F0E6), chunky Chinese sans-serif title, zine cover aesthetic",
      "wechat-cover":
        "risograph two-color print banner, fluorescent pink (#FF3D7F) and navy (#1F2E6D) or yellow and blue overlay, halftone misregistration, paper fiber grain, chunky Chinese title left-aligned, print zine banner",
      "wechat-illust":
        "risograph editorial illustration, two-color halftone in fluorescent pink (#FF3D7F) and navy (#1F2E6D), misregistered ink overlay, rough paper texture, single conceptual figure or object, print zine illustration, no text",
    },
  },
  {
    key: "oil-painterly",
    label: "厚涂油画",
    supports: ["xhs-cover", "wechat-cover", "wechat-illust"],
    descriptors: {
      "xhs-cover":
        "impasto oil painting portrait, visible thick brushstroke texture, Renaissance chiaroscuro lighting on a single figure, warm burgundy and ochre palette, modern Chinese title overlay in restrained serif, painterly editorial cover",
      "wechat-cover":
        "painterly oil banner, wide panoramic oil-on-canvas scene, visible brushstroke texture, chiaroscuro warm palette (burgundy + ochre + deep teal shadow), single symbolic figure or still-life, restrained serif Chinese title in corner",
      "wechat-illust":
        "painterly editorial illustration, thick oil brushstroke, cinematic chiaroscuro lighting on a single symbolic figure, New Yorker cover style, burgundy-ochre-teal palette, conceptual painted metaphor, no text",
    },
  },
  {
    key: "magazine-collage",
    label: "杂志拼贴",
    supports: ["xhs-cover", "wechat-cover", "wechat-illust"],
    descriptors: {
      "xhs-cover":
        "magazine collage cutout cover, torn paper edges with scotch tape, photo knockouts, handwritten marker scribbles and highlighter accents, cream kraft background (#E8DFC8), chunky display Chinese title pasted, scrapbook zine layout",
      "wechat-cover":
        "maximalist editorial collage banner, layered halftone faces, torn paper stamped slogans, handwritten annotations, cream kraft (#E8DFC8) background, dense mixed-media banner, anti-minimal magazine spread",
      "wechat-illust":
        "mixed media editorial collage illustration, photo cutouts combined with painted shapes, scanned paper textures and typography fragments, layered surreal composition, cream kraft (#E8DFC8) ground, magazine-collage editorial, no added text",
    },
  },

  // ─── xhs-locked families ────────────────────────────────────────────────
  {
    key: "xhs-dopamine",
    label: "多巴胺撞色",
    supports: ["xhs-cover"],
    descriptors: {
      "xhs-cover":
        "dopamine color clash, saturated candy palette (hot pink #FF3D7F + lime #B8E12A + electric blue #2A9DF4), chunky bold Chinese sans-serif title, solid color blocks framing a cutout subject, high-energy Gen-Z pop poster",
    },
  },
  {
    key: "xhs-maillard",
    label: "美拉德焦糖",
    supports: ["xhs-cover"],
    descriptors: {
      "xhs-cover":
        "Maillard brown palette (caramel #B07A4A, espresso #4A2E1F, cream #E6D4B8), moody autumn warm film grain, quiet luxury mood, hairline serif Chinese title, single still-life object, espresso beige editorial",
    },
  },
  {
    key: "xhs-y2k",
    label: "Y2K 千禧辣妹",
    supports: ["xhs-cover"],
    descriptors: {
      "xhs-cover":
        "Y2K chrome bubble typography, frosted glass sparkle, silver-blue gradient (#B8D4E8 → #6F8FAE), butterfly and star stickers, 2000s web aesthetic, glossy bubble Chinese title",
    },
  },
  {
    key: "xhs-sporty-barbie",
    label: "运动芭比",
    supports: ["xhs-cover"],
    descriptors: {
      "xhs-cover":
        "sporty Barbie hot pink (#FF4FA3), rhinestone sparkle and athletic tape stripes, glossy crop top flatlay, pink and warm gray color block, Gen-Z sportswear poster, bold modern Chinese title",
    },
  },
  {
    key: "xhs-porcelain",
    label: "清冷白瓷（淡人）",
    supports: ["xhs-cover"],
    descriptors: {
      "xhs-cover":
        "cool porcelain white minimalism, off-white (#F6F8F9) with pale icy blue accent (#D9E4EC), hairline thin serif Chinese title, single floating object (porcelain cup / lily), muted quiet 淡人 aesthetic, generous negative space",
    },
  },
  {
    key: "xhs-handwritten",
    label: "手写便签",
    supports: ["xhs-cover"],
    descriptors: {
      "xhs-cover":
        "handwritten marker notebook cover, kraft paper (#D8C9A8) or cream background, yellow highlighter swipes with doodled arrows, stuck-on study note stickers, hand-lettered Chinese title, bullet journal aesthetic",
    },
  },
  {
    key: "xhs-xpiritual",
    label: "玄学赛博拼贴",
    supports: ["xhs-cover"],
    descriptors: {
      "xhs-cover":
        "mystical tarot collage, halftone glitch occult imagery, neon laser (#FF3DCB) zodiac overlays on navy (#1A1140), post-internet spiritual xpiritualism aesthetic, layered cutouts, glitchy Chinese title",
    },
  },
  {
    key: "xhs-raw-snapshot",
    label: "原相机生图",
    supports: ["xhs-cover"],
    descriptors: {
      "xhs-cover":
        "raw iPhone flash snapshot, slightly overexposed candid, unfiltered anti-aesthetic, real-life crop with mundane everyday subject, casual phone-photo cover, single plain Chinese title line bottom-center, deliberately 'no-effort' look",
    },
  },

  // ─── wechat-cover-locked families ───────────────────────────────────────
  {
    key: "wc-hk-cinema",
    label: "港风电影海报",
    supports: ["wechat-cover"],
    descriptors: {
      // Intentionally no named director — safety classifiers refuse real-person
      // references. The aesthetic is evoked through palette + grain + city motif.
      "wechat-cover":
        "1980s Hong Kong cinema poster banner, neon sign tungsten halo (#FFC866 glow + teal #1F6F6F shadow), moody rainy-street film grain, vertical Chinese movie-title type on the side, retro Cantopop-era urban masthead",
    },
  },
  {
    key: "wc-swiss",
    label: "瑞士极简排版",
    supports: ["wechat-cover"],
    descriptors: {
      "wechat-cover":
        "Swiss International Typographic Style banner, grid layout, modern Chinese grotesque sans (思源黑体 style), single red (#D83B2A) accent bar, strict left-aligned hierarchy, minimal typographic masthead",
    },
  },
  {
    key: "wc-memphis",
    label: "孟菲斯撞色",
    supports: ["wechat-cover"],
    descriptors: {
      "wechat-cover":
        "Memphis design geometric banner, squiggles and confetti dots, postmodern 80s palette (peach #F7A072 + mint #A4D4BB + primary blue #2F58CD), playful pattern banner, Memphis Milano style",
    },
  },
  {
    key: "wc-newsprint",
    label: "复古报刊版式",
    supports: ["wechat-cover"],
    descriptors: {
      "wechat-cover":
        "vintage newspaper masthead, yellowed newsprint texture (#EBE2C8), large serif 宋体 Chinese headline, column rule dividers, ink-stamp date, broadsheet editorial layout",
    },
  },
  {
    key: "wc-vaporwave-east",
    label: "东方蒸汽波",
    supports: ["wechat-cover"],
    descriptors: {
      // Swapped terracotta warrior / Buddha (military + religious — both trigger
      // safety) for neutral classical-sculpture motifs that read the same way.
      "wechat-cover":
        "oriental vaporwave banner, mauve (#9C6DB5) and cyan (#4FC6D9) gradient with grid horizon, plaster greek-column or abstract ancient stone sculpture silhouette, Latin + hanzi mix typography, Chinese vaporwave masthead",
    },
  },
  {
    key: "wc-liquid-chrome",
    label: "液态金属",
    supports: ["wechat-cover"],
    descriptors: {
      "wechat-cover":
        "liquid chrome 3D blob banner, studio HDRI reflection, single metallic hero object centered, soft gradient backdrop (pearl gray → lavender), Octane render aesthetic, tiny restrained Chinese title",
    },
  },
  {
    key: "wc-watercolor-essay",
    label: "水彩淡墨散文",
    supports: ["wechat-cover"],
    descriptors: {
      "wechat-cover":
        "loose watercolor wash with soft bleed edges, pale indigo (#6F8BAE) and sepia (#B08968) on cream paper, hand-brush Chinese lettering, literary essay banner, soft ink-wash editorial",
    },
  },
  {
    key: "wc-terminal",
    label: "极客终端",
    supports: ["wechat-cover"],
    descriptors: {
      "wechat-cover":
        "dark charcoal terminal banner (#1C1F26 background), monospace code font, ASCII rule dividers, blinking cursor accent, phosphor green (#39FF14) highlights, developer-blog masthead",
    },
  },

  // ─── wechat-illust-locked families ──────────────────────────────────────
  {
    key: "wi-naive-scribble",
    label: "天真涂鸦",
    supports: ["wechat-illust"],
    descriptors: {
      "wechat-illust":
        "naive childlike scribble illustration, wobbly hand-drawn line, crayon and marker texture on cream paper (#F1EADA), imperfect proportion, loose editorial doodle, anti-AI handmade feel, no text",
    },
  },
  {
    key: "wi-blobby-gradient",
    label: "Blobby 液态渐变",
    supports: ["wechat-illust"],
    descriptors: {
      "wechat-illust":
        "blobby gradient mesh illustration, bulbous organic shapes in pastel gradients (lilac → peach → mint), smooth gradient blur, dreamy floating forms, liquid abstract editorial, no text",
    },
  },
  {
    key: "wi-2d-3d-hybrid",
    label: "2D+3D 混合",
    supports: ["wechat-illust"],
    descriptors: {
      "wechat-illust":
        "flat 2D vector characters interacting with Blender 3D props, hybrid-dimension illustration, soft ambient occlusion shadow on cream ground, Spline isometric feel, pastel palette, conceptual 2D-3D composite, no text",
    },
  },
  {
    key: "wi-psychedelic",
    label: "迷幻极繁",
    supports: ["wechat-illust"],
    descriptors: {
      "wechat-illust":
        "1970s psychedelic maximalist illustration, hyper-saturated swirls (magenta + orange + violet), kaleidoscopic surreal composition, dreamlike dense imagery, acid poster editorial, no text",
    },
  },
  {
    key: "wi-linocut",
    label: "木刻版画",
    supports: ["wechat-illust"],
    descriptors: {
      "wechat-illust":
        "linocut woodblock print illustration, bold carved black lines (#111111) on cream paper (#EEE6D0), gouge-mark texture, folk craft editorial, reductive print illustration, no text",
    },
  },
  {
    key: "wi-pixel-lofi",
    label: "Lo-Fi 像素",
    supports: ["wechat-illust"],
    descriptors: {
      "wechat-illust":
        "lo-fi pixel art scene, 16-bit dithered gradient, atmospheric moody pixel scene in dusk purple + soft orange, chill editorial pixel illustration, retro game scene mood, no text",
    },
  },
  {
    key: "wi-papercut",
    label: "剪纸民艺",
    supports: ["wechat-illust"],
    descriptors: {
      "wechat-illust":
        "layered paper-cut silhouettes, bold positive-negative shape play, earthy folk palette (vermilion + indigo + kraft), subtle drop shadow, Chinese papercut editorial illustration, no text",
    },
  },
  {
    key: "wi-surreal-metaphor",
    label: "超现实单隐喻",
    supports: ["wechat-illust"],
    descriptors: {
      "wechat-illust":
        "conceptual surreal single metaphor (one impossible object), muted editorial palette (dusty blue + bone + rust), cinematic soft light, op-ed illustration, minimalist surrealism, no text",
    },
  },
];

/** Look up a family by key (global). */
export function getStyleFamily(key: string): StyleFamily | undefined {
  return STYLE_FAMILIES.find((f) => f.key === key);
}

/** Families that support a given image type (drives the /api/styles UI list). */
export function getStyleFamiliesForType(type: ImageType): StyleFamily[] {
  return STYLE_FAMILIES.filter((f) => f.supports.includes(type));
}

/**
 * Resolve a family key + type to a flat StylePreset shape. Returns undefined
 * if the family doesn't support the type, or the key is unknown. Kept as the
 * primary lookup used by /api/generate because the image-prompt builder only
 * needs {key, label, descriptor}.
 */
export function getStylePresetForType(key: string, type: ImageType): StylePreset | undefined {
  const fam = getStyleFamily(key);
  if (!fam) return undefined;
  const descriptor = fam.descriptors[type];
  if (!descriptor) return undefined;
  return { key: fam.key, label: fam.label, descriptor };
}

/**
 * Back-compat: resolve a key to *some* preset without knowing the type.
 * Picks the first type the family supports. Kept so legacy /api/styles (no
 * ?type filter) and any older tests keep working.
 */
export function getStylePreset(key: string): StylePreset | undefined {
  const fam = getStyleFamily(key);
  if (!fam) return undefined;
  const firstType = fam.supports[0];
  if (!firstType) return undefined;
  const descriptor = fam.descriptors[firstType];
  if (!descriptor) return undefined;
  return { key: fam.key, label: fam.label, descriptor };
}

/** Back-compat: flat list of "one preset per family" for the legacy /api/styles. */
export const STYLE_PRESETS: StylePreset[] = STYLE_FAMILIES.map((f) => {
  const firstType = f.supports[0]!;
  return { key: f.key, label: f.label, descriptor: f.descriptors[firstType]! };
});

/** Back-compat: group families by the types they support, returned as presets. */
export const STYLE_PRESETS_BY_TYPE: Record<ImageType, StylePreset[]> = {
  "xhs-cover": getStyleFamiliesForType("xhs-cover").map((f) => ({
    key: f.key,
    label: f.label,
    descriptor: f.descriptors["xhs-cover"]!,
  })),
  "wechat-cover": getStyleFamiliesForType("wechat-cover").map((f) => ({
    key: f.key,
    label: f.label,
    descriptor: f.descriptors["wechat-cover"]!,
  })),
  "wechat-illust": getStyleFamiliesForType("wechat-illust").map((f) => ({
    key: f.key,
    label: f.label,
    descriptor: f.descriptors["wechat-illust"]!,
  })),
};

/** Back-compat alias used by generate.ts. */
export function getStylePresetsForType(type: ImageType): StylePreset[] {
  return STYLE_PRESETS_BY_TYPE[type];
}

export interface SimplePromptInput {
  type: ImageType;
  /** From filename (without .md) or first H1. */
  articleTitle: string;
  /**
   * @deprecated Retained for back-compat only. The raw article body used to
   * be injected as "thematic context", but that caused two problems:
   *   1. The first N chars of body are not a summary; they're boilerplate
   *      + specific details (amounts, names, conflict vocabulary) that were
   *      never meant to be drawn.
   *   2. The safety classifier can't distinguish "do-not-render context"
   *      from "main subject", so sensitive article text triggered refusals.
   * The build no longer uses this field. Callers should omit it.
   */
  articleExcerpt?: string;
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

/**
 * Short, AFFIRMATIVE framing only. Earlier versions of this string listed
 * categories to avoid (real people / political figures / religious figures /
 * military imagery / brand logos) — this backfired badly: Gemini's safety
 * classifier does not parse negation; it pattern-matches the sensitive-topic
 * vocabulary even when it's wrapped in "do not depict". The blacklist-style
 * preamble was itself triggering refusals. Describe what we WANT only.
 */
const SAFETY_PREAMBLE =
  "Keep the composition calm, tasteful, and professional. Suitable for a family-friendly editorial publication.";

export function buildSimpleImagePrompt(input: SimplePromptInput): string {
  const { type, articleTitle, stylePreset, extraPrompt } = input;
  const aspect = ASPECT[type];
  const lines: string[] = [SAFETY_PREAMBLE];

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
        // Nudge toward low-risk subject types. Figurative humans drive most
        // safety refusals; still life / landscape / pattern almost never do.
        "Composition: prefer still-life objects, landscape, abstract geometry, or patterns over human figures. Single calm editorial visual, suitable to sit between paragraphs of body text.",
      );
      break;
  }

  lines.push(`Art style: ${stylePreset.descriptor}.`);
  // NOTE: We deliberately do NOT inject the raw article body here. Passing
  // the article's first ~600 chars as "thematic context" caused widespread
  // safety-classifier refusals on articles involving disputes, finance, or
  // named parties — those words entered the prompt even though we asked
  // the model not to render them. The user-controlled `extraPrompt` field
  // below is now the only way to add thematic direction; the user applies
  // their own judgment on what's safe to pass.

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
