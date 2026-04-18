# 部署指南

> 本文档写给**人类用户**和 **AI Agent**（Claude Code / Cursor / Copilot 等）。Agent 可以按顺序逐条执行命令完成部署。

---

## 目标

在用户本地跑起 `claudesidian-imagen`，浏览器能打开 `http://127.0.0.1:5173`，选一篇 vault 里的 .md 文章生成出图。

---

## 先决条件

| 项 | 要求 | 检查命令 | 预期输出 |
|---|---|---|---|
| 操作系统 | macOS / Linux / Windows WSL2 | `uname -s` | `Darwin` / `Linux` |
| Bun | ≥ 1.1.0 | `bun --version` | `1.1.0` 或更高 |
| 网络 | 能访问所选 API 平台 | `curl -sI https://api.bltcy.ai` | `HTTP/` 开头 |
| vault | 任意 Obsidian / Claudesidian vault 根目录 | `ls CLAUDE.md 2>/dev/null \|\| ls .obsidian 2>/dev/null` | 至少有其中一个 |
| API Key | OpenAI 兼容平台的 key（见下） | — | — |

### 安装 Bun（如未装）

**macOS / Linux:**

```bash
curl -fsSL https://bun.sh/install | bash
```

装完后**新开一个终端**或执行 `source ~/.zshrc`，再 `bun --version` 验证。

**Windows:** 建议 WSL2 里按 Linux 方式装，原生 Windows 也支持见 [bun.sh](https://bun.sh)。

---

## 获取 API Key

**推荐：柏拉图 AI（bltcy.ai）**——国内直连、支持 `gemini-3.1-flash-image-preview` 图像模型。

注册：https://api.bltcy.ai/register?aff=9N11124980

在控制台"令牌管理"里创建一个 key，形如 `sk-xxxxxxxx`。

其他可选平台：

| 平台 | Base URL | 图像模型 |
|---|---|---|
| 柏拉图 AI | `https://api.bltcy.ai/v1` | `gemini-3.1-flash-image-preview` |
| 官方 Gemini（OpenAI 兼容） | `https://generativelanguage.googleapis.com/v1beta/openai` | `gemini-3.1-flash-image-preview` |
| OpenRouter | `https://openrouter.ai/api/v1` | `google/gemini-3.1-flash-image-preview` |

---

## 部署步骤

### 步骤 1：切到 vault 根目录

```bash
cd /path/to/your-vault
```

**验证**：`pwd` 输出 vault 路径；`ls` 看到 `.obsidian/` 或 `CLAUDE.md`。

> ⚠️ **必须**在 vault 根目录启动。程序把"当前工作目录"当成 vault 根，决定去哪读 .md 文件、去哪存生成的图。

### 步骤 2：启动

**方式 A：直接从 GitHub 跑（推荐）**

```bash
bunx github:hunduncn/claudesidian-imagen
```

Bun 会自动拉取代码 → 安装依赖 → 启动服务。首次启动约 10-30 秒。

**方式 B：克隆后跑（便于改代码）**

```bash
# 找一个存放项目的地方，不要放在 vault 里
cd ~/projects  # 或任意目录
git clone https://github.com/hunduncn/claudesidian-imagen.git
cd claudesidian-imagen
bun install

# 回到 vault 启动
cd /path/to/your-vault
bun run /path/to/claudesidian-imagen/bin/claudesidian-imagen.ts
```

### 步骤 3：预期输出

终端应该看到类似：

```
[claudesidian-imagen] vault root: /path/to/your-vault
[claudesidian-imagen] listening on http://127.0.0.1:5173
```

浏览器自动打开 `http://127.0.0.1:5173`。如果没自动打开，手动访问即可。

### 步骤 4：首次配置

浏览器里会弹出"API 配置"对话框：

1. **平台模板** → 选 `官方 Gemini (OpenAI 兼容)` 或 `OpenRouter`，或手填
2. **Base URL** → 如用柏拉图：`https://api.bltcy.ai/v1`
3. **API Key** → 粘贴你的 `sk-xxxx`
4. **文本模型** → `gemini-2.5-flash`
5. **图像模型** → `gemini-3.1-flash-image-preview`
6. 点"保存"

配置写到 `~/.claudesidian-imagen/config.json`，下次启动直接用。

### 步骤 5：验证

1. 左侧文件树点一篇 .md 文章
2. 选"小红书封面"
3. 选风格（如"商务干净"）
4. 生成数量选 1
5. 点"生成 1 张"

30-60 秒后右边应出现一张图。终端会有类似 log：

```
─── [generate] prompt ───
<完整 prompt>
─── end prompt (XXX chars) ───
```

---

## 升级

**方式 A（bunx）**：下次启动会自动拉最新——无需操作。想强制刷新：

```bash
rm -rf ~/.bun/install/cache/@github-hunduncn/claudesidian-imagen*
```

**方式 B（git clone）**：

```bash
cd /path/to/claudesidian-imagen
git pull
bun install
```

---

## 常见问题

### Q1：启动时提示 `bun: command not found`

Bun 没装或没加入 PATH。重开终端，或 `source ~/.zshrc`（macOS zsh）/ `source ~/.bashrc`（Linux bash）。

### Q2：端口 5173 被占

```bash
# 找占用进程
lsof -i :5173
# 或改端口：编辑 ~/.claudesidian-imagen/config.json，把 preferredPort 改成 5174
```

### Q3：浏览器打开空白

1. 终端看有没有报错
2. 刷新浏览器（⌘+Shift+R / Ctrl+Shift+F5）
3. 检查 `http://127.0.0.1:5173/api/config` 应该返回 JSON

### Q4：生成时提示"模型拒绝了这次请求（内容安全策略）"

上游安全分类器误判。改对策：

1. 改写封面标题避开敏感词（"崩了" / "暴跌" / "诈骗" 等）
2. 换一个风格家族试试
3. 清空"额外指令"

### Q5：API Key 泄漏怎么办？

Key 只存本地 `~/.claudesidian-imagen/config.json`，仓库里没有任何 key。泄漏了到平台控制台删除重建即可。

---

## 卸载

```bash
rm -rf ~/.claudesidian-imagen    # 配置 + 品牌锚图
rm -rf ~/.bun/install/cache/@github-hunduncn/claudesidian-imagen*   # bunx 缓存
# 如果克隆了仓库：rm -rf /path/to/claudesidian-imagen
```

生成的图在 vault 里 `05_Attachments/Organized/*/`，要不要删自己决定。

---

## 给 AI Agent 的一键部署脚本

把下面给 Agent：

```bash
# 1. 确认 Bun
command -v bun >/dev/null 2>&1 || { echo "请先装 Bun: curl -fsSL https://bun.sh/install | bash"; exit 1; }

# 2. 切到 vault（替换为实际路径）
cd /path/to/your-vault

# 3. 启动
bunx github:hunduncn/claudesidian-imagen
```

启动后 agent 应指示用户：
1. 浏览器打开 `http://127.0.0.1:5173`
2. 在设置里填 Base URL / API Key（推荐 bltcy.ai: `https://api.bltcy.ai/v1`，注册 https://api.bltcy.ai/register?aff=9N11124980）
3. 选一篇 .md → 选类型 → 选风格 → 生成 → 保存
