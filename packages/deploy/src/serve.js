/**
 * Start one harness daemon from a serve config: the provider, the harness
 * (with its key kept in the data directory), and the daemon.
 * @module @verafyharness/deploy/serve
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { totalmem, cpus } from 'node:os'
import { execFileSync } from 'node:child_process'
import { Harness, mockProvider, openaiProvider } from '../../core/src/index.js'
import { HarnessDaemon } from '../../daemon/src/index.js'
import { checkServeConfig, isLocalEndpoint } from './config.js'

const ROOT = new URL('../../../', import.meta.url).pathname

/** The model provider a config asks for. Scripted answers with `mock`. */
export function providerFrom(c, env = process.env) {
  if (c.mock) return mockProvider(JSON.parse(readFileSync(join(ROOT, 'examples/mock-answers.json'), 'utf8')))
  const apiKey = env[c.provider.apiKeyEnv] ?? (isLocalEndpoint(c.provider.baseURL) ? 'local' : undefined)
  return openaiProvider({ baseURL: c.provider.baseURL, apiKey, retry: c.provider.retry ?? {} })
}

/**
 * Build and start the daemon.
 * @param {ReturnType<import('./config.js').serveConfig>} c - the config.
 * @param {{env?: object, log?: Function}} [o] - environment and event sink.
 * @returns {Promise<HarnessDaemon>} the running daemon.
 */
export async function startServe(c, { env = process.env, log } = {}) {
  const problems = checkServeConfig(c, env)
  if (problems.length) throw new Error(problems.join('\n'))
  mkdirSync(c.dataDir, { recursive: true, mode: 0o700 })
  if (!c.harness.id) {
    // One id per data directory, kept across restarts, so the key and the record stay with it.
    const idFile = join(c.dataDir, 'harness-id')
    if (!existsSync(idFile)) writeFileSync(idFile, `h-${c.harness.family}-${Math.random().toString(36).slice(2, 8)}\n`, { mode: 0o600 })
    c = { ...c, harness: { ...c.harness, id: readFileSync(idFile, 'utf8').trim() } }
  }
  const harness = new Harness({ ...c.harness, provider: providerFrom(c, env), identityFile: join(c.dataDir, `${c.harness.id}.identity.pem`) })
  const daemon = new HarnessDaemon({ harness, nodes: c.nodes, publicUrl: c.publicUrl, port: c.port, stateFile: join(c.dataDir, `${c.harness.id}.state.json`), misbehave: c.misbehave, ...(log ? { log } : {}) })
  await daemon.start()
  return daemon
}

/** What this machine has: RAM, CPUs, and NVIDIA GPU memory if `nvidia-smi` answers. Apple silicon shares RAM with the GPU. */
export function detectHardware() {
  const memGb = Math.round(totalmem() / 2 ** 30)
  let gpuMemGb = 0
  try {
    const out = execFileSync('nvidia-smi', ['--query-gpu=memory.total', '--format=csv,noheader,nounits'], { encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] })
    gpuMemGb = Math.round(out.split('\n').filter(Boolean).reduce((s, l) => s + Number(l), 0) / 1024)
  } catch { /* no NVIDIA GPU */ }
  if (!gpuMemGb && process.platform === 'darwin' && process.arch === 'arm64') gpuMemGb = Math.floor(memGb * 0.66)
  return { memGb, gpuMemGb, cpus: cpus().length, platform: process.platform, arch: process.arch }
}
