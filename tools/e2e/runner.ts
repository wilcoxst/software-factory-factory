// Runs one scenario: a fresh fixture repo, the skills under test loaded as
// plugins, a scripted user answering AskUserQuestion, a fake gh on PATH, and
// the model for the scenario's role (ADR 0005). Returns everything a test
// needs to assert on.

import { mkdirSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { query, type SDKMessage, type SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";
import { emptyState, type FakeGhState, type GhCall } from "./fake-gh/fake-gh.ts";
import { createFixture, type Fixture } from "./fixture.ts";
import { recordRun, remainingUsd } from "./ledger.ts";
import { modelFor, type Role } from "./models.ts";
import { ScriptedUser, type Question } from "./scripted-user.ts";

const FAKE_GH_BIN = join(dirname(fileURLToPath(import.meta.url)), "fake-gh", "bin");
// Allowed in the callback rather than via allowedTools, which would bypass it.
const READ_ONLY_TOOLS = new Set(["Read", "Glob", "Grep", "Skill", "TodoWrite"]);

export interface ScenarioOptions {
  /** Scenario ID (or a descriptive name for non-scenario tests); used in results. */
  name: string;
  prompt: string;
  /** Extra fixture files; factory/loop.md gets a default unless given here. */
  files?: Record<string, string>;
  /** Plugin directories holding the skills under test. */
  plugins?: string[];
  /** Skills to enable; defaults to every skill the plugins provide. */
  skills?: string[] | "all";
  user?: ScriptedUser;
  gh?: Partial<FakeGhState>;
  role?: Role;
  maxTurns?: number;
  /** Per-scenario budget; also capped by what's left under E2E_MAX_COST_USD. */
  maxBudgetUsd?: number;
}

export interface ToolCall {
  name: string;
  input: Record<string, unknown>;
}

export interface ScenarioRun {
  fixture: Fixture;
  result: SDKResultMessage | undefined;
  messages: SDKMessage[];
  toolCalls: ToolCall[];
  /** Tool calls the harness refused (anything not auto-approved). */
  denied: ToolCall[];
  user: ScriptedUser;
  ghCalls: GhCall[];
  ghState: FakeGhState;
  costUsd: number;
}

export class CostCeilingReached extends Error {}

export async function runScenario(options: ScenarioOptions): Promise<ScenarioRun> {
  const remaining = remainingUsd();
  if (remaining <= 0) throw new CostCeilingReached(`E2E_MAX_COST_USD reached before ${options.name}`);

  const fixture = await createFixture(options.files);
  const ghDir = join(fixture.root, "gh");
  mkdirSync(ghDir);
  writeFileSync(join(ghDir, "state.json"), JSON.stringify({ ...emptyState(), ...options.gh }, null, 2));

  const user = options.user ?? new ScriptedUser();
  const messages: SDKMessage[] = [];
  const toolCalls: ToolCall[] = [];
  const denied: ToolCall[] = [];
  let result: SDKResultMessage | undefined;
  const started = Date.now();

  for await (const message of query({
    prompt: options.prompt,
    options: {
      cwd: fixture.repo,
      model: modelFor(options.role ?? "generative-model"),
      // Isolation: no user or project settings (e.g. personal hooks) leak in.
      settingSources: [],
      plugins: (options.plugins ?? []).map((path) => ({ type: "local" as const, path: resolve(path) })),
      skills: options.skills ?? "all",
      permissionMode: "acceptEdits",
      sandbox: {
        enabled: true,
        failIfUnavailable: true,
        autoAllowBashIfSandboxed: true,
        allowUnsandboxedCommands: false,
        filesystem: { allowWrite: [fixture.origin, ghDir] },
      },
      env: {
        ...process.env,
        PATH: `${FAKE_GH_BIN}:${process.env.PATH ?? ""}`,
        FAKE_GH_DIR: ghDir,
        GH_PROMPT_DISABLED: "1",
        GIT_TERMINAL_PROMPT: "0",
      },
      maxTurns: options.maxTurns ?? 40,
      maxBudgetUsd: Math.min(options.maxBudgetUsd ?? 2, remaining),
      canUseTool: async (toolName, input) => {
        if (toolName === "AskUserQuestion") {
          return { behavior: "allow", updatedInput: user.answer(input as { questions: Question[] }) };
        }
        if (READ_ONLY_TOOLS.has(toolName)) return { behavior: "allow", updatedInput: input };
        denied.push({ name: toolName, input });
        return { behavior: "deny", message: `${toolName} isn't permitted in scenario tests.` };
      },
    },
  })) {
    messages.push(message);
    if (message.type === "assistant") {
      for (const block of message.message.content) {
        if (block.type === "tool_use") toolCalls.push({ name: block.name, input: block.input as Record<string, unknown> });
      }
    }
    if (message.type === "result") result = message;
  }

  const usage = Object.values(result?.modelUsage ?? {});
  const costUsd = result?.total_cost_usd ?? 0;
  recordRun({
    scenario: options.name,
    costUsd,
    inputTokens: usage.reduce((n, u) => n + u.inputTokens + u.cacheReadInputTokens + u.cacheCreationInputTokens, 0),
    outputTokens: usage.reduce((n, u) => n + u.outputTokens, 0),
    turns: result?.num_turns ?? 0,
    outcome: result?.subtype ?? "no-result",
    durationMs: Date.now() - started,
  });

  const callsPath = join(ghDir, "calls.jsonl");
  const ghCalls: GhCall[] = existsSync(callsPath)
    ? readFileSync(callsPath, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l))
    : [];
  const ghState: FakeGhState = JSON.parse(readFileSync(join(ghDir, "state.json"), "utf8"));
  return { fixture, result, messages, toolCalls, denied, user, ghCalls, ghState, costUsd };
}

/** The scenario name for a test file at tests/e2e/<capability>/<slug>.test.ts. */
export function scenarioIdFor(testFileUrl: string): string {
  const path = fileURLToPath(testFileUrl);
  return `${basename(dirname(path))}/${basename(path).replace(/\.test\.[cm]?[jt]s$/, "")}`;
}
