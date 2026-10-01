import type { ExplanationInput } from "@/lib/llm/input";

export const SYSTEM_PROMPT =
  "You explain why a rule flagged a financial transaction for human review. " +
  "Explain in one or two plain sentences why this transaction was flagged by this rule. " +
  "Use only the facts given. Do not say the transaction is fraud or money laundering. " +
  "Amounts in USD are approximate. Reply with the explanation only.";

/** The user message is the structured input as JSON; no free text from the upload is included. */
export function buildMessages(input: ExplanationInput) {
  return [
    { role: "system" as const, content: SYSTEM_PROMPT },
    { role: "user" as const, content: JSON.stringify(input) },
  ];
}
