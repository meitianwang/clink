import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import pc from "picocolors";
import { CONFIG_FILE } from "./config.js";
import { validateConfig, formatValidationIssues } from "./config-validate.js";

function which(cmd: string): string | null {
  try {
    return execFileSync("which", [cmd], { encoding: "utf-8" }).trim();
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
      const rawChannel = result.config.channel;
      const channels: string[] = Array.isArray(rawChannel)
        ? rawChannel.map(String)
        : [String(rawChannel)];
      allOk &&= check(`Config valid (channel: ${channels.join(", ")})`, true);

      // Check tunnel CLI prerequisites for web channel
      if (channels.includes("web")) {
        const webSection = (result.config.web as Record<string, unknown>) ?? {};
        const tunnel = webSection.tunnel;
        if (tunnel === true) {
          allOk &&= check(
            "cloudflared CLI (Quick Tunnel)",
            which("cloudflared") !== null,
            "brew install cloudflared",
          );
        } else if (typeof tunnel === "object" && tunnel !== null) {
          const provider = (tunnel as Record<string, unknown>).provider;
          if (provider === "cloudflare-quick" || provider === "cloudflare") {
            allOk &&= check(
              "cloudflared CLI",
              which("cloudflared") !== null,
              "brew install cloudflared",
            );
          } else if (provider === "ngrok") {
            allOk &&= check(
              "ngrok CLI",
              which("ngrok") !== null,
              "brew install ngrok",
            );
          } else if (provider === "frp") {
            allOk &&= check(
              "frpc CLI",
              which("frpc") !== null,
              "https://github.com/fatedier/frp/releases",
            );
          }
        }
      }
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
