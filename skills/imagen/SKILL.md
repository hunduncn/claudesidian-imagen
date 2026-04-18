---
name: imagen
description: Start claudesidian-imagen — a local web tool that turns vault .md articles into 小红书/公众号 cover images. Use when the user wants to generate cover/illustration images from an article, or asks to "open imagen / 打开 imagen / 开封面工具 / 生图工具".
---

# claudesidian-imagen · 启动助手

帮用户把 [claudesidian-imagen](https://github.com/hunduncn/claudesidian-imagen) 跑起来，最小化折腾。

> **安装本 skill：** 复制这个文件夹到你的 `.claude/skills/imagen/`（vault 级）或 `~/.claude/skills/imagen/`（全局），之后会话里 `/imagen` 即可调用。

## 工作流

### 步骤 1：检查服务是否已在跑

```bash
lsof -nP -iTCP:5173 -sTCP:LISTEN 2>/dev/null | tail -1
```

**如果有输出**（已经有进程监听 5173）：
- 跟用户说：`imagen 已经在跑了，浏览器访问 http://127.0.0.1:5173 就行`
- 如果用户明确说"要重启"，再继续步骤 2 前先 kill 旧进程：
  ```bash
  kill $(lsof -nP -iTCP:5173 -sTCP:LISTEN -t)
  ```

**如果没输出**（端口空闲）：继续步骤 2。

### 步骤 2：确定 vault 根目录

imagen **必须**在 vault 根目录启动（它把 cwd 当 vault）。优先级：

1. 当前会话工作目录（`pwd`），如果是一个合法 vault（根有 `.obsidian/` 或 `CLAUDE.md`）→ 用这个
2. 否则问用户 vault 绝对路径

### 步骤 3：后台启动

用 `run_in_background: true` 起后台进程，日志写到 `/tmp/imagen-server.log`：

```bash
cd <VAULT_ROOT> && \
  bunx github:hunduncn/claudesidian-imagen > /tmp/imagen-server.log 2>&1
```

### 步骤 4：等服务就绪

最多等 30 秒。每 2 秒看一次日志：

```bash
grep -q "listening on http" /tmp/imagen-server.log && echo READY
```

出现 `listening on http://127.0.0.1:5173` 即就绪。

**如果 30 秒还没就绪**：
- `cat /tmp/imagen-server.log` 看报错
- 常见：Bun 没装、网络抓不到 GitHub、端口被占
- 报给用户

### 步骤 5：汇报

就绪后（**不要自己打开浏览器**——macOS 上 bunx 启动会自己开）：

```
✅ claudesidian-imagen 已启动

📍 http://127.0.0.1:5173
📁 当前 vault: <VAULT_ROOT>

选一篇文章 → 选类型 → 选风格 → 生成 → 保存。
生成的图落到 05_Attachments/Organized/<文章名>/ 下。
```

## 什么时候不应该启动

- 用户只是问"imagen 是什么"——解释，别启动
- 用户在跑某个会阻塞的长任务——先问一下

## 排错速查

| 现象 | 诊断命令 | 解法 |
|---|---|---|
| `bun: command not found` | `command -v bun` | `curl -fsSL https://bun.sh/install \| bash`，让用户新开终端 |
| 5173 被占但不是 imagen | `lsof -i :5173` | 问用户杀不杀；或改 `~/.claudesidian-imagen/config.json` 的 `preferredPort` |
| 首次启动卡在拉代码 | `tail /tmp/imagen-server.log` | 检查网络，确认能访问 github.com |
| "模型拒绝了这次请求" | — | 引导用户改写标题、清空额外指令、或换风格 |

## 首次使用（如果没装过）

1. 确认 Bun 已装（`bun --version`）
2. 第一次 `bunx github:...` 会拉代码 + 装依赖，约 10-30 秒，属正常
3. 浏览器打开后，设置里填 API Key——推荐柏拉图 AI（https://api.bltcy.ai/register?aff=9N11124980），`baseUrl = https://api.bltcy.ai/v1`，`imageModel = gemini-3.1-flash-image-preview`

完整文档：https://github.com/hunduncn/claudesidian-imagen/blob/main/docs/DEPLOY.md
