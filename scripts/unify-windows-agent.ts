
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";

const SOURCE_PATH = "agents/windows/main.ps1";
const MODULES_DIR = "agents/windows/modules";
const TARGET_PATH = "supabase/functions/_shared/agent-script-windows.ps1";

function bundleAgent() {
  console.log(`Bundling Windows agent from ${SOURCE_PATH}...`);
  
  let mainContent = readFileSync(SOURCE_PATH, "utf-8");
  
  // Replace module loading with inlined content
  // Pattern: . "$modulePath\utils.ps1"
  const moduleRegex = /^\.\s+"\$modulePath\\([^"]+)"/gm;
  
  mainContent = mainContent.replace(moduleRegex, (match, moduleFile) => {
    const modulePath = join(MODULES_DIR, moduleFile);
    console.log(`  Inlining module: ${moduleFile}`);
    try {
      const moduleContent = readFileSync(modulePath, "utf-8");
      return `\n# --- BEGIN MODULE: ${moduleFile} ---\n${moduleContent}\n# --- END MODULE: ${moduleFile} ---\n`;
    } catch (err) {
      console.error(`  Error reading module ${moduleFile}: ${err.message}`);
      return match;
    }
  });

  // Remove the module path initialization
  mainContent = mainContent.replace(/^\$modulePath\s+=\s+Join-Path.*/gm, "# Module path initialization removed for bundled script");

  // Validate for Invoke-Expression (IEX)
  const forbiddenRegex = /\b(Invoke-Expression|IEX)\b/gi;
  if (forbiddenRegex.test(mainContent)) {
    console.warn("WARNING: Bundled script contains Invoke-Expression or IEX. Please ensure it is not used with dynamic data.");
  }

  writeFileSync(TARGET_PATH, mainContent, "utf-8");
  console.log(`Successfully bundled agent to ${TARGET_PATH}`);
}

bundleAgent();
