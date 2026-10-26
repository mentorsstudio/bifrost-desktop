// Stand-in for Tauri's injected object, for the screenshot pages (dev only).
(() => {
  const listeners = new Map();
  const fixtures = window.__FIXTURES__ || {};
  window.__TAURI_INTERNALS__ = {
    transformCallback: (cb) => cb,
    invoke: async (cmd, args) => {
      if (cmd === "plugin:event|listen") { listeners.set(args.event, args.handler); return listeners.size; }
      if (cmd in fixtures) return typeof fixtures[cmd] === "function" ? fixtures[cmd](args) : fixtures[cmd];
      return null;
    },
    metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
  };
  window.__emit = (event, payload) => { const h = listeners.get(event); if (h) h({ event, id: 0, payload }); };
})();
