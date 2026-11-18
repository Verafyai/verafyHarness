/**
 * Model identity colors and icons, ported from Swarm Explorer (testnet-demo lib/midterms/model-color.ts and
 * lib/utils/icon-mapping.ts) so thesis rulings look exactly like Swarm's answer cards.
 */

const MODEL_COLOR_VAR: Record<string, string> = {
  "gpt-6-astra": "--model-astra",
  "claude-fable-5.1": "--model-fable",
  "gemini-4-argon": "--model-argon",
  "grok-4.7": "--model-grok",
  "deepseek-v4-pro": "--model-deepseek",
  "gemini-3.8-flash": "--model-flash",
  "deepseek-v4.1-flash": "--model-deepseek",
  "gpt-5.6-luna": "--model-luna",
  "gpt-5.6-sol": "--model-sol",
  "claude-opus-5.5": "--model-opus",
  "llama-4-maverick": "--model-llama",
  "qwen3.8-max-prime": "--model-qwen",
  "mistral-large-4": "--model-mistral",
  "kimi-k3.1-pro": "--model-kimi",
  "sonar-pro-search": "--model-sonar",
};

const FALLBACK = "--model-fallback";

/**
 * Same hues as `--model-*` in the Forecast stylesheet.
 * Share images cannot read CSS variables, so they paint these hexes.
 */
const MODEL_COLOR_HEX: Record<string, string> = {
  "--model-deepseek": "#ffe14a",
  "--model-fable": "#ff7a1a",
  "--model-opus": "#f6233a",
  "--model-sol": "#ff5a8a",
  "--model-kimi": "#ff4ad0",
  "--model-grok": "#e040a0",
  "--model-qwen": "#8a5cff",
  "--model-astra": "#2f78ff",
  "--model-luna": "#2ed0ff",
  "--model-argon": "#1ec8a5",
  "--model-mistral": "#3dde6a",
  "--model-llama": "#c6e03a",
  "--model-sonar": "#ffb020",
  "--model-flash": "#7a4dff",
  "--model-fallback": "#ff4d4d",
};

/** Swarm cards name a lab, not a catalog id. Specific ids above still win. */
const LAB_ALIAS: ReadonlyArray<{ pattern: RegExp; variable: string }> = [
  { pattern: /deepseek/, variable: "--model-deepseek" },
  { pattern: /fable/, variable: "--model-fable" },
  { pattern: /opus|claude|anthropic/, variable: "--model-opus" },
  { pattern: /grok|\bxai\b|\bx-ai\b/, variable: "--model-grok" },
  { pattern: /llama|\bmeta\b/, variable: "--model-llama" },
  { pattern: /qwen|alibaba/, variable: "--model-qwen" },
  { pattern: /mistral|mixtral/, variable: "--model-mistral" },
  { pattern: /kimi|moonshot/, variable: "--model-kimi" },
  { pattern: /sonar|perplexity/, variable: "--model-sonar" },
  { pattern: /flash/, variable: "--model-flash" },
  { pattern: /argon|gemini|gemma|\bgoogle\b/, variable: "--model-argon" },
  { pattern: /astra/, variable: "--model-astra" },
  { pattern: /\bsol\b/, variable: "--model-sol" },
  { pattern: /luna|\bgpt\b|openai|chatgpt/, variable: "--model-luna" },
];

export interface ModelColorInput {
  id?: string | null;
  name?: string | null;
  provider?: string | null;
}

function colorVariable(input: string | ModelColorInput): string {
  const text = (typeof input === "string"
    ? input
    : [input.id, input.provider, input.name].filter((part) => part && part.trim()).join(" ")
  )
    .toLowerCase()
    .replace(/:online$/, "");
  const key = text.includes("/") ? text.slice(text.lastIndexOf("/") + 1) : text;
  const tokens = Object.keys(MODEL_COLOR_VAR).sort((a, b) => b.length - a.length);
  for (const token of tokens) {
    if (key === token || key.startsWith(`${token}-`) || key.startsWith(token)) return MODEL_COLOR_VAR[token] ?? FALLBACK;
  }
  const alias = LAB_ALIAS.find((rule) => rule.pattern.test(text));
  return alias?.variable ?? FALLBACK;
}


/** Hex for the same identity color `modelColor` names. */
export function modelColorHex(input: string | ModelColorInput): string {
  return MODEL_COLOR_HEX[colorVariable(input)] ?? MODEL_COLOR_HEX[FALLBACK] ?? "#ff4d4d";
}

export const MODEL_COLOR_KEYS = Object.keys(MODEL_COLOR_VAR);

/**
 * Center a marker on the track without letting it hang past either end.
 * `sizePx` is the marker's width. Half of that width is the inset.
 */
export function clampedMarkerLeft(percent: number, sizePx: number): string {
  const half = sizePx / 2;
  return `clamp(${half}px, ${percent}%, calc(100% - ${half}px))`;
}

/** Swarm's short display name for a model, e.g. "openai/gpt-4o" becomes "GPT". */
export function shortModelName(name: string | null | undefined): string {
  const clean = (name ?? "").replace(/^openrouter:/i, "").trim();
  const lower = clean.toLowerCase();
  if (!clean) return "Model";
  if (lower.includes("gemini")) return "Gemini";
  if (lower.includes("gpt") || lower.includes("openai") || lower.includes("chatgpt")) return "GPT";
  if (lower.includes("claude")) return "Claude";
  if (lower.includes("grok")) return "Grok";
  if (lower.includes("llama")) return "Llama";
  if (lower.includes("deepseek")) return "DeepSeek";
  if (lower.includes("mistral") || lower.includes("mixtral")) return "Mistral";
  if (lower.includes("qwen")) return "Qwen";
  if (lower.includes("perplexity") || lower.includes("sonar")) return "Perplexity";
  const short = clean.split(/[:/]/).pop()?.trim() || "Model";
  return short.length <= 12 ? short : `${short.slice(0, 11).trimEnd()}...`;
}

const ICONS: Record<string, string> = {
  GPT: "chatgpt.png",
  Claude: "claude.png",
  Gemini: "gemini.png",
  Grok: "grok.png",
  DeepSeek: "deepseek.png",
  Llama: "metallama.png",
  Qwen: "qwen.png",
  Mistral: "mistral.png",
  Perplexity: "perplexity.png",
};

/** The same model icon Swarm Explorer shows, served from swarm.verafy.ai. */
export function modelIcon(name: string): string {
  return `https://swarm.verafy.ai/icons/${ICONS[shortModelName(name)] ?? "truth.png"}`;
}
