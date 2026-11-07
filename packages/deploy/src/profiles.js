/**
 * Which model a machine can run. Every harness runs an open-weight model: any
 * model from Hugging Face. It either runs the weights itself through an
 * OpenAI-compatible local server such as Ollama, or calls a provider that
 * serves those same open weights over an API (any machine, even the smallest
 * server, can do that). A model's family is the base model it descends from.
 *
 * Memory needs are modeled, not measured: 4-bit weights at about 0.6 GB per
 * billion parameters, plus about 25% for the context cache and the runtime.
 * Check a model on the machine before trusting it with a bond.
 *
 * @module @verafyharness/deploy/profiles
 */

/** Open-weight models by family, smallest first. `tag` is the Ollama tag; check it exists before pulling. */
export const OPEN_WEIGHTS = Object.freeze([
  { family: 'qwen', model: 'Qwen3 4B', tag: 'qwen3:4b', paramsB: 4 },
  { family: 'gemma', model: 'Gemma 3 4B', tag: 'gemma3:4b', paramsB: 4 },
  { family: 'llama', model: 'Llama 3.1 8B', tag: 'llama3.1:8b', paramsB: 8 },
  { family: 'qwen', model: 'Qwen3 8B', tag: 'qwen3:8b', paramsB: 8 },
  { family: 'deepseek', model: 'DeepSeek R1 8B (distilled)', tag: 'deepseek-r1:8b', paramsB: 8 },
  { family: 'gemma', model: 'Gemma 3 12B', tag: 'gemma3:12b', paramsB: 12 },
  { family: 'qwen', model: 'Qwen3 14B', tag: 'qwen3:14b', paramsB: 14 },
  { family: 'mistral', model: 'Mistral Small 24B', tag: 'mistral-small:24b', paramsB: 24 },
  { family: 'gemma', model: 'Gemma 3 27B', tag: 'gemma3:27b', paramsB: 27 },
  { family: 'qwen', model: 'Qwen3 32B', tag: 'qwen3:32b', paramsB: 32 },
  { family: 'llama', model: 'Llama 3.3 70B', tag: 'llama3.3:70b', paramsB: 70 },
])

/** Open-weight models served over an API (OpenRouter), one per family, as in verafy.config.json. */
export const HOSTED = Object.freeze([
  { family: 'mistral', model: 'mistralai/mistral-small-3.2-24b-instruct' },
  { family: 'gpt-oss', model: 'openai/gpt-oss-120b' },
  { family: 'gemma', model: 'google/gemma-3-27b-it' },
  { family: 'llama', model: 'meta-llama/llama-4-maverick' },
  { family: 'qwen', model: 'qwen/qwen3-235b-a22b-2507' },
  { family: 'deepseek', model: 'deepseek/deepseek-v4-flash' },
])

/** Modeled memory a 4-bit model needs, in GB. */
export function memoryNeededGb(paramsB) {
  return Math.ceil(paramsB * 0.6 * 1.25 * 10) / 10
}

/** Rough router tier for a model size: small, mid or frontier. Hosted models are named by the operator. */
export function tierFor(paramsB) {
  return paramsB <= 9 ? 'small' : paramsB <= 40 ? 'mid' : 'frontier'
}

/**
 * The open-weights models a machine can hold, largest first.
 * @param {{memGb: number, gpuMemGb?: number}} hw - system RAM, and GPU memory if any.
 * @param {{headroomGb?: number}} [o] - memory left for the OS and the harness.
 * @returns {object[]} models with `needGb`, `tier` and `on` (gpu or cpu).
 */
export function fits(hw, { headroomGb = 2 } = {}) {
  const out = []
  for (const m of OPEN_WEIGHTS) {
    const needGb = memoryNeededGb(m.paramsB)
    const on = hw.gpuMemGb && needGb <= hw.gpuMemGb ? 'gpu' : needGb <= hw.memGb - headroomGb ? 'cpu' : null
    if (on) out.push({ ...m, needGb, tier: tierFor(m.paramsB), on })
  }
  return out.sort((a, b) => b.paramsB - a.paramsB)
}

/**
 * A recommendation for this machine: the largest model that fits, preferring
 * the GPU, or a hosted model when nothing fits well. A CPU-only machine can
 * run a small model, slowly; it is offered but not recommended over hosted.
 * @param {{memGb: number, gpuMemGb?: number, cpus?: number}} hw - the machine.
 * @param {{family?: string}} [o] - prefer this family.
 * @returns {{kind: 'local'|'hosted', model: object, why: string, options: object[]}} the pick.
 */
export function recommend(hw, { family } = {}) {
  const options = fits(hw).filter(m => !family || m.family === family)
  const gpu = options.find(m => m.on === 'gpu')
  if (gpu) return { kind: 'local', model: gpu, why: `${gpu.model} needs about ${gpu.needGb} GB (modeled) and fits in ${hw.gpuMemGb} GB of GPU memory`, options }
  const hosted = HOSTED.find(m => !family || m.family === family) ?? HOSTED[0]
  const cpu = options[0]
  const why = cpu
    ? `no GPU: ${cpu.model} fits in RAM but runs slowly on a CPU, so a hosted model is the default`
    : `this machine has ${hw.memGb} GB of RAM, too little for a local model, so it calls a hosted one`
  return { kind: 'hosted', model: hosted, why, options }
}
