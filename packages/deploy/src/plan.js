/**
 * `verafy up`: turn a few answers into a deployment. `plan` is pure (answers
 * in, files and steps out) so every target is tested without touching a
 * machine or a cloud; `apply` carries a plan out.
 *
 * Targets:
 *   local         run the daemon on this machine with Node
 *   docker        run the container image on this machine
 *   digitalocean  create a Droplet that installs and runs the daemon at first boot
 *   hetzner       create a Hetzner Cloud server, the same way
 *   user-data     print the first-boot script for any other cloud
 *
 * Keys: the model key goes to an env file with mode 600 (local, docker) or the
 * server's user data (cloud). A cloud API token is used for the one create
 * call and never written anywhere.
 *
 * @module @verafyharness/deploy/plan
 */
import { cloudInit } from './cloudinit.js'
import { CLOUDS, PLANS, serverName } from './clouds.js'
import { OPEN_WEIGHTS, memoryNeededGb } from './profiles.js'

export const TARGETS = ['local', 'docker', 'digitalocean', 'hetzner', 'user-data']
export const IMAGE = 'ghcr.io/verafyai/verafy-harness'

/**
 * @param {object} a - answers.
 * @param {string} a.target - one of TARGETS.
 * @param {string} a.family - the model's family.
 * @param {string} a.model - the model id (hosted) or Ollama tag (local).
 * @param {'hosted'|'local'} [a.kind] - hosted API model, or open weights served on the same machine.
 * @param {string} [a.id] - harness id.
 * @param {string[]} [a.nodes] - node URLs.
 * @param {number} [a.bond] - bond.
 * @param {string} [a.baseURL] - model endpoint for hosted models.
 * @param {string} [a.apiKey] - the model key (hosted).
 * @param {string} [a.region] - cloud region.
 * @param {string} [a.plan] - cloud server plan; picked by model size when omitted.
 * @param {string} [a.ref] - git ref the server runs.
 * @param {string} [a.publicUrl] - local and docker: where nodes reach this machine.
 * @param {boolean} [a.mock] - scripted answers.
 * @param {string} [a.version] - image tag.
 * @returns {{target: string, env: Record<string,string>, files: object[], steps: string[], cloud?: object, warnings: string[]}} the plan.
 */
export function plan(a) {
  if (!TARGETS.includes(a.target)) throw new Error(`target must be one of ${TARGETS.join(', ')}`)
  if (!a.family || !a.model) throw new Error('a model family and a model are needed')
  const kind = a.kind ?? 'hosted'
  const id = a.id ?? `h-${a.family}-${Math.random().toString(36).slice(2, 6)}`
  const cloud = a.target === 'digitalocean' || a.target === 'hetzner'
  const warnings = []
  const env = {
    VERAFY_HARNESS_ID: id,
    VERAFY_FAMILY: a.family,
    VERAFY_MODEL: a.model,
    VERAFY_BOND: String(a.bond ?? 500),
    VERAFY_PORT: '7200',
  }
  if (a.nodes?.length) env.VERAFY_NODES = a.nodes.join(',')
  else warnings.push('no nodes: the harness serves and waits, but no node will seat it until you add VERAFY_NODES')
  if (a.mock) env.VERAFY_MOCK = '1'
  if (kind === 'local') env.VERAFY_BASE_URL = a.target === 'docker' ? 'http://host.docker.internal:11434/v1' : 'http://127.0.0.1:11434/v1'
  else if (a.baseURL) env.VERAFY_BASE_URL = a.baseURL
  if (kind === 'hosted' && !a.mock) {
    if (!a.apiKey) throw new Error('a hosted model needs its API key (VERAFY_API_KEY)')
    env.VERAFY_API_KEY = a.apiKey
  }
  if (a.publicUrl) env.VERAFY_PUBLIC_URL = a.publicUrl
  else if (!cloud && a.target !== 'user-data' && a.nodes?.length) warnings.push('set publicUrl to an address the nodes can reach (a public IP, a tunnel, or a LAN address)')

  const steps = []
  const files = []
  const out = { target: a.target, id, env, files, steps, warnings }

  if (a.target === 'local') {
    files.push({ path: '~/.verafy/env', mode: 0o600, content: envFile(env) })
    if (kind === 'local') steps.push(`ollama pull ${a.model}`)
    steps.push('verafy harness serve --env ~/.verafy/env')
  }
  if (a.target === 'docker') {
    files.push({ path: '~/.verafy/env', mode: 0o600, content: envFile({ ...env, VERAFY_DATA_DIR: '/data' }) })
    if (kind === 'local') steps.push(`ollama pull ${a.model}`)
    steps.push(`docker run -d --name ${serverName(id)} --restart unless-stopped --env-file ~/.verafy/env -p 7200:7200 -v ${serverName(id)}-data:/data${kind === 'local' ? ' --add-host host.docker.internal:host-gateway' : ''} ${IMAGE}:${a.version ?? 'latest'}`)
  }
  if (cloud || a.target === 'user-data') {
    const sized = kind === 'local' ? sizeFor(a.model) : 'api'
    const userData = cloudInit({ env, ref: a.ref ?? 'main', ollamaTag: kind === 'local' ? a.model : null, cloud: cloud ? a.target : 'generic' })
    files.push({ path: `${serverName(id)}.user-data.sh`, mode: 0o600, content: userData, print: a.target === 'user-data' })
    if (cloud) {
      const c = CLOUDS[a.target]
      const p = a.plan ?? PLANS[a.target][sized]
      if (!p) throw new Error(`no ${c.name} plan for a model this size; pass a plan`)
      if (sized === 'mid') warnings.push(`${a.model} on a CPU server is slow; a GPU server or a hosted model is faster`)
      out.cloud = { provider: a.target, name: serverName(id), plan: p, region: a.region ?? c.defaultRegion, tokenEnv: c.tokenEnv, userData }
      steps.push(`create ${c.name} server ${out.cloud.name} (${p} in ${out.cloud.region})`, 'wait for its address, then poll http://<ip>:7200/health (first boot takes a few minutes)')
    } else {
      steps.push('paste the user-data script into your cloud\'s "user data" or "cloud-init" field when you create an Ubuntu 24.04 server, and open port 7200')
    }
    if (kind === 'hosted' && !a.mock) warnings.push('the model key is in the server\'s user data, which the cloud keeps in its metadata: use a key for this harness alone, with a spending limit')
  }
  return out
}

/** Size class for an Ollama tag: small or mid by modeled memory. */
export function sizeFor(tag) {
  const m = OPEN_WEIGHTS.find(x => x.tag === tag)
  if (!m) return 'mid'
  const gb = memoryNeededGb(m.paramsB)
  return gb <= 12 ? 'small' : gb <= 26 ? 'mid' : null
}

/** A dotenv file, values single-quoted. */
export function envFile(env) {
  return Object.entries(env).map(([k, v]) => `${k}='${String(v).replace(/'/g, `'\\''`)}'`).join('\n') + '\n'
}

/** Parse what envFile writes (and plain KEY=value lines). */
export function parseEnvFile(text) {
  const env = {}
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Z][A-Z0-9_]*)=(.*)$/)
    if (!m) continue
    let v = m[2].trim()
    if (v.startsWith("'") && v.endsWith("'")) v = v.slice(1, -1).replace(/'\\''/g, "'")
    else if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1)
    env[m[1]] = v
  }
  return env
}

/** A plan with secrets masked, for printing. */
export function redact(p) {
  const mask = v => (v ? `${String(v).slice(0, 4)}...` : v)
  const env = { ...p.env, ...(p.env.VERAFY_API_KEY ? { VERAFY_API_KEY: mask(p.env.VERAFY_API_KEY) } : {}) }
  return { ...p, env, files: p.files.map(f => ({ path: f.path, mode: f.mode })), cloud: p.cloud ? { ...p.cloud, userData: `(${p.cloud.userData.length} bytes)` } : undefined }
}
