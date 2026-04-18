// tests/core/path-resolver.test.ts
import { describe, test, expect } from "bun:test";
import {
  resolveSavePath,
  nextVersion,
  buildWikilink,
  type ImageType,
} from "../../src/core/path-resolver.ts";

describe("nextVersion", () => {
  test("returns 1 when no existing files", () => {
    expect(nextVersion([], "xhs-cover")).toBe(1);
  });

  test("returns 2 when v1 exists", () => {
    expect(nextVersion(["xhs-cover_v1.png"], "xhs-cover")).toBe(2);
  });

  test("returns max+1 across multiple versions", () => {
    expect(
      nextVersion(
        ["xhs-cover_v1.png", "xhs-cover_v3.png", "xhs-cover_v2.png"],
        "xhs-cover",
      ),
    ).toBe(4);
  });

  test("ignores files of other types", () => {
    expect(
      nextVersion(
        ["xhs-cover_v1.png", "wechat-cover_v5.png", "wechat-illust_v2.png"],
        "xhs-cover",
      ),
    ).toBe(2);
  });

  test("ignores malformed file names", () => {
    expect(nextVersion(["xhs-cover.png", "xhs-cover_vfoo.png"], "xhs-cover")).toBe(1);
  });
});

describe("resolveSavePath", () => {
  test("builds the correct path components", () => {
    const result = resolveSavePath({
      vaultRoot: "/v",
      sourceMdPath: "/v/01_Projects/cats/article.md",
      type: "xhs-cover",
      version: 2,
    });
    expect(result).toEqual({
      relativeDir: "05_Attachments/Organized/article",
      absoluteDir: "/v/05_Attachments/Organized/article",
      filename: "xhs-cover_v2.png",
      absolutePath: "/v/05_Attachments/Organized/article/xhs-cover_v2.png",
    });
  });

  test("strips .md extension and uses basename only", () => {
    const result = resolveSavePath({
      vaultRoot: "/v",
      sourceMdPath: "/v/some/deep/path/我的文章.md",
      type: "wechat-cover",
      version: 1,
    });
    expect(result.filename).toBe("wechat-cover_v1.png");
    expect(result.relativeDir).toBe("05_Attachments/Organized/我的文章");
  });
});

describe("buildWikilink", () => {
  test("returns short form when basename is unique", () => {
    expect(
      buildWikilink({
        absolutePath: "/v/05_Attachments/Organized/article/xhs-cover_v1.png",
        vaultRoot: "/v",
        existingBasenames: new Set(["other.png"]),
      }),
    ).toBe("![[xhs-cover_v1.png]]");
  });

  test("returns full path when basename collides", () => {
    expect(
      buildWikilink({
        absolutePath: "/v/05_Attachments/Organized/article/xhs-cover_v1.png",
        vaultRoot: "/v",
        existingBasenames: new Set(["xhs-cover_v1.png"]),
      }),
    ).toBe("![[05_Attachments/Organized/article/xhs-cover_v1.png]]");
  });
});
