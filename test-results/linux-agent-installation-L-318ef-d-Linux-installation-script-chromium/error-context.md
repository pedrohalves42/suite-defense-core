# Page snapshot

```yaml
- generic [ref=e3]:
  - generic [ref=e4]: "[plugin:vite:import-analysis] Failed to resolve import \"jspdf\" from \"src/pages/admin/ComplianceTimeline.tsx\". Does the file exist?"
  - generic [ref=e5]: F:/suite-defense-core/src/pages/admin/ComplianceTimeline.tsx:28:35
  - generic [ref=e6]: "42 | try { 43 | if (!jsPDFInstance) { 44 | jsPDFInstance = await import('jspdf'); | ^ 45 | } 46 | if (!autoTableInstance) {"
  - generic [ref=e7]: at TransformPluginContext._formatError (file:///F:/suite-defense-core/node_modules/vite/dist/node/chunks/dep-C6uTJdX2.js:49258:41) at TransformPluginContext.error (file:///F:/suite-defense-core/node_modules/vite/dist/node/chunks/dep-C6uTJdX2.js:49253:16) at normalizeUrl (file:///F:/suite-defense-core/node_modules/vite/dist/node/chunks/dep-C6uTJdX2.js:64291:23) at async file:///F:/suite-defense-core/node_modules/vite/dist/node/chunks/dep-C6uTJdX2.js:64423:39 at async Promise.all (index 19) at async TransformPluginContext.transform (file:///F:/suite-defense-core/node_modules/vite/dist/node/chunks/dep-C6uTJdX2.js:64350:7) at async PluginContainer.transform (file:///F:/suite-defense-core/node_modules/vite/dist/node/chunks/dep-C6uTJdX2.js:49099:18) at async loadAndTransform (file:///F:/suite-defense-core/node_modules/vite/dist/node/chunks/dep-C6uTJdX2.js:51977:27
  - generic [ref=e8]:
    - text: Click outside, press Esc key, or fix the code to dismiss.
    - text: You can also disable this overlay by setting
    - code [ref=e9]: server.hmr.overlay
    - text: to
    - code [ref=e10]: "false"
    - text: in
    - code [ref=e11]: vite.config.ts
    - text: .
```