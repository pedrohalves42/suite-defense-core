# Page snapshot

```yaml
- generic [ref=e3]:
  - generic [ref=e4]: "[plugin:vite:import-analysis] Failed to resolve import \"jspdf\" from \"src/pages/admin/ComplianceTimeline.tsx\". Does the file exist?"
  - generic [ref=e5]: C:/Users/Pedro/suite-defense-core/src/pages/admin/ComplianceTimeline.tsx:24:11
  - generic [ref=e6]: "39 | const loadJsPDF = async ()=>{ 40 | const [jsPDFModule, autoTableModule] = await Promise.all([ 41 | import('jspdf'), | ^ 42 | import('jspdf-autotable') 43 | ]);"
  - generic [ref=e7]: at TransformPluginContext._formatError (file:///C:/Users/Pedro/suite-defense-core/node_modules/vite/dist/node/chunks/dep-C6uTJdX2.js:49258:41) at TransformPluginContext.error (file:///C:/Users/Pedro/suite-defense-core/node_modules/vite/dist/node/chunks/dep-C6uTJdX2.js:49253:16) at normalizeUrl (file:///C:/Users/Pedro/suite-defense-core/node_modules/vite/dist/node/chunks/dep-C6uTJdX2.js:64291:23) at async file:///C:/Users/Pedro/suite-defense-core/node_modules/vite/dist/node/chunks/dep-C6uTJdX2.js:64423:39 at async Promise.all (index 19) at async TransformPluginContext.transform (file:///C:/Users/Pedro/suite-defense-core/node_modules/vite/dist/node/chunks/dep-C6uTJdX2.js:64350:7) at async PluginContainer.transform (file:///C:/Users/Pedro/suite-defense-core/node_modules/vite/dist/node/chunks/dep-C6uTJdX2.js:49099:18) at async loadAndTransform (file:///C:/Users/Pedro/suite-defense-core/node_modules/vite/dist/node/chunks/dep-C6uTJdX2.js:51977:27) at async viteTransformMiddleware (file:///C:/Users/Pedro/suite-defense-core/node_modules/vite/dist/node/chunks/dep-C6uTJdX2.js:62105:24
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