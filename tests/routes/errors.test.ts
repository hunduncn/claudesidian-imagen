// tests/routes/errors.test.ts
import { describe, test, expect } from "bun:test";
import { sanitizeErrorMessage } from "../../src/routes/_errors.ts";

describe("sanitizeErrorMessage", () => {
  test("maps 'Path is outside vault' errors to public string", () => {
    const err = new Error("Path is outside vault: ../../etc (resolved to /Users/secret/etc)");
    expect(sanitizeErrorMessage(err, "test")).toBe("Path is outside vault");
  });

  test("maps ENOENT to 'File or directory not found'", () => {
    const err = new Error("ENOENT: no such file or directory, open '/Users/secret/vault/missing.md'");
    expect(sanitizeErrorMessage(err, "test")).toBe("File or directory not found");
  });

  test("returns 'Internal error' for unknown errors", () => {
    const err = new Error("some unexpected internal condition with secrets");
    expect(sanitizeErrorMessage(err, "test")).toBe("Internal error");
  });

  test("maps 'Not a .md file' errors to 'Not a markdown file'", () => {
    const err = new Error("Not a .md file: foo.txt");
    expect(sanitizeErrorMessage(err, "test")).toBe("Not a markdown file");
  });

  test("maps EACCES to 'Permission denied'", () => {
    const err = new Error("EACCES: permission denied, open '/secret/file.md'");
    expect(sanitizeErrorMessage(err, "test")).toBe("Permission denied");
  });

  test("handles non-Error values (strings)", () => {
    expect(sanitizeErrorMessage("ENOENT: missing file", "test")).toBe("File or directory not found");
  });
});
