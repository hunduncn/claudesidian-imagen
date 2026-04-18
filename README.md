# claudesidian-imagen

> 本地 Web 工具 · 把 Claudesidian / Obsidian vault 里的 .md 文章一键变成**小红书封面 · 公众号封面 · 公众号插图**。

基于 Bun + Alpine.js + Gemini 图像模型，零后端部署、零数据库、所有数据留在本地。

---

## ✨ 特性

- 🌳 **直接浏览 vault** — 左侧文件树选 .md，中间预览正文
- 🎨 **27 个风格家族** — 3 个品牌就绪（商务干净 / 编辑极简 / 知识博主）+ 24 个风格（莫兰迪 / 新中式 / 胶片 / 杂志拼贴 / ...）
- 📌 **品牌锚定** — 对一个风格家族设一张基准图，后续生成自动保持视觉一致
- ✏️ **标题可改写** — 生图前编辑要渲染到图里的文字（避开敏感词、突出卖点）
- 🔢 **1–4 张批量生成** — 一次出多张候选，挑一张采纳
- 🔍 **点击放大预览** — 细节看清楚再决定
- 💾 **自动归档 + wikilink** — 保存到 `05_Attachments/Organized/<文章名>/`，wikilink 自动复制到剪贴板
- 📐 **自动比例** — 小红书 3:4 / 公众号封面 2.35:1 / 公众号插图 16:9
- 🔌 **OpenAI 兼容** — 官方 Gemini / OpenRouter / 任意中转平台

---

## 🚀 快速开始

**前置：** [Bun](https://bun.sh) ≥ 1.1.0 + 一个 OpenAI 兼容平台的 API Key。

```bash
cd /path/to/your-vault
bunx github:hunduncn/claudesidian-imagen
```

浏览器自动打开 `http://127.0.0.1:5173`，首次启动要求填写 API 配置。

完整步骤见 **[部署指南 →](docs/DEPLOY.md)**

---

## 📖 使用

选文章 → 选类型 → 选风格 → 生成 → 挑一张 → 保存。详细流程见 **[使用指南 →](docs/USAGE.md)**

---

## 🔌 推荐中转平台：柏拉图 AI（bltcy.ai）

国内直连、支持 Gemini `gemini-3.1-flash-image-preview` 图像模型、价格友好，作者在用的就是这家。

**注册链接：** https://api.bltcy.ai/register?aff=9N11124980

配置示例：

```json
{
  "api": {
    "baseUrl": "https://api.bltcy.ai/v1",
    "apiKey": "sk-你的key",
    "textModel": "gemini-2.5-flash",
    "imageModel": "gemini-3.1-flash-image-preview"
  }
}
```

> 想用官方 Gemini OpenAI 端点或 OpenRouter 也完全支持——设置里切"平台模板"即可。

---

## 🛠 开发

```bash
git clone https://github.com/hunduncn/claudesidian-imagen.git
cd claudesidian-imagen
bun install
bun test                       # 96 个单测
bun run src/server.ts          # 本地开发（默认端口 5173）
```

---

## 📁 存储位置

- **配置**：`~/.claudesidian-imagen/config.json`（API Key、品牌锚图）
- **生成图**：`<你的 vault>/05_Attachments/Organized/<文章名>/<类型>_v<n>.png`

都在你本地，不会上传到任何第三方。

---

## ⚠️ 已知限制

- Chat completions 接口没有显式 aspect-ratio 参数，比例靠 prompt 描述（一次出多张里挑比例对的）
- 中文文字渲染依赖底层模型能力，偶尔翻车 → 重新生成或改标题
- 上游安全分类器偶尔对"崩了 / 暴跌 / 诈骗"等词敏感 → 用标题改写功能避开

---

## License

MIT
