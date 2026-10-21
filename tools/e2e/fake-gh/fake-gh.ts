// Fake `gh` for scenario tests (ADR 0005). Every call is appended to
// $FAKE_GH_DIR/calls.jsonl; responses come from $FAKE_GH_DIR/state.json.
// Unsupported commands exit 1, so a skill relying on them fails loudly.

import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface FakeIssue {
  number: number;
  title: string;
  body: string;
  labels: string[];
  state: "OPEN" | "CLOSED";
}

export interface FakePr {
  number: number;
  title: string;
  body: string;
  base: string;
  head: string;
  state: "OPEN" | "MERGED" | "CLOSED";
  reviewDecision: "" | "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED";
  files: string[];
  comments: string[];
}

export interface FakeGhState {
  repo: string;
  nextNumber: number;
  issues: FakeIssue[];
  prs: FakePr[];
}

export interface GhCall {
  argv: string[];
  cwd: string;
}

export const emptyState = (): FakeGhState => ({ repo: "fake-owner/fake-repo", nextNumber: 1, issues: [], prs: [] });

interface Args {
  positional: string[];
  flags: Map<string, string | true>;
}

const BOOLEAN_FLAGS = new Set(["approve", "request-changes", "comment", "draft", "merge", "squash", "rebase", "web"]);

function parseArgs(argv: string[]): Args {
  const positional: string[] = [];
  const flags = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("-")) {
      positional.push(arg);
      continue;
    }
    const name = arg.replace(/^-+/, "");
    const eq = name.indexOf("=");
    if (eq >= 0) {
      flags.set(name.slice(0, eq), name.slice(eq + 1));
    } else if (BOOLEAN_FLAGS.has(name) || i + 1 >= argv.length) {
      flags.set(name, true);
    } else {
      flags.set(name, argv[++i]);
    }
  }
  return { positional, flags };
}

const SHORT: Record<string, string> = { t: "title", b: "body", B: "base", H: "head", l: "label", s: "state", F: "body-file", R: "repo" };

function flag(args: Args, name: string): string | undefined {
  for (const [key, value] of args.flags) {
    if ((key === name || SHORT[key] === name) && typeof value === "string") return value;
  }
  return undefined;
}

function has(args: Args, name: string): boolean {
  return [...args.flags.keys()].some((key) => key === name || SHORT[key] === name);
}

function pick(object: object, fields: string | undefined): object {
  if (!fields) return object;
  const record = object as Record<string, unknown>;
  return Object.fromEntries(fields.split(",").map((f) => [f, record[f]]));
}

function issueJson(issue: FakeIssue) {
  return { ...issue, labels: issue.labels.map((name) => ({ name })) };
}

function prJson(pr: FakePr, repo: string) {
  return {
    ...pr,
    baseRefName: pr.base,
    headRefName: pr.head,
    url: `https://github.com/${repo}/pull/${pr.number}`,
    files: pr.files.map((path) => ({ path })),
    comments: pr.comments.map((body) => ({ body })),
  };
}

export function runFakeGh(argv: string[], cwd: string, dir: string): { stdout: string; stderr: string; code: number } {
  const call: GhCall = { argv, cwd };
  appendFileSync(join(dir, "calls.jsonl"), JSON.stringify(call) + "\n");
  const statePath = join(dir, "state.json");
  const state: FakeGhState = JSON.parse(readFileSync(statePath, "utf8"));
  const save = () => writeFileSync(statePath, JSON.stringify(state, null, 2));
  const out = (value: unknown) => ({ stdout: typeof value === "string" ? value + "\n" : JSON.stringify(value) + "\n", stderr: "", code: 0 });
  const fail = (message: string) => ({ stdout: "", stderr: `fake gh: ${message}\n`, code: 1 });
  const git = (...gitArgs: string[]) => execFileSync("git", gitArgs, { cwd, encoding: "utf8" }).trim();

  const [group, command, ...rest] = argv;
  const args = parseArgs(rest);
  const json = flag(args, "json");
  const findPr = () => {
    const ref = args.positional[0] ?? git("rev-parse", "--abbrev-ref", "HEAD");
    return state.prs.find((p) => String(p.number) === ref.replace(/^#/, "") || p.head === ref);
  };

  switch (`${group} ${command}`) {
    case "auth status":
      return out(`github.com\n  ✓ Logged in to github.com account fake-user (fake)`);
    case "repo view":
      return out(json ? pick({ nameWithOwner: state.repo, name: state.repo.split("/")[1] }, json) : state.repo);

    case "issue list": {
      const label = flag(args, "label");
      const wanted = (flag(args, "state") ?? "open").toUpperCase();
      const issues = state.issues.filter(
        (i) => (!label || i.labels.includes(label)) && (wanted === "ALL" || i.state === wanted),
      );
      if (json) return out(issues.map((i) => pick(issueJson(i), json)));
      return out(issues.map((i) => `${i.number}\t${i.state}\t${i.title}\t${i.labels.join(", ")}`).join("\n"));
    }
    case "issue view": {
      const issue = state.issues.find((i) => String(i.number) === args.positional[0]?.replace(/^#/, ""));
      if (!issue) return fail(`no issue ${args.positional[0]}`);
      return out(json ? pick(issueJson(issue), json) : `${issue.title}\n\n${issue.body}`);
    }

    case "pr create": {
      const head = flag(args, "head") ?? git("rev-parse", "--abbrev-ref", "HEAD");
      const base = flag(args, "base") ?? "main";
      const bodyFile = flag(args, "body-file");
      const body = flag(args, "body") ?? (bodyFile ? readFileSync(join(cwd, bodyFile), "utf8") : "");
      const title = flag(args, "title");
      if (!title) return fail("pr create needs --title");
      if (state.prs.some((p) => p.head === head && p.state === "OPEN")) return fail(`a pull request for branch "${head}" already exists`);
      const files = git("diff", "--name-only", `${base}...${head}`).split("\n").filter(Boolean);
      const pr: FakePr = { number: state.nextNumber++, title, body, base, head, state: "OPEN", reviewDecision: "", files, comments: [] };
      state.prs.push(pr);
      save();
      return out(prJson(pr, state.repo).url);
    }
    case "pr view": {
      const pr = findPr();
      if (!pr) return fail("no pull requests found");
      const view = prJson(pr, state.repo);
      return out(json ? pick(view, json) : `${pr.title} #${pr.number}\n${pr.state}\n\n${pr.body}`);
    }
    case "pr list": {
      const wanted = (flag(args, "state") ?? "open").toUpperCase();
      const prs = state.prs.filter((p) => wanted === "ALL" || p.state === wanted);
      if (json) return out(prs.map((p) => pick(prJson(p, state.repo), json)));
      return out(prs.map((p) => `${p.number}\t${p.title}\t${p.head}\t${p.state}`).join("\n"));
    }
    case "pr comment": {
      const pr = findPr();
      if (!pr) return fail("no pull requests found");
      pr.comments.push(flag(args, "body") ?? "");
      save();
      return out(`https://github.com/${state.repo}/pull/${pr.number}#comment`);
    }
    case "pr review": {
      const pr = findPr();
      if (!pr) return fail("no pull requests found");
      if (has(args, "approve")) pr.reviewDecision = "APPROVED";
      else if (has(args, "request-changes")) pr.reviewDecision = "CHANGES_REQUESTED";
      const body = flag(args, "body");
      if (body) pr.comments.push(body);
      save();
      return out("");
    }
    case "pr merge": {
      const pr = findPr();
      if (!pr) return fail("no pull requests found");
      if (pr.state !== "OPEN") return fail(`pull request #${pr.number} is ${pr.state}`);
      pr.state = "MERGED";
      save();
      return out("");
    }
    default:
      return fail(`unsupported command: gh ${argv.join(" ")}`);
  }
}

if (import.meta.main) {
  const dir = process.env.FAKE_GH_DIR;
  if (!dir) {
    process.stderr.write("fake gh: FAKE_GH_DIR is not set\n");
    process.exit(1);
  }
  const { stdout, stderr, code } = runFakeGh(process.argv.slice(2), process.cwd(), dir);
  process.stdout.write(stdout);
  process.stderr.write(stderr);
  process.exitCode = code;
}
