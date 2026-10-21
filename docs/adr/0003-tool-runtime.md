# ADR 0003: Runtime for the factory's deterministic tools

- **Status:** Accepted (2026-10-21)
- **Deciders:** Stephen Wilcox
- **Source:** prerequisite in [add-spec-management tasks](../../changes/add-spec-management/tasks.md)

## Context

The factory needs deterministic tools: scripts that run without a model, are cheap, and always give the same answer. The spec lint comes first. Later tools will probably include the loop-diagram generator, metrics collection, and installation. Every capability will use them, and rewriting them later would be expensive, so the runtime needs an ADR (per G14).

What drives the choice:

- **The spec lint has to parse Mermaid** (scenario `spec-management/lint-invalid-mermaid`). The only full Mermaid parser is the JavaScript `mermaid` package.
- **The target projects' stacks vary.** The card game's stack isn't decided yet, so the factory can't assume a target project already has any particular runtime.
- **Little ceremony.** Agents and humans should be able to read, run, and edit a tool without a build step.

### What we tested (2026-10-21, Node 24.15, mermaid 11.4.1)

- Node runs TypeScript files directly, with no build step or flag. A file must be an ES module (`.mts`, or `"type": "module"` in `package.json`).
- `mermaid.parse()` rejects a broken diagram on its own. A valid diagram fails with `DOMPurify.addHook is not a function` until a `jsdom` window is provided. With jsdom, the loop diagram in `spec.md` parses as `flowchart-v2`, and the whole run takes about 0.8 s.
- `mermaid` plus `jsdom` take up about 140 MB of `node_modules`.

## Options considered

| Option | Mermaid check | Target-project cost | Notes |
|---|---|---|---|
| **TypeScript on Node** | Runs in the same process (tested) | Node 24+ | No build step; strong markdown tooling (unified/remark) |
| Python with uv | Must call out to Node | Python, uv, **and** Node | Two runtimes for one lint |
| Go or Rust single binary | Must call out to Node | Node anyway, plus a binary to release | No benefit until Mermaid isn't needed |

## Decision

Write the factory's deterministic tools in **TypeScript, run directly by Node 24 LTS or newer**, with no build step.

- Use only TypeScript syntax that Node can strip: no `enum`, no `namespace`, no constructor parameter properties. Write imports with explicit `.ts` extensions.
- Type-check with `tsc --noEmit` in CI. That's a dev dependency; nothing needs to be compiled to run.
- Check Mermaid with `mermaid.parse()` inside a `jsdom` window.
- How the tools reach a target project (copied in, published as a package, or otherwise) is decided under `installation`, not here.

## Consequences

- A target project that doesn't use JavaScript still needs Node 24+ installed to run the factory's tools. Installation must check for it and say so clearly.
- Tools that depend on Mermaid bring about 140 MB of dependencies. If that's a problem for a target project, the Mermaid check can become an optional extra.
- Agents can run any tool with `node path/to/tool.ts`.
