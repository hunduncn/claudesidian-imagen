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
  if (/ENOENT/.test(raw))                 return "File or directory not found";
  if (/EACCES|EPERM/.test(raw))           return "Permission denied";
  if (/EISDIR/.test(raw))                 return "Expected a file, got a directory";
  if (/ENOTDIR/.test(raw))                return "Expected a directory, got a file";

  // Upstream LLM / image-model API errors — surface the actionable category
  // so the UI can tell the user what to do, without leaking request IDs.
  const upstream = raw.match(/OpenAI-compat error (\d+):/);
  if (upstream) {
    const status = upstream[1];
    if (/insufficient_user_quota|预扣费额度失败|剩余额度|insufficient.*balance|quota/i.test(raw)) {
      return "上游账户余额不足，请到中转平台充值后重试";
    }
    if (/image safety|safety filter|safety policy|content policy|could not generate an image/i.test(raw)) {
      return "模型拒绝了这次请求（内容安全策略），换个风格或调整额外指令后重试";
    }
    if (/无可用渠道|no available channel|model_not_found|model not found/i.test(raw)) {
      return "中转平台没有该模型的可用渠道，请在设置里换一个模型名";
    }
    if (status === "401" || /invalid.*api.*key|unauthorized/i.test(raw)) {
      return "API Key 无效或已过期，请在设置里更新";
    }
    if (status === "429") {
      return "请求被限流，稍等片刻后重试";
    }
    if (status === "500" || status === "502" || status === "503") {
      return `上游平台错误 (${status})，稍后重试`;
    }
    return `上游 API 错误 (${status})`;
  }

  // Unknown: generic message. Keep details in server logs only.
  return "Internal error";
}
