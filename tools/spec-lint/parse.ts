// Line-based parser for living specs and deltas. Headings inside fenced code
// blocks are ignored, so examples in prose (e.g. ADR 0001) aren't parsed as specs.

export type DeltaSection = "ADDED" | "MODIFIED" | "REMOVED";

export interface Step {
  keyword: string;
  line: number;
}

export interface Scenario {
  id: string;
  line: number;
  steps: Step[];
}

export interface Requirement {
  name: string;
  line: number;
  statement: string;
  section: DeltaSection | null;
  scenarios: Scenario[];
}

export interface FencedBlock {
  lang: string;
  line: number;
  text: string;
}

export interface InlineCode {
  text: string;
  line: number;
}

export interface ParsedMarkdown {
  requirements: Requirement[];
  unknownSections: { title: string; line: number }[];
  orphanScenarios: { id: string; line: number }[];
  fencedBlocks: FencedBlock[];
  inlineCode: InlineCode[];
}

const FENCE = /^(```|~~~)\s*([\w-]*)/;
const SECTION = /^##\s+(\S+)\s+Requirements\s*$/;
const REQUIREMENT = /^###\s+Requirement:\s*(.+?)\s*$/;
const SCENARIO = /^####\s+Scenario:\s*(\S*)/;
const STEP = /^\s*[-*]\s+(GIVEN|WHEN|THEN|AND|BUT)\b/;
const INLINE_CODE = /`([^`\n]+)`/g;

export function parseMarkdown(source: string): ParsedMarkdown {
  const result: ParsedMarkdown = {
    requirements: [],
    unknownSections: [],
    orphanScenarios: [],
    fencedBlocks: [],
    inlineCode: [],
  };
  let section: DeltaSection | null = null;
  let requirement: Requirement | null = null;
  let scenario: Scenario | null = null;
  let fence: { marker: string; block: FencedBlock; lines: string[] } | null = null;

  const lines = source.split(/\r?\n/);
  for (const [index, text] of lines.entries()) {
    const line = index + 1;

    if (fence) {
      if (text.trimStart().startsWith(fence.marker)) {
        fence.block.text = fence.lines.join("\n");
        result.fencedBlocks.push(fence.block);
        fence = null;
      } else {
        fence.lines.push(text);
      }
      continue;
    }
    const fenceMatch = FENCE.exec(text.trimStart());
    if (fenceMatch) {
      fence = { marker: fenceMatch[1], block: { lang: fenceMatch[2], line, text: "" }, lines: [] };
      continue;
    }

    for (const match of text.matchAll(INLINE_CODE)) {
      result.inlineCode.push({ text: match[1], line });
    }

    if (text.startsWith("## ")) {
      requirement = null;
      scenario = null;
      const sectionMatch = SECTION.exec(text);
      if (!sectionMatch) {
        section = null;
      } else if (["ADDED", "MODIFIED", "REMOVED"].includes(sectionMatch[1])) {
        section = sectionMatch[1] as DeltaSection;
      } else {
        section = null;
        result.unknownSections.push({ title: text.slice(3).trim(), line });
      }
      continue;
    }

    const requirementMatch = REQUIREMENT.exec(text);
    if (requirementMatch) {
      requirement = { name: requirementMatch[1], line, statement: "", section, scenarios: [] };
      result.requirements.push(requirement);
      scenario = null;
      continue;
    }
    if (text.startsWith("### ") || text.startsWith("# ")) {
      requirement = null;
      scenario = null;
      continue;
    }

    const scenarioMatch = SCENARIO.exec(text);
    if (scenarioMatch) {
      const id = scenarioMatch[1].replace(/[—–:]+$/, "");
      if (!requirement) {
        result.orphanScenarios.push({ id, line });
        scenario = null;
        continue;
      }
      scenario = { id, line, steps: [] };
      requirement.scenarios.push(scenario);
      continue;
    }

    const stepMatch = STEP.exec(text);
    if (stepMatch && scenario) {
      scenario.steps.push({ keyword: stepMatch[1], line });
      continue;
    }

    if (requirement && !scenario) {
      requirement.statement += (requirement.statement ? "\n" : "") + text;
    }
  }

  if (fence) {
    fence.block.text = fence.lines.join("\n");
    result.fencedBlocks.push(fence.block);
  }
  return result;
}
