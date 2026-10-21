// Which model plays each role in scenario tests. ADR 0005: the same mapping as
// production. Until `routing` in factory/loop.md is specified, these pinned
// defaults stand in; override one with E2E_MODEL_<ROLE>, e.g.
// E2E_MODEL_REVIEW_MODEL=claude-opus-5-5.

export type Role = "decision-model" | "generative-model" | "review-model";

const DEFAULTS: Record<Role, string> = {
  "decision-model": "claude-haiku-5-5",
  "generative-model": "claude-sonnet-5-5",
  "review-model": "claude-opus-5-5",
};

export function modelFor(role: Role): string {
  const override = process.env[`E2E_MODEL_${role.toUpperCase().replaceAll("-", "_")}`];
  return override || DEFAULTS[role];
}
