#!/usr/bin/env node
/**
 * CyberShield Agent v6 Bundler
 * 
 * Concatenates main.ps1 + all modules into a single monolithic .ps1 file
 * suitable for delivery via the force-update / heartbeat mechanism.
 * 
 * Usage: node build-bundle.js [--output <path>] [--validate]
 * 
 * Output: agents/windows/dist/agent-v6.0.0-bundled.ps1
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const AGENTS_DIR = path.join(__dirname);
const MODULES_DIR = path.join(AGENTS_DIR, 'modules');
const DIST_DIR = path.join(AGENTS_DIR, 'dist');

// Module load order — must match main.ps1 exactly
const MODULE_ORDER = [
  // Foundation layer
  'config.ps1',
  'utils.ps1',
  'crypto.ps1',
  'hmac.ps1',
  // Infrastructure layer
  'telemetry.ps1',
  'security.ps1',
  'network.ps1',
  'state.ps1',
  'evidence.ps1',
  'notification.ps1',
  // Domain layer
  'collection.ps1',
  'remediation.ps1',
  'heartbeat.ps1',
  // Orchestration layer
  'self-heal.ps1',
  'update.ps1',
  'job-runner.ps1',
];

function readFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  return fs.readFileSync(filePath, 'utf-8');
}

function extractVersion(mainContent) {
  const match = mainContent.match(/\$Global:AgentVersion\s*=\s*"([^"]+)"/);
  return match ? match[1] : 'unknown';
}

function buildBundle() {
  console.log('=== CyberShield Agent v6 Bundler ===\n');

  // 1. Read main.ps1
  const mainPath = path.join(AGENTS_DIR, 'main.ps1');
  let mainContent = readFile(mainPath);
  const version = extractVersion(mainContent);
  console.log(`Agent version: ${version}`);

  // 2. Read all modules
  const modules = {};
  let totalModuleLines = 0;
  for (const mod of MODULE_ORDER) {
    const modPath = path.join(MODULES_DIR, mod);
    const content = readFile(modPath);
    const lines = content.split('\n').length;
    totalModuleLines += lines;
    modules[mod] = content;
    console.log(`  ✓ ${mod} (${lines} lines)`);
  }

  // 3. Check for modules on disk not in our order list
  const allModFiles = fs.readdirSync(MODULES_DIR).filter(f => f.endsWith('.ps1'));
  const missing = allModFiles.filter(f => !MODULE_ORDER.includes(f));
  if (missing.length > 0) {
    console.error(`\n❌ ERROR: Modules on disk NOT in bundle order: ${missing.join(', ')}`);
    console.error('   Add them to MODULE_ORDER in build-bundle.js');
    process.exit(1);
  }

  // 4. Build the bundled content
  // Split main.ps1 into: header (before module loading) and footer (after module loading)
  const lines = mainContent.split('\n');
  
  // Find the module loading section boundaries
  let moduleStartLine = -1;
  let moduleEndLine = -1;
  
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('# MODULE LOADING') && moduleStartLine === -1) {
      // Go back to find the "# ===..." line before it
      moduleStartLine = i > 0 && lines[i-1].includes('====') ? i - 1 : i;
    }
    if (moduleStartLine >= 0 && lines[i].match(/^\.\s+"\$modulePath/)) {
      moduleEndLine = i;
    }
  }
  
  if (moduleStartLine === -1 || moduleEndLine === -1) {
    throw new Error('Could not find module loading section in main.ps1');
  }
  
  // Also remove the $modulePath assignment line
  const modulePathLine = lines.findIndex(l => l.includes('$modulePath = Join-Path'));
  
  const headerLines = lines.slice(0, modulePathLine >= 0 ? modulePathLine : moduleStartLine);
  const footerLines = lines.slice(moduleEndLine + 1);
  
  // Build the output
  const parts = [];
  
  // Header from main.ps1 (globals, mutex, etc.)
  parts.push(headerLines.join('\n'));
  
  // Inline each module with clear section markers
  parts.push('\n# ============================================');
  parts.push('# INLINED MODULES (bundled by build-bundle.js)');
  parts.push('# ============================================\n');
  
  for (const mod of MODULE_ORDER) {
    const layer = mod === 'config.ps1' || mod === 'utils.ps1' || mod === 'crypto.ps1' || mod === 'hmac.ps1'
      ? 'Foundation'
      : mod === 'telemetry.ps1' || mod === 'security.ps1' || mod === 'network.ps1' || mod === 'state.ps1' || mod === 'evidence.ps1' || mod === 'notification.ps1'
        ? 'Infrastructure'
        : mod === 'collection.ps1' || mod === 'remediation.ps1' || mod === 'heartbeat.ps1'
          ? 'Domain'
          : 'Orchestration';
    
    parts.push(`# -- ${layer}: ${mod} ${'='.repeat(Math.max(1, 50 - mod.length - layer.length))}`)
    // Sanitize non-ASCII in module content (PS 5.1 safety)
    let modContent = modules[mod].trimEnd();
    modContent = modContent.replace(/\u2014/g, '--');   // em dash
    modContent = modContent.replace(/\u2013/g, '-');    // en dash
    modContent = modContent.replace(/\u2192/g, '->');   // right arrow
    modContent = modContent.replace(/\u2500/g, '-');    // box drawing
    modContent = modContent.replace(/[\u0080-\uFFFF]/g, (ch) => {
      console.warn(`  WARN: Replacing unknown non-ASCII U+${ch.charCodeAt(0).toString(16)} in ${mod}`);
      return '?';
    });
    parts.push(modContent);
    parts.push('');
  }
  
  // Footer from main.ps1 (Main function + call)
  parts.push(footerLines.join('\n'));
  
  const bundled = parts.join('\n');
  
  // 5. Validate: no non-ASCII characters (PS 5.1 requirement)
  const nonAscii = [];
  for (let i = 0; i < bundled.length; i++) {
    if (bundled.charCodeAt(i) > 127) {
      const lineNum = bundled.substring(0, i).split('\n').length;
      const char = bundled[i];
      nonAscii.push({ line: lineNum, char, code: bundled.charCodeAt(i) });
    }
  }
  
  // 6. Validate: no remaining dot-source references
  const dotSourceRefs = bundled.match(/^\.\s+"\$modulePath\\/gm);
  if (dotSourceRefs) {
    console.error(`\n❌ ERROR: ${dotSourceRefs.length} unresolved dot-source references remain!`);
    process.exit(1);
  }
  
  // 7. Calculate SHA-256
  const sha256 = crypto.createHash('sha256').update(bundled, 'utf-8').digest('hex');
  
  // 8. Write output
  if (!fs.existsSync(DIST_DIR)) {
    fs.mkdirSync(DIST_DIR, { recursive: true });
  }
  
  const outputPath = path.join(DIST_DIR, `agent-v${version}-bundled.ps1`);
  fs.writeFileSync(outputPath, bundled, 'utf-8');
  
  // Stats
  const bundledLines = bundled.split('\n').length;
  const mainLines = lines.length;
  
  console.log(`\n=== Bundle Results ===`);
  console.log(`  Modules inlined: ${MODULE_ORDER.length}`);
  console.log(`  main.ps1 lines:  ${mainLines}`);
  console.log(`  Module lines:    ${totalModuleLines}`);
  console.log(`  Bundle lines:    ${bundledLines}`);
  console.log(`  Bundle size:     ${(bundled.length / 1024).toFixed(1)} KB`);
  console.log(`  SHA-256:         ${sha256}`);
  console.log(`  Non-ASCII chars: ${nonAscii.length}${nonAscii.length > 0 ? ' ⚠️ WARNING' : ' ✓'}`);
  
  if (nonAscii.length > 0 && nonAscii.length <= 20) {
    for (const n of nonAscii) {
      console.log(`    Line ${n.line}: '${n.char}' (U+${n.code.toString(16).padStart(4, '0')})`);
    }
  }
  
  console.log(`\n  Output: ${outputPath}`);
  console.log(`\n✅ Bundle complete!`);
  
  // Write metadata
  const meta = {
    version: `v${version}`,
    sha256,
    bundled_at: new Date().toISOString(),
    modules: MODULE_ORDER,
    lines: bundledLines,
    size_bytes: bundled.length,
    non_ascii_count: nonAscii.length,
    platform: 'windows',
    channel: 'stable',
  };
  fs.writeFileSync(path.join(DIST_DIR, 'bundle-meta.json'), JSON.stringify(meta, null, 2));
  
  return { outputPath, sha256, version, lines: bundledLines, nonAscii };
}

buildBundle();
