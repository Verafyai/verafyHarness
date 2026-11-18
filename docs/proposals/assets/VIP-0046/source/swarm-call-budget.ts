/**
 * One slow model must not hold the broadcast until Vercel kills the route.
 * The route maxDuration is 60s (see app/api/broadcast-query/route.ts). Each
 * model is capped under that so the session can still be written.
 */
export const VALIDATOR_TIMEOUT_MS = 40_000;

/** Slightly inside the validator cap so an abort returns a normal failure. */
export const OPENROUTER_FETCH_TIMEOUT_MS = 38_000;

/**
 * Trusted server callers (the website's thesis jury) ask frontier models
 * long questions with web search, which can take past 40s. Their route
 * allows 150s, so each model gets up to 110s there.
 */
export const TRUSTED_VALIDATOR_TIMEOUT_MS = 110_000;

/** The OpenRouter fetch budget that sits just inside a validator budget. */
export function fetchBudgetFor(validatorMs: number): number {
  return Math.max(1_000, validatorMs - 2_000);
}

/**
 * Models that reason need room for the thinking budget plus the JSON answer.
 * Claude's extended thinking rejects a budget under 1024 and rejects a custom
 * temperature, so reasoning is never turned on for Anthropic.
 */
export const REASONING_MAX_TOKENS = 1500;
export const STANDARD_MAX_TOKENS = 1000;

export type OpenRouterReasoning =
  | { effort: "low"; exclude: true }
  | { max_tokens: number; exclude: true }
  | { enabled: false };

/**
 * Reasoners whose hidden thinking used up the 1000-token answer budget, so
 * OpenRouter returned finish_reason "length" with empty content and the card
 * showed n/a. Measured 2026-11-02 against the real forecast prompt.
 */
export const LONG_REASONING_MAX_TOKENS = 4000;
export const CAPPED_REASONING_MAX_TOKENS = 8000;
export const CAPPED_REASONING_BUDGET = 1024;

export type ReasoningProfile = "none" | "low" | "low-long" | "capped" | "off";

/** Per-model call profile. Unknown models keep the plain completion. */
export function reasoningProfile(model: string): ReasoningProfile {
  const id = model.trim().toLowerCase().replace(/^openrouter:/, "");
  if (!id || id.startsWith("anthropic/")) return "none";
  // Grok 4 / 4.5 think by default and were the forecast timeouts.
  // OpenAI o-series models do the same.
  if (id.startsWith("x-ai/grok-4") || /^openai\/o[134](?:[./-]|$)/.test(id)) return "low";
  // Mandatory reasoning, empty content at 1000 tokens. Low effort + 4000 answers in 7-27s.
  if (
    /^openai\/gpt-5/.test(id) ||
    /^openai\/gpt-6/.test(id) ||
    /^google\/gemini-2\.5-pro/.test(id) ||
    /^google\/gemini-[3-9]/.test(id) ||
    /^qwen\/qwen3[.\d]*-max/.test(id) ||
    /^moonshotai\/kimi-k[3-9]/.test(id) ||
    /^meta\/muse-spark/.test(id)
  ) {
    return "low-long";
  }
  // Effort "low" still ran out at 4000 tokens; a fixed 1024-token budget answers in ~17s.
  if (/^mistralai\/mistral-large-4/.test(id)) return "capped";
  // Low effort took 50-60s (past the 38s fetch cap); reasoning off answers in ~6s.
  if (/^deepseek\/deepseek-v4/.test(id)) return "off";
  return "none";
}

/**
 * OpenRouter's web search server tool. The model decides whether and what to
 * search. Exa for every model: in the first live run (2026-11-11) the models
 * on Exa answered in 6 to 16 s, Grok on its own search took 25 s, and Claude
 * on Anthropic's own search ran past the 38 s cap. Exa is $0.007 a search
 * (vendor-reported). Results are capped per search and per call.
 */
export const WEB_SEARCH_TOOL = {
  type: "openrouter:web_search",
  parameters: { engine: "exa", max_results: 5, max_total_results: 10, search_context_size: "low" },
} as const;

/** On unless SWARM_WEB_SEARCH is "off". The kill switch needs no deploy of code. */
export function webSearchEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return (env.SWARM_WEB_SEARCH ?? "").trim().toLowerCase() !== "off";
}

export interface OpenRouterCompletionBody {
  model: string;
  messages: Array<{ role: "system" | "user"; content: string }>;
  temperature?: number;
  max_tokens: number;
  reasoning?: OpenRouterReasoning;
  tools?: Array<typeof WEB_SEARCH_TOOL>;
}

/** True when this OpenRouter id should get a capped reasoning pass. */
export function modelUsesReasoningBudget(model: string): boolean {
  const id = model.trim().toLowerCase().replace(/^openrouter:/, "");
  if (!id || id.startsWith("anthropic/")) return false;
  // Grok 4 / 4.5 think by default and were the forecast timeouts.
  // OpenAI o-series models do the same. Everyone else gets a plain completion.
  const profile = reasoningProfile(model);
  return profile === "low" || profile === "low-long" || profile === "capped";
}

/** A reasoning object turns on extended thinking. Anthropic must not receive one. */
export function reasoningEnablesThinking(reasoning: OpenRouterReasoning | undefined): boolean {
  return reasoning != null && !("enabled" in reasoning && reasoning.enabled === false);
}

/**
 * Fact-check and forecast replies are short JSON. Only slow reasoners get a
 * low-effort reasoning cap, with max_tokens >= 1500. Claude is a plain call:
 * no reasoning field, so temperature stays allowed and the token cap can be
 * the normal answer size.
 */
export function openRouterCompletionBody(
  model: string,
  systemMessage: string,
  userMessage: string,
  _queryMode?: string,
  options: { webSearch?: boolean } = {},
): OpenRouterCompletionBody {
  const profile = reasoningProfile(model);
  const thinking = profile === "low" || profile === "low-long" || profile === "capped";
  const maxTokens =
    profile === "low" ? REASONING_MAX_TOKENS
    : profile === "low-long" ? LONG_REASONING_MAX_TOKENS
    : profile === "capped" ? CAPPED_REASONING_MAX_TOKENS
    : STANDARD_MAX_TOKENS;
  const reasoning: OpenRouterReasoning | undefined =
    profile === "low" || profile === "low-long" ? { effort: "low", exclude: true }
    : profile === "capped" ? { max_tokens: CAPPED_REASONING_BUDGET, exclude: true }
    : profile === "off" ? { enabled: false }
    : undefined;
  return {
    model,
    messages: [
      { role: "system", content: systemMessage },
      { role: "user", content: userMessage },
    ],
    // Temperature stays on the plain calls. It is omitted only when thinking
    // is on, because Anthropic rejects a custom temperature in that mode.
    ...(thinking ? {} : { temperature: 0.2 }),
    max_tokens: maxTokens,
    ...(reasoning ? { reasoning } : {}),
    ...(options.webSearch ? { tools: [WEB_SEARCH_TOOL] } : {}),
  };
}
