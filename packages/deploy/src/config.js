/**
 * One harness's serve config, from a JSON file and the environment. The
 * environment wins, so a container or a cloud server is configured with
 * variables alone and no file:
 *
 *   VERAFY_HARNESS_ID   VERAFY_FAMILY   VERAFY_MODEL   VERAFY_BOND   (VERAFY_LAB is read as VERAFY_FAMILY)
 *   VERAFY_BASE_URL     any OpenAI-compatible endpoint (OpenRouter, Ollama, vLLM)
 *   VERAFY_API_KEY      the model key (read by name, never written to the config)
 *   VERAFY_NODES        comma-separated node URLs
 *   VERAFY_PUBLIC_URL   where nodes reach this harness
 *   VERAFY_PORT         default 7200
 *   VERAFY_DATA_DIR     identity key and open commitments; default ~/.verafy
 *   VERAFY_MOCK=1       scripted answers, no model calls (for trying it out)
 *
 * @module @verafyharness/deploy/config
 */
import { homedir } from 'node:os'
import { join } from 'node:path'

export const DEFAULTS = Object.freeze({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKeyEnv: 'VERAFY_API_KEY',
  port: 7200,
  bond: 500,
})

/**
 * Merge a file config and the environment into one serve config.
 * @param {object} [file] - the parsed config file, if any.
 * @param {Record<string, string|undefined>} [env] - the environment.
 * @returns {{harness: object, provider: object, nodes: string[], port: number, publicUrl: string, dataDir: string, mock: boolean}} the config.
 */
export function serveConfig(file = {}, env = process.env) {
  const h = file.harness ?? {}
  const family = env.VERAFY_FAMILY ?? env.VERAFY_LAB ?? h.family ?? h.lab
  const model = env.VERAFY_MODEL ?? h.model
  const harness = {
    id: env.VERAFY_HARNESS_ID ?? h.id,  // when unset, startServe makes one and keeps it in the data directory
    family,
    model,
    bond: Number(env.VERAFY_BOND ?? h.bond ?? DEFAULTS.bond),
  }
  const provider = {
    baseURL: env.VERAFY_BASE_URL ?? h.baseURL ?? file.provider?.baseURL ?? DEFAULTS.baseURL,
    apiKeyEnv: h.apiKeyEnv ?? file.provider?.apiKeyEnv ?? DEFAULTS.apiKeyEnv,
    ...(file.provider?.retry ? { retry: file.provider.retry } : {}),
  }
  const port = Number(env.VERAFY_PORT ?? file.port ?? DEFAULTS.port)
  const nodes = (env.VERAFY_NODES ?? (file.nodes ?? []).join(',')).split(',').map(s => s.trim()).filter(Boolean)
  const publicUrl = env.VERAFY_PUBLIC_URL ?? file.publicUrl ?? `http://127.0.0.1:${port}`
  const dataDir = env.VERAFY_DATA_DIR ?? file.dataDir ?? join(homedir(), '.verafy')
  const mock = env.VERAFY_MOCK === '1' || file.mock === true
  return { harness, provider, nodes, port, publicUrl, dataDir, mock }
}

/**
 * What is missing or wrong, before anything starts.
 * @param {ReturnType<typeof serveConfig>} c - the config.
 * @param {Record<string, string|undefined>} [env] - the environment.
 * @returns {string[]} problems; empty when it can start.
 */
export function checkServeConfig(c, env = process.env) {
  const p = []
  if (!c.harness.family) p.push('no model family: set VERAFY_FAMILY or harness.family to the base model your open-weight model descends from (llama, qwen, mistral, deepseek, gemma, ...)')
  if (!c.harness.model) p.push('no model: set VERAFY_MODEL or harness.model')
  if (!(c.harness.bond > 0)) p.push('bond must be a positive number')
  if (!c.mock && !env[c.provider.apiKeyEnv] && !isLocalEndpoint(c.provider.baseURL)) p.push(`no model key: set ${c.provider.apiKeyEnv} (or VERAFY_MOCK=1 to try it with scripted answers)`)
  if (!(c.port >= 0 && c.port < 65536)) p.push('port must be 0 to 65535')
  if (c.nodes.length && /127\.0\.0\.1|localhost/.test(c.publicUrl) && !c.nodes.every(n => /127\.0\.0\.1|localhost/.test(n))) p.push('publicUrl is a local address but the nodes are remote: set VERAFY_PUBLIC_URL to an address they can reach')
  return p
}

/** A model server on this machine or a private network needs no key (Ollama, vLLM). */
export function isLocalEndpoint(url) {
  try {
    const h = new URL(url).hostname
    return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === 'host.docker.internal' || h.endsWith('.local') || /^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(h)
  } catch { return false }
}
