---
name: imagen
description: Control claudesidian-imagen — start / stop / logs / update / status. Use when the user wants to generate cover/illustration images from a vault article, or asks to "open imagen / 打开 imagen / 开封面工具 / 生图工具 / 关掉 imagen / 看 imagen 日志 / 更新 imagen".
---

# claudesidian-imagen · 控制台

帮用户启停和运维 [claudesidian-imagen](https://github.com/hunduncn/claudesidian-imagen)。

> **安装本 skill：** 复制这个文件夹到你的 `.claude/skills/imagen/`（vault 级）或 `~/.claude/skills/imagen/`（全局），之后会话里 `/imagen` 即可调用。

## 子命令分派

用户在 `/imagen` 后面的自然语言里，按下面关键词匹配：

| 用户说的话 | 子命令 | 章节 |
|---|---|---|
| 无参 / "启动" / "开" / "start" | **start** | [启动](#启动默认) |
| "停" / "关" / "退出" / "stop" / "kill" | **stop** | [停止](#停止) |
| "日志" / "log" / "logs" / "看报错" | **logs** | [查日志](#查日志) |
| "更新" / "刷新缓存" / "升级" / "update" | **update** | [更新](#更新) |
| "状态" / "在跑吗" / "status" | **status** | [状态](#状态) |
| "重启" / "restart" | stop → start | 先停再启动 |

**歧义时优先问用户**，别乱猜。

---

## 启动（默认）

### 步骤 1：检查服务是否已在跑

```bash
lsof -nP -iTCP:5173 -sTCP:LISTEN 2>/dev/null | tail -1
```

**如果有输出**（已经有进程监听 5173）：
- 跟用户说：`imagen 已经在跑了，浏览器访问 http://127.0.0.1:5173 就行`
- **不要重复启动**。如果用户明确说"要重启"，跳到 [重启](#重启)

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
- `tail -30 /tmp/imagen-server.log` 看报错
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

---

## 停止

```bash
PID=$(lsof -nP -iTCP:5173 -sTCP:LISTEN -t 2>/dev/null)
if [ -z "$PID" ]; then
  echo "imagen 没在跑"
else
  kill "$PID" && sleep 1
  # 如果还没退，强杀
  kill -9 "$PID" 2>/dev/null
  echo "已停止 (PID $PID)"
fi
```

**注意**：该命令用 `lsof` 找监听 5173 的进程，**不会误杀其他 Bun 进程**。

汇报格式：

- 找到并停了：`✅ imagen 已停止（PID 12345）`
- 本来没在跑：`ℹ️ imagen 没在跑`
- kill 失败：把报错给用户

---

## 查日志

```bash
# 最近 50 行
tail -50 /tmp/imagen-server.log 2>/dev/null || echo "(没有日志文件：imagen 从未通过 /imagen 启动过)"
```

如果用户明确说"全部日志" / "完整日志"，用 `cat /tmp/imagen-server.log`。

输出太长时（>80 行）折叠前半部分，只展示最近的错误/关键行。

**重点提示给用户看的内容**：

- `listening on http://` → 启动成功
- `ENOTFOUND` / `ETIMEDOUT` → 网络问题
- `Cannot find module` / `not found` → 依赖或 Bun 问题
- `EADDRINUSE` → 端口冲突
- HTTP 400/401/429 → API 平台问题（余额、key、限速）

---

## 更新

清 bunx 的 GitHub 缓存，下次启动会重新拉最新代码。

### 步骤 1：确认没在跑（有的话先停）

```bash
lsof -nP -iTCP:5173 -sTCP:LISTEN -t 2>/dev/null
```

有输出的话提示用户先停：`先跑 /imagen stop，再更新`。

### 步骤 2：清缓存

```bash
rm -rf ~/.bun/install/cache/@github-hunduncn/claudesidian-imagen* 2>/dev/null
rm -rf ~/.bun/install/cache/claudesidian-imagen@* 2>/dev/null
echo "缓存已清"
```

### 步骤 3：汇报

```
✅ 缓存已清空

下次 /imagen 启动会从 GitHub 重新拉最新代码（约 10-30 秒）。
```

---

## 状态

**不做任何启停**，只报告。

```bash
PID=$(lsof -nP -iTCP:5173 -sTCP:LISTEN -t 2>/dev/null)
if [ -n "$PID" ]; then
  # 拿进程启动时间和内存占用
  ps -o pid,etime,rss,command -p "$PID" | tail -1
else
  echo "NOT_RUNNING"
fi
```

汇报格式：

**在跑**：
```
🟢 imagen 正在运行

📍 http://127.0.0.1:5173
🆔 PID: 12345
⏱️ 运行时长: 01:23:45
💾 内存: 120 MB
```

**没跑**：
```
⚫ imagen 未运行

用 /imagen 启动。
```

---

## 重启

就是 [停止](#停止) → [启动](#启动默认) 两步连做：

1. 先执行停止流程
2. 等 1 秒确保端口释放
3. 再执行启动流程

---

## 什么时候不应该动手

- 用户只是问"imagen 是什么"——解释，别启动
- 用户说的意图不清——先问清楚
- 用户正在跑会阻塞的长任务——先确认能不能打扰

---

## 排错速查

| 现象 | 诊断命令 | 解法 |
|---|---|---|
| `bun: command not found` | `command -v bun` | `curl -fsSL https://bun.sh/install \| bash`，让用户新开终端 |
| 5173 被占但不是 imagen | `lsof -i :5173` | 问用户杀不杀；或改 `~/.claudesidian-imagen/config.json` 的 `preferredPort` |
| 首次启动卡在拉代码 | `tail /tmp/imagen-server.log` | 检查网络，确认能访问 github.com |
| 启动报 TS 错误 / 旧版本问题 | — | `/imagen update` 清缓存后重试 |
| "模型拒绝了这次请求" | — | 引导用户改写标题、清空额外指令、或换风格 |

## 首次使用（如果没装过）

1. 确认 Bun 已装（`bun --version`）
2. 第一次 `bunx github:...` 会拉代码 + 装依赖，约 10-30 秒，属正常
3. 浏览器打开后，设置里填 API Key——推荐柏拉图 AI（https://api.bltcy.ai/register?aff=9N11124980），`baseUrl = https://api.bltcy.ai/v1`，`imageModel = gemini-3.1-flash-image-preview`

完整文档：https://github.com/hunduncn/claudesidian-imagen/blob/main/docs/DEPLOY.md
