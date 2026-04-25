import { readTextFile, writeTextFile } from "node:fs/promises";
import { join } from "node:path";

async function sync() {
  const sourcePath = join(process.cwd(), "agents/windows/main.ps1");
  const targetPath = join(process.cwd(), "supabase/functions/_shared/agent-script-windows.ts");
  
  try {
    const content = await readTextFile(sourcePath);
    const tsContent = `/**
 * Windows Agent Script Source
 * Generated automatically from agents/windows/main.ps1
 */
export const WINDOWS_AGENT_SCRIPT_SOURCE = String.raw\`${content.replace(/`/g, "\\`")}\`;
`;
    await writeTextFile(targetPath, tsContent);
    console.log("✓ Windows agent source synced to _shared");
  } catch (err) {
    console.error("Failed to sync agent source:", err.message);
    process.exit(1);
  }
}

sync();
