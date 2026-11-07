#!/usr/bin/env node
/**
 * Run Verafy jurors as DeepSeek Harness processes (ROADMAP.md, milestone 2).
 *
 *   node scripts/dsh-juror.mjs setup
 *       link the plugin's peers and mount it in the headless profile
 *   node scripts/dsh-juror.mjs vote --family mistral [--route scripted|openrouter] [--asc file] [--probe]
 *       one DSH juror loads the contract and casts a committed vote
 *   node scripts/dsh-juror.mjs jury [--route scripted|openrouter] [--asc file] [--probe]
 *       five DSH jurors on five families' routes vote in parallel, then the CLI seals
 *       the block from their reveals (node bin/verafy.js seal ...)
 *
 * --route scripted (the default) uses scripts/scripted-llm.mjs and needs no key.
 * --route openrouter uses the live openrouter-<family> routes and needs VERAFY_API_KEY
 * (SWARM_API_KEY is still read when only the old name is set).
 * --probe makes the scripted model try a non-Verafy tool first, to show the lock.
 *
 * DSH state lives in .dsh/ (gitignored): DSH_HOME at .dsh/home, juror keys and
 * votes at .dsh/jurors/<harness>, logs at .dsh/logs. The upstream tree is never
 * written to.
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DSH = join(ROOT, 'upstream', 'deepseek-harness')
const STATE = join(ROOT, '.dsh')
const HOME = join(STATE, 'home')
const PROFILE = join(HOME, 'profiles', 'headless')
const FAMILIES = ['mistral', 'gpt-oss', 'gemma', 'llama', 'qwen']
const PORT = 8790

const argv = process.argv.slice(2)
const cmd = argv[0]
const opt = (name, fallback) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : fallback }
const route = opt('--route', 'scripted')
const ascPath = resolve(opt('--asc', join(ROOT, 'examples', 'market-resolution.json')))
const probe = argv.includes('--probe')
const { ascHash, configPath, apiKeyFromEnv } = await import(join(ROOT, 'packages', 'core', 'src', 'index.js'))
const config = JSON.parse(readFileSync(configPath(ROOT), 'utf8'))
const H = ascHash(JSON.parse(readFileSync(ascPath, 'utf8')))

// Each juror runs with its own empty directory as the workspace, so DSH finds
// no workspace files to read; tsx and the CLI entry are loaded from the DSH tree.
const TSX = pathToFileURL(createRequire(join(DSH, 'package.json')).resolve('tsx/esm')).href
function dsh(args, env, cwd) {
  return spawn(process.execPath, ['--import', TSX, join(DSH, 'apps', 'cli', 'src', 'bin.ts'), ...args], { cwd, env: { ...process.env, DSH_HOME: HOME, TSX_TSCONFIG_PATH: join(DSH, 'tsconfig.json'), ...env }, stdio: 'pipe' })
}

function setup() {
  if (!existsSync(join(DSH, 'node_modules')) || !existsSync(join(DSH, 'packages', 'core', 'tools', 'lib', 'index.js'))) {
    throw new Error('DSH is not built. Run: git submodule update --init --depth 1 && cd upstream/deepseek-harness && CI=true npx -y pnpm@11.28.5 install --frozen-lockfile && CI=true npx -y pnpm@11.28.5 run build')
  }
  const r = spawnSync(process.execPath, [join(ROOT, 'scripts', 'dsh-link.mjs')], { stdio: 'inherit' })
  if (r.status !== 0) throw new Error('dsh-link failed')
  if (!existsSync(join(PROFILE, 'package.json'))) {
    // The first launch of a profile initializes it from the shipped template.
    const init = spawnSync(process.execPath, ['--import', 'tsx/esm', 'apps/cli/src/bin.ts', '--profile', 'headless', '--help'], { cwd: DSH, env: { ...process.env, DSH_HOME: HOME }, stdio: 'ignore' })
    if (init.status !== 0 || !existsSync(join(PROFILE, 'package.json'))) throw new Error('could not initialize the headless profile')
  }
  const at = join(PROFILE, 'node_modules', '@verafyharness', 'dsh-verafy-juror')
  mkdirSync(dirname(at), { recursive: true })
  rmSync(at, { force: true, recursive: true })
  symlinkSync(join(ROOT, 'packages', 'dsh-verafy-juror'), at, 'dir')
  console.log(`mounted @verafyharness/dsh-verafy-juror in ${at.replace(ROOT + '/', '')}`)
}

/** The harness and route a model family's juror runs as. */
function seat(family) {
  const h = config.pool.find(p => p.family === family)
  if (!h) throw new Error(`no ${family} harness in verafy.config.json`)
  const model = route === 'scripted' ? `scripted-${family}` : h.model
  return { ...h, model, route: `${route}-${family}`, out: join(STATE, 'jurors', h.id) }
}

function vote(family) {
  const s = seat(family)
  mkdirSync(join(STATE, 'logs'), { recursive: true })
  const env = {
    VERAFY_ROUTE: s.route, VERAFY_MODEL: s.model, VERAFY_HARNESS_ID: s.id, VERAFY_HARNESS_FAMILY: s.family,
    VERAFY_JUROR_OUT: s.out, VERAFY_SCRIPTED_URL: `http://127.0.0.1:${PORT}/v1`, VERAFY_SCRIPTED_KEY: 'scripted',
  }
  // The overlay reads VERAFY_API_KEY; fill it from SWARM_API_KEY on an older setup.
  const key = apiKeyFromEnv()
  if (key) env.VERAFY_API_KEY = key
  mkdirSync(s.out, { recursive: true, mode: 0o700 })
  // A fresh vote replaces any earlier one for this contract.
  for (const f of ['commit', 'reveal']) rmSync(join(s.out, `${H}.${f}.json`), { force: true })
  const task = `Rule on the contract at ${ascPath}`
  const args = ['--profile', 'headless', '--patch', join(ROOT, 'config', 'cordis.verafy.yml'), task]
  const started = Date.now()
  return new Promise(done => {
    const child = dsh(args, env, s.out)
    let out = ''
    child.stdout.on('data', d => { out += d })
    child.stderr.on('data', d => { out += d })
    child.on('close', code => {
      writeFileSync(join(STATE, 'logs', `${s.id}.log`), out)
      const f = join(s.out, `${H}.commit.json`)
      const commitment = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')).commitment : null
      done({ seat: s, code, ms: Date.now() - started, out: out.trim(), commitment })
    })
  })
}

async function scripted() {
  if (route !== 'scripted') return null
  mkdirSync(join(STATE, 'logs'), { recursive: true })
  const child = spawn(process.execPath, [join(ROOT, 'scripts', 'scripted-llm.mjs'), '--port', String(PORT), '--asc', ascPath, ...(probe ? ['--probe'] : [])], { stdio: ['ignore', 'pipe', 'inherit'] })
  let log = ''
  await new Promise((ok, fail) => {
    child.stdout.on('data', d => { log += d; if (log.includes('"ready"')) ok() })
    child.on('exit', code => fail(new Error(`scripted server exited ${code}`)))
  })
  return { stop: () => { child.kill(); writeFileSync(join(STATE, 'logs', 'scripted-llm.jsonl'), log) }, log: () => log }
}

function report(r) {
  const c = r.commitment
  console.log(`${r.seat.id.padEnd(15)} ${r.seat.route.padEnd(22)} ${r.seat.model.padEnd(28)} exit ${r.code}  ${(r.ms / 1000).toFixed(1)}s  ${c ? `commitment ${c}` : 'no commitment'}`)
  if (r.out) console.log(r.out.split('\n').map(l => `    dsh: ${l}`).join('\n'))
  return c
}

async function main() {
  if (cmd === 'setup') return setup()
  if (!['vote', 'jury'].includes(cmd)) {
    console.log('usage: dsh-juror.mjs setup | vote --family <family> [--route scripted|openrouter] [--asc file] [--probe] | jury [--route ...] [--asc file] [--probe]')
    process.exitCode = 2
    return
  }
  if (route === 'openrouter' && !apiKeyFromEnv()) throw new Error('--route openrouter needs VERAFY_API_KEY in the environment')
  const families = cmd === 'vote' ? [opt('--family', 'mistral')] : FAMILIES
  const server = await scripted()
  try {
    const results = await Promise.all(families.map(vote))
    const commits = []
    for (const r of results) commits.push(report(r))
    if (cmd === 'vote' || commits.some(c => !c)) { process.exitCode = commits.every(Boolean) ? 0 : 1; return }
    const dirs = results.map(r => r.seat.out)
    console.log(`\nnode bin/verafy.js seal ${ascPath.replace(ROOT + '/', '')} ${dirs.map(d => d.replace(ROOT + '/', '')).join(' ')}`)
    const sealed = spawnSync(process.execPath, [join(ROOT, 'bin', 'verafy.js'), 'seal', ascPath, ...dirs], { cwd: ROOT, stdio: 'inherit' })
    process.exitCode = sealed.status
  } finally {
    server?.stop()
  }
}

main().catch(err => { console.error(err.message); process.exitCode = 1 })
