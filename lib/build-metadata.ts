import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

function runGitCommand(command: string): string | null {
  try {
    return execSync(command, {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    }).trim();
  } catch {
    return null;
  }
}

function readPackageVersion(): string | null {
  try {
    const packageJsonPath = path.join(process.cwd(), "package.json");
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      version?: string;
    };
    return packageJson.version?.trim() || null;
  } catch {
    return null;
  }
}

export function getBuildBadgeLabel(): string {
  const explicitTag = process.env.NEXT_PUBLIC_APP_TAG?.trim();
  if (explicitTag) {
    return explicitTag;
  }

  const commitDate = runGitCommand("git log -1 --date=format:%Y-%m-%d --format=%cd");
  const commitSha = runGitCommand("git rev-parse --short HEAD");

  if (commitDate && commitSha) {
    return `Updated ${commitDate} (${commitSha})`;
  }

  if (commitDate) {
    return `Updated ${commitDate}`;
  }

  const packageVersion = readPackageVersion();
  if (packageVersion) {
    return `v${packageVersion}`;
  }

  return "Latest build";
}