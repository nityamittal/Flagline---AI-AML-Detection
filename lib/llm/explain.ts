import type { ExplanationSource } from "@prisma/client";
import { db } from "@/lib/db";
import { llmConfig, llmExplanation, type LlmConfig } from "@/lib/llm/client";
import { explanationInput, type ExplanationInput } from "@/lib/llm/input";
import { templateExplanation } from "@/lib/llm/template";

export type Explanation = { text: string; source: ExplanationSource };

/** LLM text when it works, the rule's template otherwise. Never throws. */
export async function generateExplanation(
  input: ExplanationInput,
  config: LlmConfig = llmConfig(),
  fetchImpl?: typeof fetch,
): Promise<Explanation> {
  if (config.provider !== "none") {
    try {
      return { text: await llmExplanation(input, config, fetchImpl), source: "LLM" };
    } catch (error) {
      console.warn(`[llm] falling back to template: ${(error as Error).message}`);
    }
  }
  return { text: templateExplanation(input), source: "TEMPLATE" };
}

/**
 * The flag's explanation, generated on first use and cached on the flag. Flags are shared, so
 * each one costs at most one LLM call however many visitors open it. Pass `retryTemplate` to
 * replace a cached template with LLM text (used by `npm run explain:all -- --retry-templates`).
 */
export async function explainFlag(
  flagId: string,
  { retryTemplate = false }: { retryTemplate?: boolean } = {},
): Promise<Explanation | null> {
  const flag = await db.flag.findUnique({ where: { id: flagId }, include: { transaction: true } });
  if (!flag) return null;
  const cached =
    flag.explanation && flag.explanationSource
      ? { text: flag.explanation, source: flag.explanationSource }
      : null;
  if (cached && !(retryTemplate && cached.source === "TEMPLATE")) return cached;

  const fresh = await generateExplanation(explanationInput(flag));
  if (cached && fresh.source === "TEMPLATE") return cached;

  // Only overwrite what we read, so two concurrent first opens can't clobber each other.
  const { count } = await db.flag.updateMany({
    where: { id: flagId, explanation: cached ? cached.text : null },
    data: { explanation: fresh.text, explanationSource: fresh.source },
  });
  if (count === 1) return fresh;
  const winner = await db.flag.findUnique({
    where: { id: flagId },
    select: { explanation: true, explanationSource: true },
  });
  return winner?.explanation && winner.explanationSource
    ? { text: winner.explanation, source: winner.explanationSource }
    : fresh;
}
