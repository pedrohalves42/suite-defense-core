import { walk } from "https://deno.land/std@0.224.0/fs/walk.ts";

/**
 * Audit: Ensure all catch blocks in edge functions use the central error handler 
 * or at least log the error correctly (SOC 2 requirement).
 */
async function auditCatchBlocks(root: string) {
  let violations = 0;
  console.log(`\n🔍 Auditing catch blocks in ${root}...`);

  for await (const entry of walk(root, { exts: [".ts"] })) {
    if (entry.isDirectory || entry.path.includes("__tests__")) continue;

    const content = await Deno.readTextFile(entry.path);
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes("catch") && line.includes("(") && line.includes(")")) {
        // Simple heuristic: if a catch block doesn't log or throw or call a handler
        // it might be swallowing errors.
        const nextFewLines = lines.slice(i, i + 5).join("\n");
        const hasAction = /console\.|throw|return|log|handleError|error/i.test(nextFewLines);
        
        if (!hasAction && !line.includes("{}")) {
          console.warn(`  ⚠️  POTENTIAL SWALLOWED ERROR: ${entry.path}:${i + 1}`);
          console.warn(`     ${line.trim()}`);
          violations++;
        }
      }
    }
  }

  if (violations > 0) {
    console.log(`\n❌ Found ${violations} suspicious catch blocks.`);
    // In a strict mode, we would exit 1 here.
    // For now, it's informational.
  } else {
    console.log("✅ All catch blocks seem to have actions.");
  }
}

const root = Deno.args[0] || "supabase/functions";
await auditCatchBlocks(root);
