# Page snapshot

```yaml
- generic [ref=e3]:
  - generic [ref=e4]: "[plugin:vite:import-analysis] Failed to resolve import \"jspdf\" from \"src/pages/admin/Reports.tsx\". Does the file exist?"
  - generic [ref=e5]: C:/Users/Pedro/suite-defense-core/src/pages/admin/Reports.tsx:197:41
  - generic [ref=e6]: "140| let autoTable; 141| try { 142| const jsPDFModule = await import('jspdf'); | ^ 143| jsPDFClass = jsPDFModule.jsPDF; 144| const autoTableModule = await import('jspdf-autotable');"
  - generic [ref=e7]: at TransformPluginContext._formatError (file:///C:/Users/Pedro/suite-defense-core/node_modules/vite/dist/node/chunks/dep-C6uTJdX2.js:49258:41) at TransformPluginContext.error (file:///C:/Users/Pedro/suite-defense-core/node_modules/vite/dist/node/chunks/dep-C6uTJdX2.js:49253:16) at normalizeUrl (file:///C:/Users/Pedro/suite-defense-core/node_modules/vite/dist/node/chunks/dep-C6uTJdX2.js:64291:23) at async file:///C:/Users/Pedro/suite-defense-core/node_modules/vite/dist/node/chunks/dep-C6uTJdX2.js:64423:39 at async Promise.all (index 17) at async TransformPluginContext.transform (file:///C:/Users/Pedro/suite-defense-core/node_modules/vite/dist/node/chunks/dep-C6uTJdX2.js:64350:7) at async PluginContainer.transform (file:///C:/Users/Pedro/suite-defense-core/node_modules/vite/dist/node/chunks/dep-C6uTJdX2.js:49099:18) at async loadAndTransform (file:///C:/Users/Pedro/suite-defense-core/node_modules/vite/dist/node/chunks/dep-C6uTJdX2.js:51977:27
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