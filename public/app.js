// public/app.js

/**
 * First-run defaults. New users open settings, see these pre-filled, and
 * only need to paste their API key. Power users can override any field.
 * Recommended platform is bltcy.ai (国内直连, supports Gemini image model).
 */
const DEFAULT_API = {
  baseUrl: "https://api.bltcy.ai/v1",
  textModel: "gemini-2.5-flash",
  imageModel: "gemini-3.1-flash-image-preview",
};

function emptyConfig() {
  return {
    api: { ...DEFAULT_API, apiKey: "" },
    preferredPort: 5173,
  };
}

window.appState = function appState() {
  return {
    // config
    showSettings: false,
    configReady: false,
    draftConfig: emptyConfig(),

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
    titleOverride: "",   // user-editable title for rendering into the image
    detectedTitle: "",   // what the server would use by default (H1 > filename)
    count: 4,            // how many variants to generate in one batch (1-4)
    generating: false,
    results: [],
    selectedIndex: null,
    saving: false,
    lastWikilink: "",

    // brand anchors: familyKey set → has a pinned reference image
    anchoredFamilies: new Set(),
    anchoring: null, // familyKey currently being set/removed

    // zoom lightbox
    zoomedImageSrc: "",

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

    // grid columns: wechat types are wide (2.35:1, 16:9), one-per-row reads
    // better than squeezing two; xhs is portrait (3:4) so 2x2 still fits.
    get gridColumns() {
      return this.type === "xhs-cover" ? "1fr 1fr" : "1fr";
    },

    // ───── zoom lightbox ─────

    zoomResult(r) {
      if (r.kind === "url")    this.zoomedImageSrc = r.url;
      if (r.kind === "base64") this.zoomedImageSrc = `data:${r.mimeType};base64,${r.base64}`;
    },

    closeZoom() {
      this.zoomedImageSrc = "";
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
        await this.loadAnchors();
      } else {
        this.showSettings = true;
      }
    },

    async loadStylesForType(type) {
      const r = await fetch(`/api/styles?type=${encodeURIComponent(type)}`).then((r) => r.json());
      this.stylePresets = r.styles || [];
      // Preserve current selection if the family supports the new type;
      // otherwise fall back to the first brand-ready family, or the first
      // family in the list.
      const current = this.stylePresets.find((s) => s.key === this.styleKey);
      if (!current) {
        const brandReady = this.stylePresets.find((s) => s.brandReady);
        this.styleKey = brandReady ? brandReady.key : (this.stylePresets[0]?.key ?? "");
      }
    },

    get currentFamilyAnchored() {
      return this.styleKey && this.anchoredFamilies.has(this.styleKey);
    },

    // ───── brand anchors ─────

    async loadAnchors() {
      try {
        const r = await fetch("/api/brand/anchors").then((r) => r.json());
        this.anchoredFamilies = new Set((r.anchors || []).map((a) => a.familyKey));
      } catch {
        this.anchoredFamilies = new Set();
      }
    },

    // Convert a variant result (url | base64) into a data URL the server can
    // store as an anchor. For base64 results this is trivial; for remote
    // URLs we have to fetch the bytes and base64 them.
    async _variantToDataUrl(variant) {
      if (variant.kind === "base64") {
        return `data:${variant.mimeType};base64,${variant.base64}`;
      }
      if (variant.kind === "url") {
        const resp = await fetch(variant.url);
        const blob = await resp.blob();
        return await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
        });
      }
      throw new Error("无法把该变体作为基准");
    },

    async anchorVariant(i) {
      const variant = this.results[i];
      if (!variant || !this.styleKey) return;
      this.anchoring = this.styleKey;
      try {
        const imageDataUrl = await this._variantToDataUrl(variant);
        const r = await fetch("/api/brand/anchor", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ familyKey: this.styleKey, imageDataUrl }),
        });
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          this.showError("设置基准失败：" + (j.error || r.status));
          return;
        }
        this.anchoredFamilies = new Set([...this.anchoredFamilies, this.styleKey]);
      } catch (e) {
        this.showError("设置基准失败：" + (e?.message || e));
      } finally {
        this.anchoring = null;
      }
    },

    async clearAnchor() {
      if (!this.styleKey) return;
      this.anchoring = this.styleKey;
      try {
        const r = await fetch(`/api/brand/anchor?familyKey=${encodeURIComponent(this.styleKey)}`, {
          method: "DELETE",
        });
        if (!r.ok) {
          this.showError("取消基准失败");
          return;
        }
        const next = new Set(this.anchoredFamilies);
        next.delete(this.styleKey);
        this.anchoredFamilies = next;
      } finally {
        this.anchoring = null;
      }
    },

    // ───── config ─────

    async refreshConfig() {
      const r = await fetch("/api/config").then((r) => r.json());
      const cfg = r.config ?? emptyConfig();
      // First-time setup: server has no API config yet — pre-fill defaults
      // so the user only has to paste their API key.
      const a = cfg.api ?? {};
      const isFirstTime = !a.baseUrl && !a.apiKey && !a.textModel && !a.imageModel;
      if (isFirstTime) {
        cfg.api = { ...DEFAULT_API, apiKey: "" };
      }
      this.draftConfig = cfg;
      this.configReady = r.complete;
    },

    openSettings() {
      this.showSettings = true;
    },

    closeSettings() {
      if (this.configReady) this.showSettings = false;
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
      // Re-derive the title: first H1 if present, else filename (without .md).
      // Mirrors the server's deriveArticleTitle so the UI shows what the model
      // would render — and the user can edit it before generating.
      this.detectedTitle = this._deriveTitle(this.articleContent, node.name);
      this.titleOverride = this.detectedTitle;
    },

    _deriveTitle(markdown, filename) {
      let body = markdown || "";
      if (body.startsWith("---\n")) {
        const end = body.indexOf("\n---", 4);
        if (end >= 0) body = body.slice(end + 4);
      }
      const m = body.match(/^#\s+(.+?)\s*$/m);
      if (m && m[1]) return m[1].trim();
      return (filename || "").replace(/\.md$/i, "");
    },

    // ───── extract / generate / save ─────

    async selectType(t) {
      this.type = t;
      this.results = [];
      this.selectedIndex = null;
      await this.loadStylesForType(t);
    },

    _generateBody(count) {
      const body = {
        type: this.type,
        styleKey: this.styleKey,
        sourcePath: this.selectedPath,
        extraPrompt: this.extraPrompt,
        count,
      };
      // Only send an override when the user actually edited the title. This
      // keeps the server's default H1-detection path as the happy path.
      if (this.titleOverride && this.titleOverride !== this.detectedTitle) {
        body.titleOverride = this.titleOverride;
      }
      return body;
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
          body: JSON.stringify(this._generateBody(this.count)),
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
