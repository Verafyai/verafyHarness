/**
 * Model providers a harness can mount. Swapping the AI means swapping the
 * provider and the committed model id; nothing else in the harness changes.
 *
 *   mock     scripted answers from examples/mock-answers.json, for demos and tests
 *   openai   any OpenAI-compatible chat endpoint: OpenRouter, a gateway, or a local server
 *
 * Inside DeepSeek Harness the same swap is a `@deepseek-ai/dsh-llm-pi-ai` route;
 * see config/cordis.verafy.yml.
 *
 * A provider's `complete(req)` resolves to the model's reply text, or to
 * `{content, proofHash}` when the route can commit to an off-chain proof of the
 * inference. The request carries `model`, `system` and `user`, plus `ascId` and
 * `family` so a scripted provider can answer any contract.
 * @module @verafyharness/core/providers
 */

/**
 * A provider that returns scripted answers keyed by contract id and model family. Bind it
 * to one contract and family, or leave either out and it reads them from each
 * request (`req.ascId`, `req.family`), so one long-lived harness can answer every
 * contract.
 * @param {Record<string, Record<string, object>>} script - answers by contract id, then model family.
 * @param {string} [ascId] - the contract being ruled on; read from the request when omitted.
 * @param {string} [family] - the juror's model family; read from the request when omitted.
 * @returns {{complete: (req?: {ascId?: string, family?: string}) => Promise<string>}} the provider.
 */
export function mockProvider(script, ascId, family) {
  return {
    async complete(req = {}) {
      const id = ascId ?? req.ascId
      const l = family ?? req.family ?? req.lab
      const a = script[id]?.[l]
      if (!a) throw new Error(`no scripted answer for ${id} / ${l}`)
      return JSON.stringify(a)
    },
  }
}

/** Retry defaults: four attempts, exponential backoff from 500 ms, capped at 8 s, full jitter. */
export const RETRY_DEFAULTS = Object.freeze({ attempts: 4, baseMs: 500, maxMs: 8000 })

/**
 * An error from a model endpoint, carrying the HTTP status when there is one.
 * `retryable` is true for 429, 5xx and network failures.
 */
export class ProviderError extends Error {
  /**
   * @param {string} message - what failed.
   * @param {{status?: number, retryable?: boolean, retryAfterMs?: number, cause?: unknown}} [info] - details.
   */
  constructor(message, { status, retryable = false, retryAfterMs, cause } = {}) {
    super(message, cause ? { cause } : undefined)
    this.name = 'ProviderError'
    this.status = status
    this.retryable = retryable
    this.retryAfterMs = retryAfterMs
  }
}

/**
 * Whether a failed call is worth another attempt: rate limits (429), server
 * errors (5xx) and network errors. A 4xx other than 429 is the caller's fault
 * and is not retried.
 * @param {unknown} err - the error a provider threw.
 * @returns {boolean} whether to retry.
 */
export function isRetryable(err) {
  if (err?.retryable !== undefined) return Boolean(err.retryable)
  const status = err?.status
  if (typeof status === 'number') return status === 429 || status >= 500
  // fetch rejects with a TypeError on network failure; timeouts are AbortError or TimeoutError.
  return err?.name === 'TypeError' || err?.name === 'AbortError' || err?.name === 'TimeoutError' || ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN', 'UND_ERR_SOCKET'].includes(err?.code ?? err?.cause?.code)
}

/**
 * The wait before retry number `n` (0 for the first retry): full jitter over an
 * exponential window, capped. A server's Retry-After wins when it is shorter
 * than the cap.
 * @param {number} n - retries already made.
 * @param {{baseMs?: number, maxMs?: number, random?: () => number}} [options] - backoff settings.
 * @param {number} [retryAfterMs] - the server's Retry-After, if it sent one.
 * @returns {number} milliseconds to wait.
 */
export function backoffDelay(n, { baseMs = RETRY_DEFAULTS.baseMs, maxMs = RETRY_DEFAULTS.maxMs, random = Math.random } = {}, retryAfterMs) {
  if (Number.isFinite(retryAfterMs) && retryAfterMs >= 0) return Math.min(maxMs, retryAfterMs)
  return Math.floor(random() * Math.min(maxMs, baseMs * 2 ** n))
}

/**
 * Wrap a provider so each call retries rate limits, server errors and network
 * errors with capped exponential backoff and jitter. The retry lives inside the
 * harness's own provider, so each harness backs off on its own; a harness that
 * still fails after the last attempt throws, and the jury drops it exactly as
 * it drops any harness whose commit fails.
 * @param {{complete: (req: object) => Promise<unknown>}} provider - the provider to wrap.
 * @param {{attempts?: number, baseMs?: number, maxMs?: number, random?: () => number, sleep?: (ms: number) => Promise<void>, onRetry?: (info: {attempt: number, delayMs: number, error: unknown}) => void}} [options] -
 *   `attempts` counts the first try; `sleep` and `random` are injectable for tests.
 * @returns {{complete: (req: object) => Promise<unknown>}} the wrapped provider.
 */
export function withRetry(provider, options = {}) {
  const attempts = Math.max(1, Math.floor(options.attempts ?? RETRY_DEFAULTS.attempts))
  const sleep = options.sleep ?? (ms => new Promise(r => setTimeout(r, ms)))
  return {
    ...provider,
    async complete(req) {
      for (let attempt = 1; ; attempt++) {
        try {
          return await provider.complete(req)
        } catch (err) {
          if (attempt >= attempts || !isRetryable(err)) {
            if (attempt > 1 && err instanceof Error) err.message = `${err.message} (after ${attempt} attempts)`
            throw err
          }
          const delayMs = backoffDelay(attempt - 1, options, err?.retryAfterMs)
          options.onRetry?.({ attempt, delayMs, error: err })
          await sleep(delayMs)
        }
      }
    },
  }
}

/**
 * Parse an HTTP Retry-After header: seconds, or an HTTP date.
 * @param {string | null} value - the header.
 * @returns {number | undefined} milliseconds, if the header was usable.
 */
function retryAfter(value) {
  if (!value) return undefined
  const s = Number(value)
  if (Number.isFinite(s)) return s * 1000
  const t = Date.parse(value)
  return Number.isFinite(t) ? Math.max(0, t - Date.now()) : undefined
}

/**
 * A provider for any OpenAI-compatible chat completions endpoint. Calls retry
 * 429, 5xx and network errors by default (see `withRetry`); pass `retry: false`
 * to fail on the first error, or retry options to tune it.
 * @param {{baseURL: string, apiKey: string, retry?: false | object, fetch?: typeof fetch}} options - endpoint, key,
 *   retry settings, and an injectable `fetch` for tests.
 * @returns {{complete: (req: {model: string, system: string, user: string}) => Promise<string>}} the provider.
 */
export function openaiProvider({ baseURL, apiKey, retry = {}, fetch: fetchImpl = globalThis.fetch }) {
  if (!apiKey) throw new Error('openai provider needs an API key; set VERAFY_API_KEY')
  const once = {
    async complete({ model, system, user }) {
      let res
      try {
        res = await fetchImpl(`${baseURL.replace(/\/$/, '')}/chat/completions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ model, temperature: 0, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
        })
      } catch (err) {
        throw new ProviderError(`${model}: network error: ${err?.message ?? err}`, { retryable: isRetryable(err), cause: err })
      }
      if (!res.ok) {
        const status = res.status
        throw new ProviderError(`${model}: HTTP ${status} ${await res.text()}`, { status, retryable: status === 429 || status >= 500, retryAfterMs: retryAfter(res.headers?.get?.('retry-after')) })
      }
      const body = await res.json()
      return body.choices?.[0]?.message?.content ?? ''
    },
  }
  return retry === false ? once : withRetry(once, retry)
}
