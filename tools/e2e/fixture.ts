// A throwaway repo for one scenario run: <root>/repo is the working copy,
// <root>/origin.git a local bare repo standing in for GitHub (ADR 0005).

import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export interface Fixture {
  root: string;
  repo: string;
  origin: string;
  git(...args: string[]): string;
}

/** The minimal loop config every fixture gets unless it supplies its own. */
export const DEFAULT_LOOP_CONFIG = `---
version: 1
sizes:
  trivial: { description: Wording only., process: edit-living-spec, approver: review-model }
  small: { description: A contained change., process: change-folder, approver: review-model }
  big: { description: A new capability or open questions., process: grill-then-change-folder, approver: human }
---

# Loop config (test fixture)
`;

export async function createFixture(files: Record<string, string> = {}): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), "e2e-"));
  const repo = join(root, "repo");
  const origin = join(root, "origin.git");
  const all = { "factory/loop.md": DEFAULT_LOOP_CONFIG, ...files };
  for (const [path, content] of Object.entries(all)) {
    await mkdir(dirname(join(repo, path)), { recursive: true });
    await writeFile(join(repo, path), content);
  }

  const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
  execFileSync("git", ["init", "--quiet", "--bare", "--initial-branch=main", origin]);
  git("init", "--quiet", "--initial-branch=main");
  git("config", "user.name", "E2E Fixture");
  git("config", "user.email", "e2e@example.invalid");
  git("config", "commit.gpgsign", "false");
  git("add", "--all");
  git("commit", "--quiet", "--message", "Fixture");
  git("remote", "add", "origin", origin);
  git("push", "--quiet", "--set-upstream", "origin", "main");
  return { root, repo, origin, git };
}
