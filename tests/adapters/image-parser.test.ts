// tests/adapters/image-parser.test.ts
import { describe, test, expect } from "bun:test";
import { parseImageFromContent, type ParsedImage } from "../../src/adapters/image-parser.ts";

describe("parseImageFromContent", () => {
  test("parses a markdown image with https URL", () => {
    const content = "Here you go: ![](https://cdn.example.com/abc.png)";
    const result = parseImageFromContent(content);
    expect(result).toEqual({ kind: "url", url: "https://cdn.example.com/abc.png" });
  });

  test("parses a bare URL line", () => {
    const result = parseImageFromContent("https://cdn.example.com/x.jpg");
    expect(result).toEqual({ kind: "url", url: "https://cdn.example.com/x.jpg" });
  });

  test("parses a data URL (base64)", () => {
    const dataUrl =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgAAIAAAUAAen63NgAAAAASUVORK5CYII=";
    const content = `\`\`\`\n${dataUrl}\n\`\`\``;
    const result = parseImageFromContent(content);
    expect(result.kind).toBe("base64");
    if (result.kind === "base64") {
      expect(result.mimeType).toBe("image/png");
      expect(result.base64.startsWith("iVBOR")).toBe(true);
    }
  });

  test("returns kind=none with raw content when no image found", () => {
    const content = "I cannot generate an image right now.";
    const result = parseImageFromContent(content);
    expect(result).toEqual({ kind: "none", raw: content });
  });

  test("prefers markdown image over a separately-quoted URL", () => {
    const content = "see ![](https://a.com/1.png) but mentioned https://b.com/2.png";
    const result = parseImageFromContent(content);
    expect(result).toEqual({ kind: "url", url: "https://a.com/1.png" });
  });
});
