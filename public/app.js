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

    // generation flow
    type: null,
    fields: null,
    extracting: false,
    generating: false,
    results: [],
    selectedIndex: null,
    saving: false,
    lastWikilink: "",

    async init() {
      await this.refreshConfig();
      if (this.configReady) {
        await this.loadTree();
      } else {
        this.showSettings = true;
      }
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
        alert("保存失败");
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
      this.fields = null;
      this.results = [];
      this.selectedIndex = null;
      this.lastWikilink = "";
      const r = await fetch(`/api/vault/read?path=${encodeURIComponent(node.relPath)}`).then((r) => r.json());
      this.articleContent = r.content || "";
    },

    // ───── extract / generate / save ─────

    selectType(t) {
      this.type = t;
      this.fields = null;
      this.results = [];
      this.selectedIndex = null;
    },

    async doExtract() {
      if (!this.type || !this.articleContent) return;
      this.extracting = true;
      try {
        const r = await fetch("/api/extract", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ content: this.articleContent, type: this.type }),
        }).then((r) => r.json());
        if (r.error) {
          alert("提取失败：" + r.error);
          return;
        }
        this.fields = r.fields;
      } finally {
        this.extracting = false;
      }
    },

    async doGenerate() {
      if (!this.fields || !this.type) return;
      this.generating = true;
      this.results = [];
      this.selectedIndex = null;
      try {
        const r = await fetch("/api/generate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ type: this.type, fields: this.fields, count: 4 }),
        }).then((r) => r.json());
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
        body: JSON.stringify({ type: this.type, fields: this.fields, count: 1 }),
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
          alert("保存失败：" + r.error);
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
