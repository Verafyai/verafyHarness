/**
 * Adapters for real provers: DeepProve (Lagrange) and FlashProve (Anthropic),
 * reached as a subprocess or over HTTP. Neither ships the exact command line
 * below; each needs a thin wrapper around its own build. This file is the
 * contract that wrapper must meet, so the harness never links prover code.
 *
 * The contract (JSON in, JSON out; the same bodies for both transports):
 *
 *   op           subprocess: `<command> [...args] <op>`, body on stdin, reply on stdout
 *                HTTP:       POST <url>/<op>, body as JSON, reply as JSON
 *
 *   commitment   {}                                        -> {commitment}
 *   infer        {requests: [{id, input}]}                 -> {results: [{id, answer}]}
 *   prove        {commitment, requests: [{id, input}]}     -> {results: [{id, answer, proofRef, proofHash}]}
 *   verify       {proofRef, commitment, input, answer}     -> {ok: boolean, reason?}
 *
 *   input        {system, user}: the exact prompt text, tokenized by the wrapper
 *   answer       the output text the model produced (greedy decoding)
 *   proofRef     where the proof bytes are, such as a file path the verifier can read
 *   proofHash    SHA-256 hex of the proof bytes
 *   exit code    0 on success; anything else is an error, with the message on stderr
 *
 * A wrapper must refuse to prove under a commitment other than its own, and
 * its verify must return ok: false (not an error) for a proof that does not
 * check, including one made under another commitment.
 * @module @verafyharness/prove/external
 */
import { spawn } from 'node:child_process'
import { checkResult } from './interface.js'

/**
 * Call one op on an external prover.
 * @param {{command?: string, args?: string[], url?: string, fetch?: typeof fetch, timeoutMs?: number, env?: object}} t - the transport.
 * @param {string} op - commitment, infer, prove or verify.
 * @param {object} body - the request body.
 * @returns {Promise<object>} the parsed reply.
 */
export async function callExternal(t, op, body) {
  if (t.url) {
    const f = t.fetch ?? globalThis.fetch
    const res = await f(`${t.url.replace(/\/$/, '')}/${op}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(t.timeoutMs ?? 3_600_000) })
    const json = await res.json().catch(() => null)
    if (!res.ok) throw new Error(`${op}: HTTP ${res.status}${json?.error ? `: ${json.error}` : ''}`)
    return json
  }
  if (!t.command) throw new Error('an external prover needs a command (subprocess) or a url (HTTP)')
  return new Promise((resolve, reject) => {
    const child = spawn(t.command, [...(t.args ?? []), op], { stdio: ['pipe', 'pipe', 'pipe'], env: t.env ?? process.env, timeout: t.timeoutMs ?? 3_600_000 })
    let out = ''
    let err = ''
    child.stdout.on('data', d => { out += d })
    child.stderr.on('data', d => { err += d })
    child.on('error', reject)
    child.on('close', code => {
      if (code !== 0) return reject(new Error(`${op}: exit ${code}${err ? `: ${err.trim().slice(0, 500)}` : ''}`))
      try { resolve(JSON.parse(out)) } catch { reject(new Error(`${op}: reply is not JSON`)) }
    })
    child.stdin.end(JSON.stringify(body))
  })
}

/**
 * A Prover over the external contract.
 * @param {{name: string, command?: string, args?: string[], url?: string, fetch?: typeof fetch, timeoutMs?: number}} options - the transport.
 * @returns {object} the prover.
 */
export function externalProver(options) {
  let commitment = null
  const self = {
    name: options.name,
    async commitment() {
      if (commitment) return commitment
      const r = await callExternal(options, 'commitment', {})
      if (!/^[0-9a-f]{64}$/.test(String(r?.commitment))) throw new Error(`${options.name}: commitment is not a SHA-256 hex digest`)
      return (commitment = r.commitment)
    },
    async infer(requests) {
      const r = await callExternal(options, 'infer', { requests: requests.map(({ id, input }) => ({ id, input })) })
      return order(requests, r?.results, x => { if (typeof x?.answer !== 'string') throw new Error(`${options.name}: infer result carries no answer`); return x })
    },
    async prove(requests) {
      const c = await self.commitment()
      const r = await callExternal(options, 'prove', { commitment: c, requests: requests.map(({ id, input }) => ({ id, input })) })
      return order(requests, r?.results, checkResult)
    },
  }
  return self
}

/**
 * A Verifier over the external contract.
 * @param {{name: string, command?: string, args?: string[], url?: string, fetch?: typeof fetch, timeoutMs?: number}} options - the transport.
 * @returns {object} the verifier.
 */
export function externalVerifier(options) {
  return {
    name: options.name,
    async verify(proofRef, commitment, input, answer) {
      const r = await callExternal(options, 'verify', { proofRef, commitment, input, answer })
      return r?.ok === true
    },
  }
}

function order(requests, results, check) {
  if (!Array.isArray(results)) throw new Error('reply carries no results')
  const by = new Map(results.map(r => [r?.id, r]))
  return requests.map(q => {
    const r = by.get(q.id)
    if (!r) throw new Error(`no result for request ${q.id}`)
    return check(r)
  })
}

/**
 * DeepProve (github.com/Lagrange-Families/deep-prove), CPU or GPU build, behind a
 * wrapper that meets the contract above. Its `bench-llm` binary proves and
 * verifies a random prompt in one run and has no per-request prove or verify
 * command, so the wrapper is written against the `zkml` crate. Note: the repo's
 * LICENSE is the Lagrange License (evaluation and internal use; using the
 * software binds the user to it). Accepting it is Rex's decision.
 * @param {{command?: string, args?: string[], url?: string}} options - the transport.
 * @returns {object} the prover.
 */
export function deepProveProver(options) {
  return externalProver({ ...options, name: 'deepprove' })
}

/** @param {{command?: string, args?: string[], url?: string}} options - the transport. @returns {object} the DeepProve verifier. */
export function deepProveVerifier(options) {
  return externalVerifier({ ...options, name: 'deepprove' })
}

/**
 * FlashProve (github.com/anthropics/FlashProve, Apache 2.0, a research
 * prototype marked not maintained), behind a wrapper that meets the contract
 * above. The repo ships a prover, a C++ verifier (fast, tested against the Lean
 * verifier, no formal guarantee) and a Lean verifier. The verifier wrapper is
 * what auditors and nodes run on CPU.
 * @param {{command?: string, args?: string[], url?: string}} options - the transport.
 * @returns {object} the prover.
 */
export function flashProveProver(options) {
  return externalProver({ ...options, name: 'flashprove' })
}

/**
 * The FlashProve CPU verifier. Two ways to reach it:
 *   - the external contract above (`command` or `url`), through a wrapper; or
 *   - `cpVerify`: the path to FlashProve's own `cp_verify`, called exactly as its
 *     README documents: `cp_verify <config> <ivk> <req> <y> <proof> -id <commitment> -q`.
 *     Accepted only at exit code 0 with a last line of exactly `YES`. Here
 *     `proofRef` is `{config, ivk, req, y, proof}` (file paths). `cp_verify`
 *     checks the proof under the commitment ID; it does not know our prompt
 *     text, so `bindsTo(proofRef, input, answer)` must also hold: it checks that
 *     the request and reply files (`req`, `y`) are this input and this answer,
 *     through FlashProve's tokenizer. With no `bindsTo`, verify returns false.
 * @param {{command?: string, args?: string[], url?: string, cpVerify?: string, bindsTo?: (proofRef: object, input: object, answer: string) => boolean | Promise<boolean>, timeoutMs?: number}} options - the transport.
 * @returns {object} the FlashProve CPU verifier.
 */
export function flashProveVerifier(options) {
  if (!options.cpVerify) return externalVerifier({ ...options, name: 'flashprove' })
  return {
    name: 'flashprove',
    async verify(proofRef, commitment, input, answer) {
      if (typeof options.bindsTo !== 'function') return false
      const { config, ivk, req, y, proof } = proofRef ?? {}
      if (![config, ivk, req, y, proof].every(x => typeof x === 'string')) return false
      if (!/^[0-9a-f]{64}$/.test(String(commitment))) return false
      const { code, out } = await run(options.cpVerify, [config, ivk, req, y, proof, '-id', commitment, '-q'], options.timeoutMs)
      const last = out.trimEnd().split('\n').pop()
      if (code !== 0 || last !== 'YES') return false
      return (await options.bindsTo(proofRef, input, answer)) === true
    },
  }
}

function run(command, args, timeoutMs = 600_000) {
  return new Promise(resolve => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], timeout: timeoutMs })
    let out = ''
    child.stdout.on('data', d => { out += d })
    child.on('error', () => resolve({ code: -1, out: '' }))
    child.on('close', code => resolve({ code, out }))
  })
}
