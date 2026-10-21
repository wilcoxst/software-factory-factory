// Mermaid's parser sanitizes labels with DOMPurify, which needs a DOM, so it
// runs inside a jsdom window (ADR 0003). Loaded lazily: it takes ~0.8s.

type Parse = (text: string) => Promise<unknown>;

let parse: Parse | undefined;

async function loadParser(): Promise<Parse> {
  if (!parse) {
    const { JSDOM } = await import("jsdom");
    const { window } = new JSDOM("");
    Object.assign(globalThis, { window, document: window.document });
    const mermaid = (await import("mermaid")).default;
    parse = (text) => mermaid.parse(text);
  }
  return parse;
}

/**
 * Returns a one-line summary of the parse error (Mermaid's first line, which
 * names the line, plus its last, which says what was expected), or null.
 */
export async function mermaidError(text: string): Promise<string | null> {
  const parser = await loadParser();
  try {
    await parser(text);
    return null;
  } catch (error) {
    const lines = String(error instanceof Error ? error.message : error).split("\n").filter(Boolean);
    return lines.length > 1 ? `${lines[0]} ${lines[lines.length - 1]}` : (lines[0] ?? "unknown error");
  }
}
