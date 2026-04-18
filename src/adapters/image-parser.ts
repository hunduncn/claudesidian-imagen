// src/adapters/image-parser.ts
export type ParsedImage =
  | { kind: "url"; url: string }
  | { kind: "base64"; mimeType: string; base64: string }
  | { kind: "none"; raw: string };

const MARKDOWN_IMAGE_RE = /!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/;
const BARE_URL_RE = /(https?:\/\/[^\s]+\.(?:png|jpe?g|webp|gif))/i;
const DATA_URL_RE = /data:(image\/[a-zA-Z0-9+.-]+);base64,([A-Za-z0-9+/=]+)/;

/**
 * Extract an image reference from arbitrary text returned by an
 * OpenAI-compatible chat completion. Tries markdown image, then data URL,
 * then bare URL. Returns kind="none" when nothing matches.
 */
export function parseImageFromContent(content: string): ParsedImage {
  const md = content.match(MARKDOWN_IMAGE_RE);
  if (md) return { kind: "url", url: md[1]! };

  const data = content.match(DATA_URL_RE);
  if (data) return { kind: "base64", mimeType: data[1]!, base64: data[2]! };

  const bare = content.match(BARE_URL_RE);
  if (bare) return { kind: "url", url: bare[1]! };

  return { kind: "none", raw: content };
}
