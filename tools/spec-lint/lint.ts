// Deterministic spec lint: implements the "Spec lint" and "Requirement format"
// requirements of the spec-management capability.

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { mermaidError } from "./mermaid.ts";
import { parseMarkdown, type ParsedMarkdown, type Requirement } from "./parse.ts";

export type Severity = "error" | "warning";

export interface Finding {
  severity: Severity;
  rule: string;
  file: string;
  line: number;
  message: string;
}

interface SpecFile {
  path: string;
  kind: "living" | "delta";
  capability: string;
  change?: string;
  parsed: ParsedMarkdown;
}

interface Location {
  file: string;
  line: number;
}

type Report = (severity: Severity, rule: string, at: Location, message: string) => void;

const SLUG = "[a-z0-9]+(?:-[a-z0-9]+)*";
const SCENARIO_ID = new RegExp(`^(${SLUG})/(${SLUG})$`);
const QUOTED_ID = new RegExp(`(['"\`])(${SLUG}/${SLUG})\\1`, "g");
const TEST_FILE = /\.test\.[cm]?[jt]s$/;
const SKIP_DIRS = new Set(["node_modules", ".git"]);

export async function lintRepo(root: string): Promise<Finding[]> {
  const findings: Finding[] = [];
  const report: Report = (severity, rule, at, message) =>
    findings.push({ severity, rule, file: at.file, line: at.line, message });

  const files = await walk(root);
  const markdown = new Map<string, ParsedMarkdown>();
  for (const file of files.filter((f) => f.endsWith(".md"))) {
    markdown.set(file, parseMarkdown(await readFile(join(root, file), "utf8")));
  }
  const specs = classifySpecs(markdown);
  const tests = new Map<string, string>();
  for (const file of files.filter((f) => TEST_FILE.test(f))) {
    tests.set(file, await readFile(join(root, file), "utf8"));
  }

  for (const spec of specs) checkFormat(spec, report);
  const index = checkIds(specs, report);
  checkCitations(specs, markdown, tests, index, report);
  checkOverlap(specs, report);
  await checkMermaid(markdown, report);

  return findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

async function walk(root: string, dir = ""): Promise<string[]> {
  const entries = await readdir(join(root, dir), { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = dir ? `${dir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) files.push(...(await walk(root, path)));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }
  return files;
}

function classifySpecs(markdown: Map<string, ParsedMarkdown>): SpecFile[] {
  const specs: SpecFile[] = [];
  for (const [path, parsed] of markdown) {
    const parts = path.split("/");
    if (parts.length === 3 && parts[0] === "specs" && parts[2] === "spec.md") {
      specs.push({ path, kind: "living", capability: parts[1], parsed });
    } else if (
      parts.length === 5 &&
      parts[0] === "changes" &&
      parts[1] !== "archive" &&
      parts[2] === "specs" &&
      parts[4] === "spec.md"
    ) {
      specs.push({ path, kind: "delta", capability: parts[3], change: parts[1], parsed });
    }
  }
  return specs;
}

function checkFormat(spec: SpecFile, report: Report): void {
  const at = (line: number): Location => ({ file: spec.path, line });
  const { parsed } = spec;

  if (spec.kind === "delta") {
    for (const section of parsed.unknownSections) {
      report("error", "delta-section", at(section.line),
        `Unknown section "## ${section.title}"; use ADDED, MODIFIED, or REMOVED Requirements`);
    }
    for (const requirement of parsed.requirements.filter((r) => r.section === null)) {
      report("error", "delta-section", at(requirement.line),
        `Requirement "${requirement.name}" isn't under an ADDED, MODIFIED, or REMOVED Requirements section`);
    }
  }
  for (const orphan of parsed.orphanScenarios) {
    report("error", "requirement-format", at(orphan.line), `Scenario "${orphan.id}" isn't under a requirement`);
  }

  for (const requirement of parsed.requirements) {
    if (requirement.section === "REMOVED") continue;
    if (!/\bSHALL\b/.test(requirement.statement)) {
      report("error", "requirement-format", at(requirement.line),
        `Requirement "${requirement.name}" has no SHALL statement`);
    }
    if (requirement.scenarios.length === 0) {
      report("error", "requirement-without-scenario", at(requirement.line),
        `Requirement "${requirement.name}" has no scenario`);
    }
    for (const scenario of requirement.scenarios) {
      const match = SCENARIO_ID.exec(scenario.id);
      if (!match) {
        report("error", "scenario-id", at(scenario.line),
          `Scenario ID "${scenario.id}" must be \`<capability>/<slug>\`, e.g. \`${spec.capability}/some-behaviour\``);
      } else if (match[1] !== spec.capability) {
        report("error", "scenario-id", at(scenario.line),
          `Scenario ID "${scenario.id}" names capability "${match[1]}" but is in "${spec.capability}"`);
      }
      const first = (keyword: string) => scenario.steps.find((s) => s.keyword === keyword)?.line;
      const [given, when, then] = [first("GIVEN"), first("WHEN"), first("THEN")];
      for (const [keyword, line] of [["GIVEN", given], ["WHEN", when], ["THEN", then]] as const) {
        if (line === undefined) {
          report("error", "scenario-steps", at(scenario.line), `Scenario "${scenario.id}" has no ${keyword} line`);
        }
      }
      if (given !== undefined && when !== undefined && then !== undefined && !(given < when && when < then)) {
        report("error", "scenario-steps", at(scenario.line),
          `Scenario "${scenario.id}" must list GIVEN, then WHEN, then THEN`);
      }
    }
  }
}

interface IdIndex {
  /** Scenario IDs that exist in a living spec or an in-flight ADDED/MODIFIED delta. */
  valid: Set<string>;
  /** Scenario IDs that an in-flight change renames or removes, mapped to that change. */
  retired: Map<string, string>;
}

function checkIds(specs: SpecFile[], report: Report): IdIndex {
  const valid = new Set<string>();
  const retired = new Map<string, string>();
  const where = (loc: Location) => `${loc.file}:${loc.line}`;

  // Duplicates within one file.
  for (const spec of specs) {
    const seen = new Map<string, Location>();
    for (const requirement of spec.parsed.requirements) {
      if (requirement.section === "REMOVED") continue;
      for (const scenario of requirement.scenarios) {
        const loc = { file: spec.path, line: scenario.line };
        const earlier = seen.get(scenario.id);
        if (earlier) {
          report("error", "duplicate-id", loc, `Scenario ID "${scenario.id}" is duplicated; also at ${where(earlier)}`);
        } else {
          seen.set(scenario.id, loc);
        }
      }
    }
  }

  // Living specs: requirement names and scenario IDs per capability.
  const livingRequirements = new Map<string, { requirement: Requirement; file: string }>();
  const livingIds = new Map<string, Location & { requirement: string }>();
  for (const spec of specs.filter((s) => s.kind === "living")) {
    for (const requirement of spec.parsed.requirements) {
      const key = `${spec.capability}\0${requirement.name}`;
      const existing = livingRequirements.get(key);
      if (existing) {
        report("error", "duplicate-requirement", { file: spec.path, line: requirement.line },
          `Requirement "${requirement.name}" is duplicated; also at ${existing.file}:${existing.requirement.line}`);
        continue;
      }
      livingRequirements.set(key, { requirement, file: spec.path });
      for (const scenario of requirement.scenarios) {
        valid.add(scenario.id);
        if (!livingIds.has(scenario.id)) {
          livingIds.set(scenario.id, { file: spec.path, line: scenario.line, requirement: requirement.name });
        }
      }
    }
  }

  // Deltas against living specs and against each other.
  const addedElsewhere = new Map<string, Location & { change: string }>();
  for (const spec of specs.filter((s) => s.kind === "delta")) {
    const change = spec.change!;
    for (const requirement of spec.parsed.requirements) {
      if (requirement.section === null) continue;
      const loc = { file: spec.path, line: requirement.line };
      const living = livingRequirements.get(`${spec.capability}\0${requirement.name}`);
      const livingPath = `specs/${spec.capability}/spec.md`;

      if (requirement.section === "ADDED" && living) {
        report("error", "delta-target", loc,
          `ADDED requirement "${requirement.name}" already exists at ${living.file}:${living.requirement.line}; use MODIFIED`);
      }
      if (requirement.section !== "ADDED" && !living) {
        report("error", "delta-target", loc,
          `${requirement.section} requirement "${requirement.name}" isn't in ${livingPath}`);
      }

      const newIds = new Set(requirement.section === "REMOVED" ? [] : requirement.scenarios.map((s) => s.id));
      if (living) {
        for (const old of living.requirement.scenarios) {
          if (requirement.section !== "ADDED" && !newIds.has(old.id)) retired.set(old.id, change);
        }
      }
      if (requirement.section === "REMOVED") continue;

      for (const scenario of requirement.scenarios) {
        const at = { file: spec.path, line: scenario.line };
        valid.add(scenario.id);
        const inLiving = livingIds.get(scenario.id);
        if (inLiving && inLiving.requirement !== requirement.name) {
          report("error", "duplicate-id", at,
            `Scenario ID "${scenario.id}" is already used by requirement "${inLiving.requirement}" at ${where(inLiving)}`);
        }
        if (requirement.section === "ADDED") {
          const other = addedElsewhere.get(scenario.id);
          if (other && other.change !== change) {
            report("error", "duplicate-id", at,
              `Scenario ID "${scenario.id}" is also added by change "${other.change}" at ${where(other)}`);
          } else if (!other) {
            addedElsewhere.set(scenario.id, { ...at, change });
          }
        }
      }
    }
  }
  return { valid, retired };
}

function checkCitations(
  specs: SpecFile[],
  markdown: Map<string, ParsedMarkdown>,
  tests: Map<string, string>,
  index: IdIndex,
  report: Report,
): void {
  const capabilities = new Set(specs.map((s) => s.capability));
  const isCitation = (text: string) => {
    const match = SCENARIO_ID.exec(text);
    return match !== null && capabilities.has(match[1]);
  };

  const check = (id: string, at: Location) => {
    if (!index.valid.has(id)) {
      report("error", "unresolved-citation", at, `Cites scenario "${id}", which doesn't exist`);
      return;
    }
    const change = index.retired.get(id);
    if (change && !at.file.startsWith(`changes/${change}/`)) {
      report("error", "stale-citation", at,
        `Cites scenario "${id}", which change "${change}" renames or removes; update this reference in the same change`);
    }
  };

  for (const [file, parsed] of markdown) {
    const inScope = file.startsWith("specs/") || (file.startsWith("changes/") && !file.startsWith("changes/archive/"));
    if (!inScope) continue;
    for (const code of parsed.inlineCode) {
      if (isCitation(code.text)) check(code.text, { file, line: code.line });
    }
  }

  for (const [file, source] of tests) {
    const e2e = /^tests\/e2e\/([^/]+)\/([^/]+)\.test\.[cm]?[jt]s$/.exec(file);
    if (e2e && isCitation(`${e2e[1]}/${e2e[2]}`)) check(`${e2e[1]}/${e2e[2]}`, { file, line: 1 });
    source.split(/\r?\n/).forEach((text, i) => {
      for (const match of text.matchAll(QUOTED_ID)) {
        if (isCitation(match[2])) check(match[2], { file, line: i + 1 });
      }
    });
  }
}

function checkOverlap(specs: SpecFile[], report: Report): void {
  const touched = new Map<string, (Location & { change: string })[]>();
  for (const spec of specs.filter((s) => s.kind === "delta")) {
    for (const requirement of spec.parsed.requirements) {
      if (requirement.section !== "MODIFIED" && requirement.section !== "REMOVED") continue;
      const key = `${spec.capability}\0${requirement.name}`;
      const list = touched.get(key) ?? [];
      list.push({ file: spec.path, line: requirement.line, change: spec.change! });
      touched.set(key, list);
    }
  }
  for (const [key, list] of touched) {
    const changes = new Set(list.map((t) => t.change));
    if (changes.size < 2) continue;
    const [capability, name] = key.split("\0");
    for (const entry of list) {
      const others = [...changes].filter((c) => c !== entry.change).map((c) => `"${c}"`).join(", ");
      report("warning", "overlap", entry,
        `Requirement "${name}" in ${capability} is also changed by ${others}; whichever archives second must rebase`);
    }
  }
}

async function checkMermaid(markdown: Map<string, ParsedMarkdown>, report: Report): Promise<void> {
  for (const [file, parsed] of markdown) {
    for (const block of parsed.fencedBlocks.filter((b) => b.lang === "mermaid")) {
      const error = await mermaidError(block.text);
      if (error) report("error", "mermaid", { file, line: block.line }, `Mermaid block doesn't parse: ${error}`);
    }
  }
}
