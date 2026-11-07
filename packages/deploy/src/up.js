/**
 * `verafy up`: ask a few questions (or read flags), show the plan, then carry
 * it out. `verafy up --ui` serves the same questions as a page on
 * 127.0.0.1 for people who would rather click.
 * @module @verafyharness/deploy/up
 */
import { createInterface } from 'node:readline/promises'
import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import { randomBytes } from 'node:crypto'
import { plan, redact, TARGETS } from './plan.js'
import { CLOUDS } from './clouds.js'
import { HOSTED, recommend } from './profiles.js'
import { detectHardware } from './serve.js'

const expand = p => p.replace(/^~(?=\/)/, homedir())

/** Write a plan's files. Returns the paths written. */
export function writeFiles(p, { dir = process.cwd() } = {}) {
  const out = []
  for (const f of p.files) {
    const path = f.path.startsWith('~') ? expand(f.path) : join(dir, f.path)
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
    writeFileSync(path, f.content, { mode: f.mode ?? 0o600 })
    out.push(path)
  }
  return out
}

/**
 * Carry out a plan: write files, then run what the target needs.
 * @param {object} p - from plan().
 * @param {{env?: object, fetch?: Function, say?: Function, run?: boolean, cloudToken?: string, waitMs?: number}} [o]
 * @returns {Promise<object>} what happened.
 */
export async function apply(p, { env = process.env, fetch: f = globalThis.fetch, say = console.log, run = true, cloudToken, waitMs = 5000 } = {}) {
  const written = writeFiles(p)
  for (const w of written) say(`wrote ${w}`)
  if (p.target === 'user-data') { say(`\nUser data for any cloud: ${written[0]}`); return { written } }
  if (p.target === 'local') {
    if (!run) return { written }
    say('\nStarting the harness here. Ctrl-C stops it; your key and open commitments stay in ~/.verafy.')
    const r = spawnSync(process.execPath, [join(new URL('../../../', import.meta.url).pathname, 'bin/verafy.js'), 'harness', 'serve', '--env', expand('~/.verafy/env')], { stdio: 'inherit' })
    return { written, exit: r.status }
  }
  if (p.target === 'docker') {
    const cmd = p.steps.at(-1).replace('~/.verafy/env', expand('~/.verafy/env'))
    if (!run || spawnSync('docker', ['version'], { stdio: 'ignore' }).status !== 0) { say(`\nRun:\n  ${cmd}`); return { written, command: cmd } }
    const r = spawnSync('sh', ['-c', cmd], { stdio: 'inherit' })
    return { written, command: cmd, exit: r.status }
  }
  const c = CLOUDS[p.cloud.provider]
  const token = cloudToken ?? env[c.tokenEnv]
  if (!token) throw new Error(`set ${c.tokenEnv} to your ${c.name} API token (used once to create the server, never stored)`)
  say(`\nCreating ${c.name} server ${p.cloud.name}: ${p.cloud.plan} in ${p.cloud.region}. The provider bills for it from now until you delete it.`)
  const server = await c.create({ token, name: p.cloud.name, plan: p.cloud.plan, region: p.cloud.region, userData: p.cloud.userData, fetch: f })
  let st = { status: 'new', ip: null }
  for (let i = 0; i < 60 && !st.ip; i++) {
    st = await c.status({ token, id: server.id, fetch: f })
    if (!st.ip) await new Promise(r => setTimeout(r, waitMs))
  }
  const url = st.ip ? `http://${st.ip}:7200` : null
  say(url ? `\nServer ${server.id} is up at ${st.ip}. First boot installs everything; in a few minutes:\n  curl ${url}/health` : `\nServer ${server.id} created; no address yet. Check the ${c.name} console.`)
  return { written, server: { ...server, ...st, url } }
}

async function ask(rl, q, def) {
  const a = (await rl.question(`${q}${def ? ` [${def}]` : ''}: `)).trim()
  return a || def
}

async function askSecret(q) {
  if (!process.stdin.isTTY) { const rl = createInterface({ input: process.stdin }); const a = await rl.question(''); rl.close(); return a.trim() }
  process.stdout.write(`${q}: `)
  return new Promise(resolve => {
    let s = ''
    process.stdin.setRawMode(true)
    process.stdin.resume()
    const on = b => {
      const ch = b.toString('utf8')
      if (ch === '\r' || ch === '\n') { process.stdin.setRawMode(false); process.stdin.pause(); process.stdin.off('data', on); process.stdout.write('\n'); resolve(s) }
      else if (ch === '\u0003') process.exit(130)
      else if (ch === '\u007f') s = s.slice(0, -1)
      else s += ch
    }
    process.stdin.on('data', on)
  })
}

/**
 * The interactive flow. Flags fill answers and skip their questions:
 * --target --family --model --kind --nodes --id --public-url --region --plan --ref --mock --yes
 */
export async function upInteractive(flags = {}, { env = process.env } = {}) {
  const hw = detectHardware()
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  console.log(`This machine: ${hw.memGb} GB RAM, ${hw.cpus} CPUs${hw.gpuMemGb ? `, about ${hw.gpuMemGb} GB usable by a GPU` : ', no GPU found'}.`)
  const target = flags.target ?? await ask(rl, `Where should the harness run? (${TARGETS.join(', ')})`, 'local')
  const localish = target === 'local' || target === 'docker'
  const rec = recommend(localish ? hw : { memGb: 2 })
  const kind = flags.kind ?? (flags.mock ? 'hosted' : await ask(rl, `Model: hosted (an API key) or local (open weights on the same machine)? ${localish ? `Suggested: ${rec.kind}. ${rec.why}` : ''}`, localish ? rec.kind : 'hosted'))
  let family = flags.family, model = flags.model
  if (kind === 'local') {
    const opts = (localish ? rec.options : recommend({ memGb: 32 }).options).slice(0, 6)
    if (!model) console.log(opts.map(o => `  ${o.tag.padEnd(20)} ${o.family.padEnd(9)} ${o.tier.padEnd(6)} about ${o.needGb} GB (modeled), ${o.on}`).join('\n'))
    model ??= await ask(rl, 'Ollama model tag', opts[0]?.tag ?? 'qwen3:4b')
    family ??= opts.find(o => o.tag === model)?.family ?? await ask(rl, 'Model family (the base model it descends from)', 'qwen')
  } else {
    if (!model) console.log(HOSTED.map(o => `  ${o.family.padEnd(10)} ${o.model}`).join('\n'))
    family ??= await ask(rl, 'Model family', 'mistral')
    model ??= await ask(rl, 'Model', HOSTED.find(h => h.family === family)?.model)
  }
  const nodes = flags.nodes ?? (await ask(rl, 'Node URLs, comma-separated (empty to start without)', env.VERAFY_NODES ?? '')).split(',').map(s => s.trim()).filter(Boolean)
  const publicUrl = flags.publicUrl ?? (localish && nodes.length ? await ask(rl, 'Address nodes reach this harness at', `http://127.0.0.1:7200`) : undefined)
  rl.close()
  const apiKey = kind === 'hosted' && !flags.mock ? (env.VERAFY_API_KEY ?? await askSecret('Model API key (VERAFY_API_KEY; not shown)')) : undefined
  let cloudToken
  if (CLOUDS[target] && !env[CLOUDS[target].tokenEnv]) cloudToken = await askSecret(`${CLOUDS[target].name} API token (${CLOUDS[target].tokenEnv}; used once, not stored)`)
  const p = plan({ target, kind, family, model, nodes, publicUrl, apiKey, id: flags.id, region: flags.region, plan: flags.plan, ref: flags.ref, mock: flags.mock })
  console.log('\nPlan:\n' + JSON.stringify(redact(p), null, 2))
  for (const w of p.warnings) console.log(`note: ${w}`)
  if (!flags.yes) {
    const rl2 = createInterface({ input: process.stdin, output: process.stdout })
    const go = await ask(rl2, 'Go ahead? (yes/no)', 'yes'); rl2.close()
    if (!/^y/i.test(go)) { console.log('Nothing done.'); return null }
  }
  return apply(p, { env, cloudToken })
}

/**
 * `verafy up --ui`: the same questions as a page on 127.0.0.1. The page holds a
 * one-time token in its URL, and every POST must carry it, so another site in
 * the browser cannot drive it. Keys are posted to this process only.
 */
export async function upUi({ port = 7299, open = true } = {}) {
  const token = randomBytes(16).toString('hex')
  const hw = detectHardware()
  const rec = recommend(hw)
  const page = uiPage(token, hw, rec)
  const server = createServer(async (req, res) => {
    const u = new URL(req.url, 'http://127.0.0.1')
    if (req.method === 'GET' && u.pathname === `/${token}`) { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': "default-src 'self' 'unsafe-inline'" }); return res.end(page) }
    if (req.method === 'POST' && u.pathname === `/${token}/up` && req.headers['content-type'] === 'application/json') {
      const chunks = []; for await (const ch of req) chunks.push(ch)
      const say = []
      try {
        const a = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        const p = plan({ ...a, nodes: String(a.nodes ?? '').split(',').map(s => s.trim()).filter(Boolean), mock: Boolean(a.mock) })
        const r = await apply(p, { run: p.target !== 'local', cloudToken: a.cloudToken || undefined, say: s => say.push(s) })
        if (p.target === 'local') say.push('\nStart it with:\n  verafy harness serve --env ~/.verafy/env')
        res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ ok: true, log: say.join('\n'), plan: redact(p), result: { ...r, written: r.written } }))
      } catch (err) { res.writeHead(400, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ ok: false, error: err.message, log: say.join('\n') })) }
    }
    res.writeHead(404).end()
  })
  await new Promise(r => server.listen(port, '127.0.0.1', r))
  const url = `http://127.0.0.1:${server.address().port}/${token}`
  console.log(`Open ${url}\nCtrl-C to stop.`)
  if (open) spawnSync(process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open', [url], { stdio: 'ignore' })
  return { server, url }
}

function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]) }

function uiPage(token, hw, rec) {
  const hosted = HOSTED.map(h => `<option value="${esc(h.family)}|${esc(h.model)}">${esc(h.family)}: ${esc(h.model)}</option>`).join('')
  const local = rec.options.map(o => `<option value="${esc(o.family)}|${esc(o.tag)}">${esc(o.tag)} (${esc(o.family)}, ${o.tier}, about ${o.needGb} GB, ${o.on})</option>`).join('')
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Verafy Harness: launch</title>
<style>:root{--bg:#fff;--ink:#14181f;--mut:#5b6472;--line:#d9dde3;--acc:#2f3ccf}@media(prefers-color-scheme:dark){:root{--bg:#0f1217;--ink:#e8ebf0;--mut:#9aa3b2;--line:#2a303a;--acc:#8b93ff}}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 system-ui,sans-serif}main{max-width:40rem;margin:0 auto;padding:24px 16px}label{display:block;margin:14px 0 4px;font-weight:600}
select,input{width:100%;box-sizing:border-box;padding:8px;border:1px solid var(--line);background:var(--bg);color:var(--ink);border-radius:4px;font:inherit}button{margin-top:18px;padding:10px 16px;border:0;border-radius:4px;background:var(--acc);color:#fff;font:inherit;font-weight:600;cursor:pointer}
.mut{color:var(--mut);font-size:14px}pre{white-space:pre-wrap;border:1px solid var(--line);padding:12px;border-radius:4px;font-size:13px}</style></head><body><main>
<h1>Launch a harness</h1><p class="mut">This page runs on your machine (${hw.memGb} GB RAM, ${hw.cpus} CPUs${hw.gpuMemGb ? `, about ${hw.gpuMemGb} GB for a GPU` : ', no GPU'}). Keys go to this local process only. Suggested: ${esc(rec.why)}.</p>
<label for="target">Where</label><select id="target"><option value="local">This machine (Node)</option><option value="docker">This machine (Docker)</option><option value="digitalocean">DigitalOcean Droplet</option><option value="hetzner">Hetzner Cloud server</option><option value="user-data">Any cloud (user-data script)</option></select>
<label for="kind">Model</label><select id="kind"><option value="hosted">Hosted, with an API key</option><option value="local">Open weights on the same machine (Ollama)</option></select>
<label for="model">Which</label><select id="model">${hosted}</select>
<label for="apiKey">Model API key</label><input id="apiKey" type="password" autocomplete="off" placeholder="sk-or-...">
<label for="cloudToken">Cloud API token (DigitalOcean or Hetzner only; used once)</label><input id="cloudToken" type="password" autocomplete="off">
<label for="nodes">Node URLs, comma-separated</label><input id="nodes" placeholder="https://node1.example:7101">
<label><input id="mock" type="checkbox" style="width:auto"> Try it with scripted answers (no key, no model calls)</label>
<button id="go">Launch</button><pre id="out" hidden></pre>
<script>
const H=${JSON.stringify(hosted)},L=${JSON.stringify(local)};const $=id=>document.getElementById(id)
$('kind').onchange=()=>{$('model').innerHTML=$('kind').value==='local'?(L||'<option value="qwen|qwen3:4b">qwen3:4b</option>'):H}
$('go').onclick=async()=>{const [family,model]=$('model').value.split('|');$('out').hidden=false;$('out').textContent='Working...'
const r=await fetch(location.pathname+'/up',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({target:$('target').value,kind:$('kind').value,family,model,apiKey:$('apiKey').value,cloudToken:$('cloudToken').value,nodes:$('nodes').value,mock:$('mock').checked})})
const j=await r.json();$('out').textContent=j.ok?j.log+'\\n\\n'+JSON.stringify(j.plan,null,2):'Error: '+j.error}
</script></main></body></html>`
}
