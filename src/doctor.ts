import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import pc from "picocolors";
import { CONFIG_FILE } from "./config.js";
import { validateConfig, formatValidationIssues } from "./config-validate.js";

function which(cmd: string): string | null {
  try {
    return execSync(`which ${cmd}`, { encoding: "utf-8" }).trim();
  } catch {
    return null;
  }
}

function check(label: string, ok: boolean, hint = ""): boolean {
  const mark = ok ? pc.green("✓") : pc.red("✗");
  const suffix = !ok && hint ? `  → ${hint}` : "";
  console.log(`  ${mark} ${label}${suffix}`);
  return ok;
}

export function runDoctor(): void {
  console.log("\nKlaus Doctor\n");
  let allOk = true;

  // Node.js version
  const [major] = process.versions.node.split(".").map(Number);
  allOk &&= check(
    `Node.js ${process.version}`,
    major >= 18,
    "need Node.js >= 18",
  );

  // Claude CLI
  const claudePath = which("claude");
  allOk &&= check(
    "Claude Code CLI",
    claudePath !== null,
    "npm i -g @anthropic-ai/claude-code",
  );

  // Config file existence
  const cfgExists = existsSync(CONFIG_FILE);
  allOk &&= check(
    `Config file (${CONFIG_FILE})`,
    cfgExists,
    "run: klaus setup",
  );

  // Config validation (reuse shared validation logic)
  if (cfgExists) {
    const result = validateConfig();
    if (result.valid) {
      const channel = result.config.channel as string;
      allOk &&= check(`Config valid (channel: ${channel})`, true);
    } else {
      allOk &&= check("Config validation", false, "see details below");
      console.log();
      console.log(formatValidationIssues(result.issues));
    }
  }

  console.log();
  if (allOk) {
    console.log(`  ${pc.green("All checks passed!")} Run: klaus start\n`);
  } else {
    console.log(
      "  Some checks failed. Fix the issues above and re-run doctor.\n",
    );
  }
}
