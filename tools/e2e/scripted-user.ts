// The test harness's stand-in for a person (ADR 0005). A scenario scripts the
// answers it cares about; any other question gets its first option, which by
// convention is the recommended one. Every round asked is recorded.

export interface QuestionOption {
  label: string;
  description?: string;
}

export interface Question {
  question: string;
  header: string;
  options: QuestionOption[];
  multiSelect: boolean;
}

export interface ScriptedAnswer {
  /** Matches the question's header exactly (string) or by pattern. */
  header?: string | RegExp;
  /** Matches the question text by pattern. */
  question?: RegExp;
  /** An option label, several labels for multiSelect, or free text. */
  answer: string | string[];
}

export interface AskedQuestion extends Question {
  answer: string | string[];
  scripted: boolean;
}

export class ScriptedUser {
  /** One entry per AskUserQuestion call, in order. */
  readonly rounds: AskedQuestion[][] = [];
  private readonly script: ScriptedAnswer[];

  constructor(script: ScriptedAnswer[] = []) {
    this.script = script;
  }

  /** Builds the `updatedInput` for an AskUserQuestion call. */
  answer(input: { questions: Question[] }): { questions: Question[]; answers: Record<string, string | string[]> } {
    const answers: Record<string, string | string[]> = {};
    const round: AskedQuestion[] = [];
    for (const q of input.questions) {
      const scripted = this.script.find((s) => matches(s, q));
      const answer = scripted?.answer ?? q.options[0]?.label ?? "";
      answers[q.question] = answer;
      round.push({ ...q, answer, scripted: scripted !== undefined });
    }
    this.rounds.push(round);
    return { questions: input.questions, answers };
  }

  /** All questions asked, across rounds. */
  get questions(): AskedQuestion[] {
    return this.rounds.flat();
  }
}

function matches(s: ScriptedAnswer, q: Question): boolean {
  if (s.header !== undefined) {
    const ok = typeof s.header === "string" ? q.header === s.header : s.header.test(q.header);
    if (!ok) return false;
  }
  if (s.question !== undefined && !s.question.test(q.question)) return false;
  return s.header !== undefined || s.question !== undefined;
}
