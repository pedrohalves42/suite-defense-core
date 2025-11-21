// tools/validate-system-full.ts
// Full system validator: ASCII safety, PowerShell patterns, SQL jobs v3, edge functions, CI hooks.

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

type Severity = "error" | "warn";

interface Issue {
  file: string;
  line?: number;
  column?: number;
  rule: string;
  severity: Severity;
  message: string;
  snippet?: string;
}

interface Report {
  startedAt: string;
  finishedAt: string;
  issues: Issue[];
  summary: {
    errors: number;
    warnings: number;
  };
}

const projectRoot = process.cwd();

function readFileSafe(filePath: string): string {
  return fs.readFileSync(filePath, { encoding: "utf8" });
}

function listFilesRecursive(dir: string, exts: string[]): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...listFilesRecursive(full, exts));
    } else {
      if (exts.includes(path.extname(entry.name))) {
        results.push(full);
      }
    }
  }
  return results;
}

function relativePath(p: string): string {
  return path.relative(projectRoot, p).replace(/\\/g, "/");
}

function hasNonAscii(content: string): boolean {
  for (let i = 0; i < content.length; i++) {
    const code = content.charCodeAt(i);
    if (code > 127) return true;
  }
  return false;
}

function findLinesMatching(
  content: string,
  pattern: RegExp
): { line: number; snippet: string }[] {
  const lines = content.split(/\r?\n/);
  const results: { line: number; snippet: string }[] = [];

  lines.forEach((line, idx) => {
    if (pattern.test(line)) {
      results.push({ line: idx + 1, snippet: line.trim() });
    }
  });

  return results;
}

function addIssue(
  issues: Issue[],
  partial: Omit<Issue, "severity"> & { severity?: Severity }
) {
  issues.push({
    severity: partial.severity ?? "error",
    ...partial,
  });
}

function runCommandSafe(
  cmd: string,
  args: string[],
  label: string,
  issues: Issue[]
) {
  const full = `${cmd} ${args.join(" ")}`.trim();
  try {
    console.log(`\n[validate-system] Running: ${full}`);
    execSync(full, {
      stdio: "inherit",
      cwd: projectRoot,
      env: process.env,
    });
  } catch (err: any) {
    addIssue(issues, {
      file: "<process>",
      rule: `command:${label}`,
      message: `Command "${full}" failed: ${err?.message ?? String(err)}`,
      severity: "error",
    });
  }
}

function validateAsciiAndPatterns(issues: Issue[]) {
  console.log("[validate-system] Checking ASCII and PowerShell patterns...");

  const sensitiveFileConfig: { base: string; exts: string[] }[] = [
    { base: "public/agent-scripts", exts: [".ps1"] },
    { base: "supabase/functions/_shared", exts: [".ts", ".ps1"] },
  ];

  const sensitiveFiles: string[] = [];

  for (const cfg of sensitiveFileConfig) {
    const fullDir = path.join(projectRoot, cfg.base);
    sensitiveFiles.push(...listFilesRecursive(fullDir, cfg.exts));
  }

  const nonAsciiRule = "no-non-ascii-in-sensitive-files";
  const badPatternRule = "no-invalid-variable-reference-drive";

  const badPattern = /:\s*\$_/;

  for (const file of sensitiveFiles) {
    const rel = relativePath(file);
    const content = readFileSafe(file);

    const isPowerShellOrTemplate =
      file.endsWith(".ps1") ||
      rel === "supabase/functions/_shared/agent-script-windows-content.ts" ||
      rel === "supabase/functions/_shared/installer-template.ts" ||
      rel === "supabase/functions/build-agent-exe/index.ts";

    if (isPowerShellOrTemplate && hasNonAscii(content)) {
      const lines = content.split(/\r?\n/);
      lines.forEach((line, idx) => {
        if ([...line].some(char => char.charCodeAt(0) > 127)) {
          addIssue(issues, {
            file: rel,
            line: idx + 1,
            rule: nonAsciiRule,
            message:
              "Non ASCII character found in sensitive file (remove accents, emoji, special symbols).",
            snippet: line.trim(),
            severity: "error",
          });
        }
      });
    }

    const badMatches = findLinesMatching(content, badPattern);
    for (const m of badMatches) {
      addIssue(issues, {
        file: rel,
        line: m.line,
        rule: badPatternRule,
        message:
          "Pattern ': $_' found. This causes InvalidVariableReferenceWithDrive in PowerShell 5.1. Use $($_.Exception.Message) or another form.",
        snippet: m.snippet,
        severity: "error",
      });
    }
  }
}

function validateAgentScript(issues: Issue[]) {
  console.log("[validate-system] Checking embedded agent script...");

  const agentEmbeddedPath = path.join(
    projectRoot,
    "supabase/functions/_shared/agent-script-windows-content.ts"
  );

  if (!fs.existsSync(agentEmbeddedPath)) {
    addIssue(issues, {
      file: "supabase/functions/_shared/agent-script-windows-content.ts",
      rule: "missing-agent-script",
      message:
        "agent-script-windows-content.ts not found. Cannot validate embedded agent.",
      severity: "error",
    });
    return;
  }

  const rel = relativePath(agentEmbeddedPath);
  const content = readFileSafe(agentEmbeddedPath);

  const requiredFunctions = [
    "function Submit-JobResult",
    "function Send-Heartbeat",
    "function Poll-Jobs",
    "function Get-HmacSignature",
  ];

  for (const fn of requiredFunctions) {
    if (!content.includes(fn)) {
      addIssue(issues, {
        file: rel,
        rule: "agent-missing-critical-function",
        message: `Critical function "${fn}" not found in embedded agent script.`,
        severity: "error",
      });
    }
  }

  if (!content.match(/\$StartedAt/)) {
    addIssue(issues, {
      file: rel,
      rule: "agent-missing-started-at",
      message:
        "StartedAt parameter or variable not found in agent script. Jobs v3 need started_at.",
      severity: "warn",
    });
  }
}

function validateInstallerTemplate(issues: Issue[]) {
  console.log("[validate-system] Checking installer template...");

  const installerTemplatePath = path.join(
    projectRoot,
    "supabase/functions/_shared/installer-template.ts"
  );

  if (!fs.existsSync(installerTemplatePath)) {
    addIssue(issues, {
      file: "supabase/functions/_shared/installer-template.ts",
      rule: "missing-installer-template",
      message:
        "installer-template.ts not found. Cannot validate Windows installer template.",
      severity: "error",
    });
    return;
  }

  const rel = relativePath(installerTemplatePath);
  const content = readFileSafe(installerTemplatePath);

  if (!content.includes("WINDOWS_INSTALLER_TEMPLATE")) {
    addIssue(issues, {
      file: rel,
      rule: "installer-missing-template-export",
      message:
        "WINDOWS_INSTALLER_TEMPLATE export not found in installer-template.ts.",
      severity: "error",
    });
  }

  if (!content.includes("{{AGENT_SCRIPT_CONTENT}}")) {
    addIssue(issues, {
      file: rel,
      rule: "installer-missing-agent-script-placeholder",
      message:
        "AGENT_SCRIPT_CONTENT placeholder not found in installer template. Agent script may not be injected.",
      severity: "error",
    });
  }
}

function validateSqlJobsV3(issues: Issue[]) {
  console.log("[validate-system] Checking SQL migrations and jobs_normalized view...");

  const migrationsDir = path.join(projectRoot, "supabase", "migrations");
  if (!fs.existsSync(migrationsDir)) {
    addIssue(issues, {
      file: "supabase/migrations",
      rule: "missing-migrations-dir",
      message: "supabase/migrations directory not found.",
      severity: "warn",
    });
  } else {
    const sqlFiles = listFilesRecursive(migrationsDir, [".sql"]);
    let foundJobsMigration = false;

    for (const file of sqlFiles) {
      const content = readFileSafe(file);
      const rel = relativePath(file);
      if (content.includes("ALTER TABLE jobs") || content.includes("CREATE TABLE jobs")) {
        foundJobsMigration = true;
        for (const col of [
          "output",
          "error_message",
          "started_at",
          "finished_at",
          "execution_time_seconds",
        ]) {
          if (!content.includes(col)) {
            addIssue(issues, {
              file: rel,
              rule: "jobs-migration-missing-column",
              message: `Migration that alters jobs table does not mention column "${col}".`,
              severity: "warn",
            });
          }
        }
      }
    }

    if (!foundJobsMigration) {
      addIssue(issues, {
        file: "supabase/migrations",
        rule: "jobs-migration-not-found",
        message:
          "No migration found that alters jobs table. Ensure jobs v3 columns have migrations.",
        severity: "warn",
      });
    }
  }
}

function validateEdgeFunctionsLogic(issues: Issue[]) {
  console.log("[validate-system] Checking edge functions logic...");

  const submitJobResultPath = path.join(
    projectRoot,
    "supabase/functions/submit-job-result/index.ts"
  );
  if (fs.existsSync(submitJobResultPath)) {
    const rel = relativePath(submitJobResultPath);
    const content = readFileSafe(submitJobResultPath);

    if (
      !content.includes("completed") ||
      !content.includes("failed")
    ) {
      addIssue(issues, {
        file: rel,
        rule: "submit-job-result-status-validation",
        message:
          "submit-job-result should validate status to be either 'completed' or 'failed'.",
        severity: "error",
      });
    }

    const updateFields = [
      "output",
      "error_message",
      "finished_at",
      "execution_time_seconds",
    ];
    for (const field of updateFields) {
      if (!content.includes(field)) {
        addIssue(issues, {
          file: rel,
          rule: "submit-job-result-missing-update-field",
          message: `submit-job-result does not update field "${field}" in jobs table.`,
          severity: "error",
        });
      }
    }
  } else {
    addIssue(issues, {
      file: "supabase/functions/submit-job-result/index.ts",
      rule: "missing-submit-job-result",
      message: "submit-job-result edge function not found.",
      severity: "error",
    });
  }

  const serveInstallerPath = path.join(
    projectRoot,
    "supabase/functions/serve-installer/index.ts"
  );
  if (fs.existsSync(serveInstallerPath)) {
    const rel = relativePath(serveInstallerPath);
    const content = readFileSafe(serveInstallerPath);

    if (!content.includes("WINDOWS_INSTALLER_TEMPLATE")) {
      addIssue(issues, {
        file: rel,
        rule: "serve-installer-missing-template",
        message:
          "serve-installer does not reference WINDOWS_INSTALLER_TEMPLATE.",
        severity: "error",
      });
    }
  } else {
    addIssue(issues, {
      file: "supabase/functions/serve-installer/index.ts",
      rule: "missing-serve-installer",
      message: "serve-installer edge function not found.",
      severity: "error",
    });
  }
}

function validateCiConfig(issues: Issue[]) {
  console.log("[validate-system] Checking CI configuration...");

  const pkgPath = path.join(projectRoot, "package.json");
  let hasValidateSystemScript = false;

  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    const scripts = pkg.scripts || {};

    hasValidateSystemScript = Boolean(scripts["validate:system"]);

    if (!hasValidateSystemScript) {
      addIssue(issues, {
        file: "package.json",
        rule: "missing-validate-scripts",
        message:
          "validate:system script not found in package.json. Consider adding a full validation script.",
        severity: "warn",
      });
    }
  } else {
    addIssue(issues, {
      file: "package.json",
      rule: "missing-package-json",
      message: "package.json not found.",
      severity: "error",
    });
  }

  const workflowsDir = path.join(projectRoot, ".github", "workflows");
  if (!fs.existsSync(workflowsDir)) {
    addIssue(issues, {
      file: ".github/workflows",
      rule: "missing-github-workflows",
      message:
        ".github/workflows directory not found. CI might not be configured.",
      severity: "warn",
    });
    return;
  }

  const yamlFiles = listFilesRecursive(workflowsDir, [".yml", ".yaml"]);
  let foundValidationInCi = false;

  for (const file of yamlFiles) {
    const content = readFileSafe(file);
    if (
      content.includes("npm run validate:system") ||
      content.includes("npm run validate:all")
    ) {
      foundValidationInCi = true;
    }
  }

  if (!foundValidationInCi) {
    addIssue(issues, {
      file: ".github/workflows",
      rule: "ci-missing-validate-system",
      message:
        "CI workflows do not call 'npm run validate:system'. Full validation is not enforced in CI.",
      severity: "warn",
    });
  }
}

function runQualityCommands(issues: Issue[]) {
  console.log("[validate-system] Running quality commands...");

  const pkgPath = path.join(projectRoot, "package.json");
  if (!fs.existsSync(pkgPath)) {
    return;
  }

  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  const scripts = pkg.scripts || {};

  const commands: { label: string; cmd: string; args: string[] }[] = [];

  function hasScript(name: string): boolean {
    return Boolean(scripts[name]);
  }

  if (hasScript("typecheck")) {
    commands.push({ label: "typecheck", cmd: "npm", args: ["run", "typecheck"] });
  }
  if (hasScript("lint")) {
    commands.push({ label: "lint", cmd: "npm", args: ["run", "lint"] });
  }
  if (hasScript("test")) {
    commands.push({ label: "test", cmd: "npm", args: ["run", "test"] });
  }
  if (hasScript("validate:all")) {
    commands.push({
      label: "validate:all",
      cmd: "npm",
      args: ["run", "validate:all"],
    });
  }

  for (const c of commands) {
    runCommandSafe(c.cmd, c.args, c.label, issues);
  }
}

function main() {
  const startedAt = new Date().toISOString();
  const issues: Issue[] = [];

  console.log("[validate-system] Starting full system validation...");

  validateAsciiAndPatterns(issues);
  validateAgentScript(issues);
  validateInstallerTemplate(issues);
  validateSqlJobsV3(issues);
  validateEdgeFunctionsLogic(issues);
  validateCiConfig(issues);
  runQualityCommands(issues);

  const finishedAt = new Date().toISOString();
  const summary = {
    errors: issues.filter((i) => i.severity === "error").length,
    warnings: issues.filter((i) => i.severity === "warn").length,
  };

  const report: Report = {
    startedAt,
    finishedAt,
    issues,
    summary,
  };

  const reportPath = path.join(projectRoot, "guardian-report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

  console.log("\n[validate-system] Summary:");
  console.log(
    `  Errors: ${summary.errors}, Warnings: ${summary.warnings}. Report: ${relativePath(
      reportPath
    )}`
  );

  if (summary.errors > 0) {
    console.error(
      "[validate-system] Validation failed. Fix the errors above before generating installers or deploying."
    );
    process.exit(1);
  } else {
    console.log("[validate-system] Validation completed successfully.");
    process.exit(0);
  }
}

main();
