# @claudesidian/imagen

> 跑在 Claudesidian vault 里的本地 Web 工具，把 .md 文章一键变成小红书封面 / 公众号封面 / 公众号插图。

## 特性

- 🌳 直接浏览 vault 文件树，选 .md 文章
- 🤖 LLM 自动提取标题/视觉/风格字段，可在线编辑
- 🎨 一次出 4 张候选图，挑一张采纳
- 📁 自动保存到 `05_Attachments/Organized/<文章名>/`，自动版本号
- 📋 复制 wikilink 到剪贴板，粘到笔记即用
- 🔌 OpenAI 兼容接口，适配任何中转平台或官方端点

## 快速开始

### 前置

- [Bun](https://bun.sh) ≥ 1.1.0
- 一个 Claudesidian vault（根目录有 `CLAUDE.md`）
- 一个 OpenAI 兼容平台的 API Key（如 gpt-best、官方 Gemini OpenAI 端点、OpenRouter）

### 启动

```bash
cd /path/to/your-claudesidian-vault
bunx @claudesidian/imagen
```

浏览器自动打开 `http://127.0.0.1:5173`。首次启动会要求填写 API 配置。

## 配置

配置存储于 `~/.claudesidian-imagen/config.json`：

```json
{
  "api": {
    "baseUrl": "https://<your-relay-host>/v1",
    "apiKey": "sk-xxxxxxx",
    "textModel": "gemini-2.5-flash",
    "imageModel": "gemini-3.1-flash-image-preview"
  },
  "preferredPort": 5173
}
```

## 工作流

1. 启动后选 vault 里的一篇 .md 文章
2. 选输出类型（小红书封面 / 公众号封面 / 公众号插图）
3. 点"提取 prompt" — LLM 把文章拆成结构化字段
4. 在网页上调整字段（标题/副标题/视觉/风格）
5. 点"生成 4 张" — 一次出 4 张候选
6. 选一张点"采纳并保存"
7. 图片落到 `05_Attachments/Organized/<文章名>/<类型>_v<n>.png`，wikilink 复制到剪贴板

## 已知限制

- chat completions 接口无显式 aspect ratio 参数，比例靠 prompt 描述（4 张里挑一张比例对的）
- 中文文字渲染依赖底层模型能力，偶尔翻车 → 重新生成

## 开发

```bash
git clone <repo>
cd claudesidian-imagen
bun install
bun test                    # 跑全部单测
bun run src/server.ts       # 本地开发
```

## License

MIT
