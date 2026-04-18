// src/routes/_errors.ts

/**
 * Strip absolute paths and other server-internal details from an error message
 * before returning it to the HTTP client. Logs the original server-side.
 */
export function sanitizeErrorMessage(e: unknown, context: string): string {
  const raw = e instanceof Error ? e.message : String(e);
  // Log the original (with absolute paths) for server operators.
  console.error(`[${context}]`, raw);

  // Map known error shapes to safe public strings.
  if (/path is outside vault/i.test(raw)) return "Path is outside vault";
  if (/not a \.md file/i.test(raw))       return "Not a markdown file";
  if (/ENOENT/.test(raw))                  return "File or directory not found";
  if (/EACCES|EPERM/.test(raw))            return "Permission denied";
  if (/EISDIR/.test(raw))                  return "Expected a file, got a directory";
  if (/ENOTDIR/.test(raw))                 return "Expected a directory, got a file";

  // Unknown: generic message. Keep details in server logs only.
  return "Internal error";
}
