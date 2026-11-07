#!/usr/bin/env node
/**
 * verafy: run Actually Smart Contracts through a network of harnessed validators.
 *
 *   verafy run <asc.json> [--live] [--json]   rule on a contract and seal a block
 *   verafy validate <asc.json>                check a contract
 *   verafy pin <asc.json>                     write SHA-256 pins for every context entry
 *   verafy seal <asc.json> <juror-dir...>     seal a block from reveals that separate
 *                                             harness processes wrote (DSH jurors)
 *   verafy chain                              print the local chain
 *   verafy doctor [--live]                    check Node, the pool, and each model endpoint
 *   verafy read solana <slot|genesis|account <pubkey>> [--config file]
 *                                             read the source chain across the light
 *                                             client's endpoints (read only, no keys)
 *   verafy confirm solana <signature> [--config file]
 *                                             confirm a transaction landed, through the outbox
 *   verafy harness commit-model <harness-id> <commitment> [--config file]
 *                                             publish a prover's model commitment (64 hex, such
 *                                             as FlashProve's commitment ID) on the harness card;
 *                                             L2 proofs are checked against it
 *
 * The light client is off unless the config has a `lightclient` block (see
 * config/lightclient.devnet.json and packages/lightclient). When it is on,
 * `run` checks the contract's escrow (payment.source) before the jury is drawn,
 * and a disagreement between sources pauses the contract and records why in
 * .verafy/pauses.jsonl.
 *
 * Mock mode (default) uses examples/mock-answers.json. --live calls real models
 * through the OpenAI-compatible endpoint in verafy.config.json (or, on a setup
 * from before the rename, swarm.config.json). The key is read from
 * VERAFY_API_KEY, else SWARM_API_KEY. The chain is written to .verafy/chain.json;
 * while .verafy/ is empty, an existing .swarm/chain.json is read as the parent.
 * `swarm` is kept as an alias for this command.
 */
import { readFile, writeFile, mkdir, readdir, appendFile } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  Harness, drawJuryFor, rule, ruleFromReveals, seal, validate, pin, ascHash, short,
  JuryScheduler, scheduleRecord, beaconChain, beaconEntry, slashRuling, DEFAULT_SLASHING,
  mockProvider, openaiProvider, createRouter, configPath, chainPaths, envValue,
  fundingCheck, Outbox, PauseLog,
} from '../packages/core/src/index.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CHAIN = chainPaths(ROOT)
const args = process.argv.slice(2)
const flag = f => args.includes(f)
const VALUE_FLAGS = ['--config', '--env', '--plans', '--chain', '--rpc', '--program', '--payer', '--target', '--family', '--model', '--kind', '--nodes', '--id', '--public-url', '--region', '--plan', '--ref', '--port', '--misbehave']
const positional = args.filter((a, i) => !a.startsWith('--') && !VALUE_FLAGS.includes(args[i - 1]))
const value = f => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined }
const [cmd, file, ...rest] = positional

const c = process.stdout.isTTY && !flag('--json')
  ? { b: s => `\x1b[1m${s}\x1b[0m`, d: s => `\x1b[2m${s}\x1b[0m`, g: s => `\x1b[32m${s}\x1b[0m`, y: s => `\x1b[33m${s}\x1b[0m`, a: s => `\x1b[34m${s}\x1b[0m` }
  : { b: s => s, d: s => s, g: s => s, y: s => s, a: s => s }

async function readJson(p) { return JSON.parse(await readFile(resolve(p), 'utf8')) }

/**
 * `verafy harness commit-model <id> <commitment>`: write the model commitment
 * onto one pool entry, so the harness's card carries it. It never reads a key.
 */
async function commitModel(id, commitment) {
  const i = args.indexOf('--config')
  const path = i >= 0 ? resolve(args[i + 1]) : configPath(ROOT)
  if (!id || !/^[0-9a-f]{64}$/.test(String(commitment))) {
    console.log('usage: verafy harness commit-model <harness-id> <commitment: 64 lowercase hex> [--config file]')
    process.exitCode = 2
    return
  }
  const config = await readJson(path)
  const entry = config.pool?.find(h => h.id === id)
  if (!entry) { console.log(`no harness "${id}" in ${path}`); process.exitCode = 1; return }
  const before = entry.modelCommitment ?? null
  entry.modelCommitment = commitment
  await writeFile(path, JSON.stringify(config, null, 2) + '\n')
  console.log(`${id}: model commitment ${before === commitment ? 'unchanged' : before ? `changed from ${short(before)} to` : 'set to'} ${commitment}`)
  console.log(`${path} updated. Restart the harness so its card carries the commitment; nodes check L2 proofs against it.`)
}

async function loadChain() {
  try { return await readJson(CHAIN.read) } catch { return [] }
}

/**
 * The live provider for one pool entry. An entry may override the default
 * endpoint, for example to point at a local vLLM server.
 * @param {object} config - the harness config.
 * @param {object} h - one pool entry.
 * @returns {object} an OpenAI-compatible provider.
 */
function providerFor(config, h) {
  const baseURL = h.baseURL ?? config.provider.baseURL
  // envValue reads VERAFY_* names and falls back to the SWARM_* names they replaced.
  const apiKey = envValue(h.apiKeyEnv ?? config.provider.apiKeyEnv ?? 'VERAFY_API_KEY')
  // Each harness retries 429, 5xx and network errors on its own, with backoff;
  // set provider.retry (or a pool entry's retry) to tune it, or false to disable.
  const retry = h.retry ?? config.provider.retry ?? {}
  return openaiProvider({ baseURL, apiKey, retry })
}

async function loadConfig() {
  const i = args.indexOf('--config')
  return readJson(i >= 0 ? args[i + 1] : configPath(ROOT))
}

async function doctor() {
  const config = await loadConfig()
  const major = Number(process.versions.node.split('.')[0])
  console.log(`${major >= 22 ? 'ok  ' : 'FAIL'} node ${process.versions.node} (need 22 or later)`)
  const families = new Set(config.pool.map(h => h.family))
  console.log(`ok   pool: ${config.pool.length} harnesses across ${families.size} families`)
  if (!flag('--live')) { console.log('skip model checks (add --live to call each model once)'); return }
  for (const h of config.pool) {
    const t = Date.now()
    try {
      const out = await providerFor(config, h).complete({ model: h.model, system: 'Reply with JSON only.', user: 'Return {"ok": true}.' })
      console.log(`ok   ${h.id.padEnd(16)} ${h.model}  ${Date.now() - t} ms  ${out.slice(0, 40).replace(/\s+/g, ' ')}`)
    } catch (err) {
      console.log(`FAIL ${h.id.padEnd(16)} ${h.model}  ${err.message.slice(0, 120)}`)
      process.exitCode = 1
    }
  }
}

/** The light client from config, loaded only when the config has a `lightclient` block. */
async function lightclientFor(config) {
  if (!config.lightclient) return null
  const { fromConfig } = await import('../packages/lightclient/index.js')
  return fromConfig(config.lightclient)
}

function printRead(r) {
  console.log(`${r.status === 'agreed' ? 'agreed ' : 'UNKNOWN'} ${r.chain} ${r.method} at ${r.commitment}, policy ${r.policy}, ${r.attempts} attempt(s): ${r.reason}`)
  for (const s of r.sources) console.log(`  ${s.verdict.padEnd(7)} ${s.id.padEnd(20)} ${s.operator.padEnd(12)} ${s.origin.padEnd(40)} slot ${s.slot ?? '-'}${s.error ? `  ${s.error}` : ''}`)
  if (r.status === 'agreed') console.log(`  value ${JSON.stringify(r.value)}${r.slot != null ? `  (agreed slot ${r.slot})` : ''}`)
}

async function readCommand(confirm) {
  const lc = await lightclientFor(await loadConfig())
  if (!lc?.solana || file !== 'solana') {
    console.log('usage: verafy read solana <slot|genesis|account <pubkey>> --config <file with a lightclient block> | verafy confirm solana <signature> --config <file>')
    process.exitCode = 2
    return
  }
  if (confirm) {
    const out = new Outbox({ sourceChain: lc.checker })
    const c = await out.confirm(out.record({ asc: 'cli', ruling: 'cli', trigger: { type: 'call', chain: 'solana' }, landed: { chain: 'solana', signature: rest[0] } }))
    printRead(c.read)
    console.log(`outbox: ${c.status}`)
    process.exitCode = c.status === 'confirmed' ? 0 : 1
    return
  }
  const [what, arg] = rest
  const r = what === 'slot' ? await lc.solana.slot() : what === 'genesis' ? await lc.solana.genesisHash() : what === 'account' && arg ? await lc.solana.account(arg) : null
  if (!r) { console.log('read what? slot, genesis, or account <pubkey>'); process.exitCode = 2; return }
  printRead(r)
  process.exitCode = r.status === 'agreed' ? 0 : 1
}

/**
 * `verafy discover --registry <program> [--rpc url] [--json]`: list every
 * active harness in the on-chain registry (VIP-0012).
 */
async function discoverCommand() {
  const { rpc, discoverHarnesses } = await import('../packages/solana/src/index.js')
  const registry = value('--registry')
  if (!registry) { console.error('need --registry <program address>'); process.exitCode = 2; return }
  const cards = await discoverHarnesses(rpc(value('--rpc') ?? 'https://api.devnet.solana.com'), registry)
  if (flag('--json')) { console.log(JSON.stringify(cards, null, 2)); return }
  if (!cards.length) console.log('no active harnesses registered')
  for (const c of cards) console.log(`${c.id}  ${c.model}  bond ${c.bond} SOL  ${c.pricePerSeat} lamports a seat  ${c.endpoint}${c.attestationHash ? '  attested' : ''}`)
}

/**
 * `verafy harness register --registry <program> --identity <identity.pem> --operator <keypair.json>
 *   --endpoint <url> --family <family> --model <model> [--price lamports] [--bond sol] [--rpc url]`:
 * register this harness on chain so juries can find and pay it. The harness
 * key signs, proving the operator controls the key that votes.
 */
async function registerCommand() {
  const { rpc: rpcClient, keypair, identitySigner, buildTx, registryIx, harnessAccount, HARNESS_SIZE } = await import('../packages/solana/src/index.js')
  const { importIdentity } = await import('../packages/core/src/index.js')
  const need = ['--registry', '--identity', '--operator', '--endpoint', '--family', '--model'].filter(f => !value(f))
  if (need.length) { console.error(`need ${need.join(', ')}`); process.exitCode = 2; return }
  const rpc = rpcClient(value('--rpc') ?? 'https://api.devnet.solana.com')
  const harness = identitySigner(importIdentity(await readFile(resolve(value('--identity')), 'utf8')))
  const operator = keypair(await readJson(value('--operator')))
  const lamports = (await rpc.rent(HARNESS_SIZE)) + Math.round(Number(value('--bond') ?? 0) * 1e9)
  const programId = value('--registry')
  const sig = await rpc.send(buildTx([registryIx.register({ programId, harnessKey: harness.address, operator: operator.address, lamports, family: value('--family'), model: value('--model'), endpoint: value('--endpoint'), price: Number(value('--price') ?? 0) })], operator, [operator, harness], await rpc.blockhash()))
  console.log(`registered ${harness.address} at ${harnessAccount(harness.address, programId).address}\n  ${sig}`)
}

/**
 * `verafy harness serve [--env file] [--config file] [--mock]`: run the
 * harness daemon. Settings come from VERAFY_* variables (see
 * packages/deploy/src/config.js), an env file, and an optional JSON config
 * with a `harness` block; variables win.
 */
async function serveCommand() {
  const { serveConfig, startServe, parseEnvFile } = await import('../packages/deploy/src/index.js')
  const envPath = value('--env')
  const env = { ...(envPath ? parseEnvFile(await readFile(resolve(envPath.replace(/^~(?=\/)/, process.env.HOME ?? '')), 'utf8')) : {}), ...process.env }
  if (flag('--mock')) env.VERAFY_MOCK = '1'
  const cfgPath = value('--config')
  const file = cfgPath ? await readJson(cfgPath) : {}
  const config = serveConfig(file, env)
  try {
    const daemon = await startServe(config, { env })
    const stop = async () => { await daemon.stop(); process.exit(0) }
    process.on('SIGTERM', stop)
    process.on('SIGINT', stop)
  } catch (err) {
    console.error(`cannot start the harness:\n${err.message.split('\n').map(l => `  - ${l}`).join('\n')}`)
    process.exitCode = 2
  }
}

/**
 * `verafy packed <asc.json...> [--plans file] [--live]`: run contracts through
 * proof packing end to end (atomize, fidelity panel, pack, prove, verify,
 * assemble). Scripted by default (examples/packed/answers.json answers the
 * packed slots, the panel rules FAITHFUL). With --live, the first pool model
 * atomizes contracts without a plan and three families' models sit the fidelity
 * panel and answer the packed requests. The prover is the mock prover either
 * way: its proofs bind the answer to the request but are not proofs of inference.
 */
async function packedCommand() {
  const { packedBlock } = await import('../packages/pack/src/index.js')
  const { mockProver, mockVerifier } = await import('../packages/prove/src/index.js')
  const files = [file, ...rest].filter(Boolean)
  if (!files.length) { console.log('usage: verafy packed <asc.json...> [--plans file] [--live] [--json]'); process.exitCode = 2; return }
  const contracts = await Promise.all(files.map(f => readJson(f)))
  const plansPath = value('--plans')
  const plans = plansPath ? await readJson(plansPath) : {}
  const config = await loadConfig()
  let panel, complete, atomizer
  if (flag('--live')) {
    const byLab = [...new Map(config.pool.map(h => [h.family, h])).values()].slice(0, 3)
    panel = byLab.map(h => ({ family: h.family, model: h.model, provider: providerFor(config, h) }))
    const top = config.pool[0]
    atomizer = { provider: providerFor(config, top), model: top.model }
    const prov = providerFor(config, config.pool.find(h => h.family === 'llama') ?? top)
    const model = (config.pool.find(h => h.family === 'llama') ?? top).model
    complete = req => prov.complete({ ...req, model })
  } else {
    const truth = await readJson(join(ROOT, 'examples/packed/answers.json'))
    panel = ['mistral', 'gpt-oss', 'gemma'].map(family => ({ family, model: 'scripted', provider: { complete: async () => JSON.stringify({ answer: 'FAITHFUL', confidence: 0.9, reasoning: 'scripted', sources: ['c0'] }) } }))
    complete = async ({ user }) => [...user.matchAll(/\[S(\d+)\] Q: (.+)/g)].map(([, n, q]) => `S${n}: ${truth[q] ?? 'UNKNOWN'}`).join('\n')
  }
  const r = await packedBlock(contracts, { plans, atomizer, panel, prover: mockProver({ model: 'llama-4-maverick', complete }), verifier: mockVerifier(), seed: (await loadChain()).at(-1)?.hash ?? 'genesis' })
  if (flag('--json')) { console.log(JSON.stringify(r, null, 2)); return }
  const s = r.stats
  console.log(`${s.contractsIn} contracts, ${s.atoms} atoms, ${s.uniqueAtoms} unique after dedupe, ${s.requests} proven request(s) at ${Math.round(s.fill * 100)}% fill (mock prover: not a proof of inference)`)
  for (const [id, x] of Object.entries(r.results)) console.log(x.packed ? `${c.g('packed ')} ${id}: ${x.outcome}  plan ${short(x.planHash)}  panel ${Math.round(x.fidelity.agree * 100)}%  proofs ${x.proofs.map(p => `${short(p.proofHash)}${p.verified ? ' verified' : ' FAILED'}`).join(', ')}` : `${c.y('fallback')} ${id}: ${x.stage}: ${x.reason}`)
}

/**
 * `verafy testnet up [--live] [--solana] [--rpc url --program id --payer file] [--keep] [asc.json...]`
 * `verafy testnet down`
 * A whole testnet on this machine: one harness daemon per family, a local
 * coordinator that draws juries, runs commit and reveal over HTTP and seals
 * blocks, and optionally settles each ruling on Solana. Scripted answers by
 * default. `--chain <dir>` runs the verafyChain devnet instead.
 */
async function testnetCommand() {
  const { testnetUp, testnetDown } = await import('../packages/deploy/src/index.js')
  if (file === 'down') { console.log(`stopped ${testnetDown()} harness process(es)`); return }
  if (file !== 'up') { console.log('usage: verafy testnet up [--live] [--solana] [--rpc url] [--program id] [--payer file] [--keep] [--misbehave id:fault,...] [--chain dir] [asc.json...] | verafy testnet down'); process.exitCode = 2; return }
  const chainDir = value('--chain')
  if (chainDir) {
    const { spawnSync } = await import('node:child_process')
    process.exitCode = spawnSync(process.execPath, ['scripts/devnet.mjs'], { cwd: resolve(chainDir), stdio: 'inherit' }).status ?? 1
    return
  }
  const solana = flag('--solana') || value('--rpc') ? { rpc: value('--rpc'), program: value('--program'), payer: value('--payer') } : null
  // --misbehave h-llama-1:no-reveal[,h-qwen-1:no-commit]: scripted testnets only, to watch slashing.
  const misbehave = Object.fromEntries((value('--misbehave') ?? '').split(',').filter(Boolean).map(x => x.split(':')))
  const r = await testnetUp({ live: flag('--live'), contracts: rest.length ? rest.map(f => resolve(f)) : undefined, solana, keep: flag('--keep'), misbehave })
  if (flag('--keep')) { console.log('harnesses keep running; stop them with  verafy testnet down'); await new Promise(() => {}) }
  return r
}

/** `verafy up [--ui]`: launch a harness locally, in Docker or in the cloud. */
async function upCommand() {
  const { upInteractive, upUi } = await import('../packages/deploy/src/index.js')
  if (flag('--ui')) return upUi({ open: !flag('--no-open') })
  const nodes = value('--nodes')
  await upInteractive({
    target: value('--target'), family: value('--family'), model: value('--model'), kind: value('--kind'), id: value('--id'),
    nodes: nodes !== undefined ? nodes.split(',').filter(Boolean) : undefined, publicUrl: value('--public-url'),
    region: value('--region'), plan: value('--plan'), ref: value('--ref'), mock: flag('--mock'), yes: flag('--yes'),
  })
}

async function main() {
  if (cmd === 'doctor') return doctor()
  if (cmd === 'read') return readCommand(false)
  if (cmd === 'confirm') return readCommand(true)
  if (cmd === 'validate') {
    const problems = validate(await readJson(file))
    console.log(problems.length ? problems.map(p => `- ${p}`).join('\n') : 'valid')
    process.exitCode = problems.length ? 1 : 0
    return
  }
  if (cmd === 'pin') {
    const pinned = pin(await readJson(file))
    await writeFile(resolve(file), JSON.stringify(pinned, null, 2) + '\n')
    console.log(`pinned ${pinned.context.length} context entries; asc ${short(ascHash(pinned))}`)
    return
  }
  if (cmd === 'chain') {
    for (const b of await loadChain()) console.log(`block ${b.height}  ${short(b.hash)}  parent ${short(b.parent)}  ${b.rulings.map(r => `${r.asc}: ${r.passed ? r.exit : 'below bar'}`).join(', ')}`)
    return
  }
  if (cmd === 'seal' && file && rest.length) return sealFromJurors(await readJson(file), rest)
  if (cmd === 'harness' && file === 'commit-model') return commitModel(rest[0], rest[1])
  if (cmd === 'harness' && file === 'serve') return serveCommand()
  if (cmd === 'harness' && file === 'register') return registerCommand()
  if (cmd === 'discover') return discoverCommand()
  if (cmd === 'up') return upCommand()
  if (cmd === 'packed') return packedCommand()
  if (cmd === 'testnet') return testnetCommand()
  if (cmd !== 'run' || !file) {
    console.log('usage: verafy up [--ui] | verafy harness serve [--env file] [--mock] | verafy harness register --registry <program> --identity <pem> --operator <keypair> --endpoint <url> --family <f> --model <m> | verafy discover --registry <program> [--rpc url] | verafy run <asc.json> [--live] [--json] [--config file] | verafy seal <asc.json> <juror-dir...> | verafy doctor [--live] [--config file] | verafy validate <asc.json> | verafy pin <asc.json> | verafy chain | verafy read solana <slot|genesis|account <pubkey>> --config file | verafy confirm solana <signature> --config file')
    process.exitCode = 2
    return
  }

  const asc = await readJson(file)
  const config = await loadConfig()
  const lc = await lightclientFor(config)
  if (lc) {
    const pauses = new PauseLog()
    const funding = await fundingCheck(asc, { sourceChain: lc.checker, pauses })
    if (funding.read?.method) printRead(funding.read)
    if (pauses.entries.length) {
      await mkdir(CHAIN.dir, { recursive: true })
      await appendFile(join(CHAIN.dir, 'pauses.jsonl'), pauses.entries.map(e => JSON.stringify(e)).join('\n') + '\n')
    }
    if (!funding.ok) {
      console.log(`${funding.paused ? 'PAUSED' : 'REFUSED'} ${asc.id}: ${funding.problems.join('; ')}`)
      process.exitCode = 3
      return
    }
    if (!flag('--json')) console.log(c.d(`light client: ${funding.checked ? 'escrow funded' : funding.reason}`))
  }
  const script = flag('--live') ? null : await readJson(join(ROOT, 'examples', 'mock-answers.json'))
  const pool = config.pool.map(h => new Harness({ ...h, provider: flag('--live') ? providerFor(config, h) : mockProvider(script, asc.id, h.family) }))
  const chain = await loadChain()
  const parent = chain.at(-1) ?? null
  // The jury seed is this block's beacon value (VIP-0002): the local node's hash chain, fixed before any contract.
  const beaconFile = join(CHAIN.dir, 'beacon.json')
  const saved = existsSync(beaconFile) ? JSON.parse(readFileSync(beaconFile, 'utf8')) : null
  const bchain = beaconChain(saved ? { secret: saved.secret, length: saved.length } : {})
  const revealed = (saved?.revealed ?? 0) + 1
  const beacon = beaconEntry(parent, { sealer: 'node-local', reveal: bchain.reveal(revealed) }, (parent?.height ?? 0) + 1)
  const { jury, schedule } = new JuryScheduler().draw(asc, pool, { seed: beacon.value, height: (parent?.height ?? 0) + 1 })
  const sealer = pool.find(h => !jury.includes(h)) ?? jury[0]
  const log = flag('--json') ? () => {} : event => print(event, asc)

  if (!flag('--json')) {
    console.log(c.b(`\n${asc.title}`))
    console.log(c.d(`mode ${flag('--live') ? 'live models' : 'mock answers'} · escrow ${asc.payment.escrow} ${asc.payment.currency} · bar ${pct(asc.payment.bar)} · jury ${asc.payment.jury.size} across ${asc.payment.jury.minFamilies}+ families`))
  }
  const ruling = await rule(asc, jury, sealer, log, { seed: beacon.value, schedule: scheduleRecord(schedule) })
  const slashings = slashRuling(ruling, DEFAULT_SLASHING, { height: (parent?.height ?? 0) + 1 }).filter(x => x.amount > 0 || x.forgiven)
  const block = seal(parent, [ruling], sealer, { beacon, slashings })
  const router = createRouter(config.payments)
  const payouts = ruling.passed ? await router.settle(ruling, asc, config.payments?.book) : []
  await mkdir(CHAIN.dir, { recursive: true })
  await writeFile(CHAIN.write, JSON.stringify([...chain, block], null, 2))
  await writeFile(beaconFile, JSON.stringify({ secret: bchain.secret, length: bchain.length, anchor: bchain.anchor, revealed }), { mode: 0o600 })
  if (flag('--json')) { console.log(JSON.stringify(block, null, 2)); return }
  console.log(c.b('\nSEAL'))
  console.log(`  block ${block.height}  ${short(block.hash)}  parent ${short(block.parent)}  sealed by ${block.sealer}`)
  console.log(c.d(`  rulings root ${short(block.rulingsRoot)} · jury seed ${short(beacon.value)} from the beacon · written to .verafy/chain.json`))
  for (const x of slashings) console.log(`  ${c.a('slashed')} ${x.harness}: ${x.fault}, ${x.forgiven ? 'forgiven (first in the window)' : `${x.amount} taken from its bond (${+(x.rate * 100).toFixed(3)}%)`}`)
  if (ruling.held) console.log(c.d(`  payouts held for ${ruling.held.window} blocks (challenge window)`))
  console.log(c.d(`  payment router ${router.name}: ${payouts.length} payouts in ${asc.payment.currency}${asc.payment.chain ? ` on ${asc.payment.chain}` : ''}${router.name === 'ledger' ? ` recorded to ${config.payments?.file ?? '.verafy/payouts.jsonl'}` : ''}\n`))
}

/**
 * Seal a block from commitments and reveals written by separate harness
 * processes. Each juror directory holds `<ascHash>.commit.json` and
 * `<ascHash>.reveal.json`. The sealer is a pool harness from verafy.config.json
 * that did not sit on the jury.
 */
async function sealFromJurors(asc, dirs) {
  const h = ascHash(asc)
  const entries = []
  for (const d of dirs) {
    const files = await readdir(resolve(d))
    if (!files.includes(`${h}.commit.json`)) { console.error(`${d}: no commitment for contract ${short(h)}`); continue }
    const c = await readJson(join(d, `${h}.commit.json`))
    const reveal = files.includes(`${h}.reveal.json`) ? await readJson(join(d, `${h}.reveal.json`)) : null
    entries.push({ card: c.card, commit: c, reveal })
  }
  const config = await readJson(configPath(ROOT))
  const sealer = new Harness({ ...config.pool.find(p => !entries.some(e => e.card.id === p.id)) ?? config.pool[0], provider: null })
  const chain = await loadChain()
  const parent = chain.at(-1) ?? null
  if (!flag('--json')) {
    console.log(c.b(`\n${asc.title}`))
    console.log(c.d(`mode reveals from ${entries.length} harness processes · escrow ${asc.payment.escrow} ${asc.payment.currency} · bar ${pct(asc.payment.bar)} · jury ${asc.payment.jury.size} across ${asc.payment.jury.minFamilies}+ families`))
  }
  const ruling = ruleFromReveals(asc, entries, sealer.id, parent?.hash ?? 'genesis', flag('--json') ? () => {} : event => print(event, asc))
  const block = seal(parent, [ruling], sealer)
  const router = createRouter(config.payments)
  const payouts = ruling.passed ? await router.settle(ruling, asc, config.payments?.book) : []
  await mkdir(CHAIN.dir, { recursive: true })
  await writeFile(CHAIN.write, JSON.stringify([...chain, block], null, 2))
  await writeFile(beaconFile, JSON.stringify({ secret: bchain.secret, length: bchain.length, anchor: bchain.anchor, revealed }), { mode: 0o600 })
  if (flag('--json')) { console.log(JSON.stringify(block, null, 2)); return }
  console.log(c.b('\nSEAL'))
  console.log(`  block ${block.height}  ${short(block.hash)}  parent ${short(block.parent)}  sealed by ${block.sealer}`)
  console.log(c.d(`  rulings root ${short(block.rulingsRoot)} · jury seed ${short(beacon.value)} from the beacon · written to .verafy/chain.json`))
  for (const x of slashings) console.log(`  ${c.a('slashed')} ${x.harness}: ${x.fault}, ${x.forgiven ? 'forgiven (first in the window)' : `${x.amount} taken from its bond (${+(x.rate * 100).toFixed(3)}%)`}`)
  if (ruling.held) console.log(c.d(`  payouts held for ${ruling.held.window} blocks (challenge window)`))
  console.log(c.d(`  payment router ${router.name}: ${payouts.length} payouts in ${asc.payment.currency}${asc.payment.chain ? ` on ${asc.payment.chain}` : ''}${router.name === 'ledger' ? ` recorded to ${config.payments?.file ?? '.verafy/payouts.jsonl'}` : ''}\n`))
}

function print(e, asc) {
  if (e.phase === 'propose') {
    console.log(c.b('\nPROPOSE'))
    console.log(`  asc ${short(e.ascHash)} · ${asc.context.length} context entries pinned`)
    for (const j of e.jury) console.log(`  ${c.a('harness')} ${j.id.padEnd(15)} ${j.family.padEnd(10)} ${c.d(j.model)}`)
  }
  if (e.phase === 'commit') {
    console.log(c.b('\nCOMMIT'))
    for (const x of e.commitments) console.log(`  ${x.harness.padEnd(15)} ${c.d('commitment')} ${short(x.commitment)}`)
  }
  if (e.phase === 'reveal-failed') console.log(c.y(`  ${e.harness} reveal rejected: it does not match the commitment or signature`))
  if (e.phase === 'commit-failed') console.log(c.y(`  ${e.harness} dropped: ${e.error}`))
  if (e.phase === 'reveal') {
    console.log(c.b('\nREVEAL'))
    for (const v of e.votes) console.log(`  ${v.harness.padEnd(15)} ${String(v.answer).padEnd(12)} ${c.d(`confidence ${v.confidence}`)}`)
  }
  if (e.phase === 'rule') {
    const r = e.ruling
    console.log(c.b('\nRULE'))
    console.log(`  answer ${c.b(String(r.answer))} · agreement ${pct(r.agreement)} against a bar of ${pct(r.bar)} · ${r.passed ? c.g('final') : c.y('below the bar')}`)
    for (const d of r.dissent) console.log(c.d(`  dissent ${d.harness}: ${d.answer}. ${d.reasoning}`))
    console.log(`  exit ${r.exit} → ${r.effect.type}${r.effect.target ? ` ${r.effect.target}(${(r.effect.args ?? []).join(', ')})` : ''}`)
    console.log(c.b('\nPAY'))
    for (const d of r.diff) console.log(`  ${d.account.padEnd(36)} ${(d.delta >= 0 ? '+' : '') + d.delta.toFixed(4)}`)
    for (const t of r.triggers) console.log(c.a(`  trigger ${t.type}${t.chain ? ` on ${t.chain}: ${t.target}(${t.args.join(', ')})` : `: jury of ${t.jurySize}`}`))
  }
}

function pct(x) { return `${Math.round(x * 100)}%` }

main().catch(err => { console.error(err.message); process.exitCode = 1 })
