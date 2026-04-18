// public/app.js

const TEMPLATES = {
  "gemini-official": {
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    textModel: "gemini-2.5-flash",
    imageModel: "gemini-3.1-flash-image-preview",
  },
  openrouter: {
    baseUrl: "https://openrouter.ai/api/v1",
    textModel: "google/gemini-2.5-flash",
    imageModel: "google/gemini-3.1-flash-image-preview",
  },
};

function emptyConfig() {
  return {
    api: { baseUrl: "", apiKey: "", textModel: "", imageModel: "" },
    preferredPort: 5173,
  };
}

window.appState = function appState() {
  return {
    // config
    showSettings: false,
    configReady: false,
    draftConfig: emptyConfig(),
    settingsTemplate: "",

    // vault tree
    tree: [],
    selectedPath: null,
    selectedFile: null,
    articleContent: "",

    // generation flow (simplified — no more LLM extract step)
    type: null,
    stylePresets: [],
    styleKey: "",
    extraPrompt: "",
    generating: false,
    results: [],
    selectedIndex: null,
    saving: false,
    lastWikilink: "",

    // transient error banner
    errorToast: "",
    _errorTimer: null,

    // aspect-ratio string for variant preview, driven by current type
    get variantAspect() {
      switch (this.type) {
        case "xhs-cover":     return "3 / 4";
        case "wechat-cover":  return "2.35 / 1";
        case "wechat-illust": return "16 / 9";
        default:              return "1 / 1";
      }
    },

    // flat visible tree for arbitrary-depth rendering
    get flatVisible() {
      const out = [];
      const walk = (nodes, depth) => {
        for (const n of nodes) {
          out.push({ node: n, depth });
          if (n.isDir && n.expanded && n.children) walk(n.children, depth + 1);
        }
      };
      walk(this.tree, 0);
      return out;
    },

    showError(msg) {
      this.errorToast = msg;
      if (this._errorTimer) clearTimeout(this._errorTimer);
      this._errorTimer = setTimeout(() => { this.errorToast = ""; }, 6000);
    },

    dismissError() {
      this.errorToast = "";
      if (this._errorTimer) clearTimeout(this._errorTimer);
    },

    async init() {
      await this.refreshConfig();
      if (this.configReady) {
        await this.loadTree();
      } else {
        this.showSettings = true;
      }
    },

    async loadStylesForType(type) {
      const r = await fetch(`/api/styles?type=${encodeURIComponent(type)}`).then((r) => r.json());
      this.stylePresets = r.styles || [];
      // Reset to first preset of this type — keys are type-prefixed so cross-type keys never match.
      this.styleKey = this.stylePresets.length > 0 ? this.stylePresets[0].key : "";
    },

    // ───── config ─────

    async refreshConfig() {
      const r = await fetch("/api/config").then((r) => r.json());
      this.draftConfig = r.config ?? emptyConfig();
      this.configReady = r.complete;
    },

    openSettings() {
      this.showSettings = true;
    },

    closeSettings() {
      if (this.configReady) this.showSettings = false;
    },

    applyTemplate() {
      const t = TEMPLATES[this.settingsTemplate];
      if (!t) return;
      this.draftConfig.api.baseUrl = t.baseUrl;
      this.draftConfig.api.textModel = t.textModel;
      this.draftConfig.api.imageModel = t.imageModel;
      // keep apiKey as-is
    },

    async saveSettings() {
      const r = await fetch("/api/config", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(this.draftConfig),
      });
      if (!r.ok) {
        this.showError("保存失败");
        return;
      }
      await this.refreshConfig();
      if (this.configReady) {
        this.showSettings = false;
        await this.loadTree();
      }
    },

    // ───── vault tree ─────

    async loadTree() {
      const r = await fetch("/api/vault/tree").then((r) => r.json());
      this.tree = (r.entries || []).map((e) => ({ ...e, expanded: false, children: [] }));
    },

    async toggleNode(node) {
      if (!node.isDir) {
        await this.onNodeClick(node);
        return;
      }
      if (node.expanded) {
        node.expanded = false;
        return;
      }
      const r = await fetch(`/api/vault/tree?dir=${encodeURIComponent(node.relPath)}`).then((r) => r.json());
      node.children = (r.entries || []).map((e) => ({ ...e, expanded: false, children: [] }));
      node.expanded = true;
    },

    async onNodeClick(node) {
      if (node.isDir) {
        await this.toggleNode(node);
        return;
      }
      this.selectedPath = node.relPath;
      this.selectedFile = node;
      // reset downstream state
      this.type = null;
      this.results = [];
      this.selectedIndex = null;
      this.lastWikilink = "";
      const r = await fetch(`/api/vault/read?path=${encodeURIComponent(node.relPath)}`).then((r) => r.json());
      this.articleContent = r.content || "";
    },

    // ───── extract / generate / save ─────

    async selectType(t) {
      this.type = t;
      this.results = [];
      this.selectedIndex = null;
      await this.loadStylesForType(t);
    },

    _generateBody(count) {
      return {
        type: this.type,
        styleKey: this.styleKey,
        sourcePath: this.selectedPath,
        extraPrompt: this.extraPrompt,
        count,
      };
    },

    async doGenerate() {
      if (!this.type || !this.styleKey || !this.selectedPath) return;
      this.generating = true;
      this.results = [];
      this.selectedIndex = null;
      try {
        const r = await fetch("/api/generate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(this._generateBody(4)),
        }).then((r) => r.json());
        if (r.error) {
          this.showError("生成失败：" + r.error);
          return;
        }
        this.results = r.results || [];
      } finally {
        this.generating = false;
      }
    },

    async retryVariant(i) {
      this.results[i] = { kind: "error", message: "重试中…" };
      const r = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(this._generateBody(1)),
      }).then((r) => r.json());
      const newResults = [...this.results];
      newResults[i] = (r.results && r.results[0]) || { kind: "error", message: "重试失败" };
      this.results = newResults;
    },

    selectVariant(i) {
      const r = this.results[i];
      if (!r || r.kind === "error" || r.kind === "none") return;
      this.selectedIndex = i;
    },

    async doSave() {
      if (this.selectedIndex === null) return;
      const image = this.results[this.selectedIndex];
      this.saving = true;
      try {
        const r = await fetch("/api/save", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            sourcePath: this.selectedPath,
            type: this.type,
            image,
          }),
        }).then((r) => r.json());
        if (r.error) {
          this.showError("保存失败：" + r.error);
          return;
        }
        this.lastWikilink = r.wikilink;
        try {
          await navigator.clipboard.writeText(r.wikilink);
        } catch {
          // clipboard may fail in non-https contexts; the toast still shows
        }
      } finally {
        this.saving = false;
      }
    },
  };
};
