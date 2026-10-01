import type { ExplanationInput } from "@/lib/llm/input";
import { buildMessages } from "@/lib/llm/prompt";

export type LlmConfig = {
  provider: "ollama" | "openai-compatible" | "none";
  baseUrl: string;
  model: string;
  apiKey: string;
  timeoutMs: number;
};

export function llmConfig(env: Record<string, string | undefined> = process.env): LlmConfig {
  const provider =
    env.LLM_PROVIDER === "ollama" || env.LLM_PROVIDER === "openai-compatible"
      ? env.LLM_PROVIDER
      : "none";
  return {
    provider,
    baseUrl: (
      env.LLM_BASE_URL || (provider === "ollama" ? "http://localhost:11434/v1" : "")
    ).replace(/\/+$/, ""),
    model: env.LLM_MODEL ?? "",
    apiKey: env.LLM_API_KEY ?? "",
    timeoutMs: Number(env.LLM_TIMEOUT_MS) > 0 ? Number(env.LLM_TIMEOUT_MS) : 8_000,
  };
}

const MAX_LENGTH = 600;

/**
 * One chat-completions call to an OpenAI-compatible endpoint (Ollama, Groq, OpenRouter, ...).
 * Throws on any failure, including the timeout; the caller falls back to the template.
 */
export async function llmExplanation(
  input: ExplanationInput,
  config: LlmConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  if (config.provider === "none") throw new Error("LLM disabled (LLM_PROVIDER=none)");
  if (!config.baseUrl || !config.model) throw new Error("LLM_BASE_URL and LLM_MODEL must be set");

  const response = await fetchImpl(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: config.model,
      messages: buildMessages(input),
      temperature: 0.2,
      max_tokens: 160,
    }),
    signal: AbortSignal.timeout(config.timeoutMs),
  });
  if (!response.ok) throw new Error(`LLM returned HTTP ${response.status}`);

  const json = (await response.json()) as { choices?: { message?: { content?: unknown } }[] };
  const content = json.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) throw new Error("LLM returned no text");

  // Display-only plain text: collapse whitespace and cap the length.
  const text = content.replace(/\s+/g, " ").trim();
  return text.length > MAX_LENGTH ? `${text.slice(0, MAX_LENGTH - 1)}…` : text;
}
