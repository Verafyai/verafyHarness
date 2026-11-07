/**
 * The swarm to verafy rename keeps everything recorded before it working:
 * both contract kinds validate, an old pinned contract keeps its hash, both
 * trigger kinds verify, and every config, state-folder and env fallback works.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  Harness, mockProvider, drawJuryFor, rule, seal, blockHeader, sha256, verifyRuling, validate, pin, ascHash,
  triggerMessage, signTrigger, verifyTrigger, TRIGGER_KIND, LEGACY_TRIGGER_KIND, ASC_KIND, LEGACY_ASC_KIND,
  configPath, chainPaths, envValue, apiKeyFromEnv, keyblockPassphraseFromEnv, Keyblock,
} from '../src/index.js'

const ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const read = p => JSON.parse(readFileSync(join(ROOT, p), 'utf8'))
const mock = read('examples/mock-answers.json')
const config = read('verafy.config.json')
const poolFor = asc => config.pool.map(h => new Harness({ ...h, provider: mockProvider(mock, asc.id, h.family) }))
const tmp = () => mkdtempSync(join(tmpdir(), 'verafy-rename-'))

// ---- Contract kinds ---------------------------------------------------------

test('rename: verafy.asc/1 and swarm.asc/0 both validate; any other kind does not', () => {
  const asc = read('examples/market-resolution.json')
  assert.equal(ASC_KIND, 'verafy.asc/1')
  assert.equal(asc.kind, ASC_KIND, 'new examples are written as verafy.asc/1')
  assert.deepEqual(validate(asc), [])
  assert.deepEqual(validate({ ...asc, kind: LEGACY_ASC_KIND }), [])
  assert.match(validate({ ...asc, kind: 'other.asc/9' }).join('\n'), /kind must be "verafy.asc\/1"/)
  for (const f of readdirSync(join(ROOT, 'examples')).filter(f => f.endsWith('.json') && f !== 'mock-answers.json')) {
    assert.equal(read(`examples/${f}`).kind, ASC_KIND, `${f} is verafy.asc/1`)
  }
})

test('rename: an old pinned swarm.asc/0 contract keeps its hash, and the recorded live block still checks', () => {
  const old = JSON.parse(readFileSync(new URL('./fixtures/market-resolution.swarm-asc-0.json', import.meta.url), 'utf8'))
  assert.equal(old.kind, 'swarm.asc/0')
  assert.deepEqual(validate(old), [])
  const recorded = read('results/dsh-jury-live-2026-11-06.chain.json')
  assert.equal(ascHash(old), 'b5f49f8fd98b80a8d0ea20a18b7695c4b14c60ff2c657a1e347355d4ce0ae61c')
  assert.equal(recorded[0].rulings[0].ascHash, ascHash(old), 'the live ruling names the same contract hash')
  assert.equal(sha256(blockHeader(recorded[0])), recorded[0].hash, 'the recorded block header still hashes to its hash')
})

test('rename: pin writes verafy.asc/1; a legacy contract that is not re-pinned keeps its kind and hash', () => {
  const asc = read('examples/market-resolution.json')
  const legacy = { ...asc, kind: LEGACY_ASC_KIND }
  const repinned = pin(legacy)
  assert.equal(repinned.kind, ASC_KIND)
  assert.notEqual(ascHash(repinned), ascHash(legacy), 're-pinning is authoring a new contract')
  assert.equal(ascHash(repinned), ascHash(asc))
  assert.equal(legacy.kind, LEGACY_ASC_KIND, 'pin does not touch its input')
})

test('rename: a swarm.asc/0 contract still rules, seals and verifies', async () => {
  const asc = { ...read('examples/market-resolution.json'), kind: LEGACY_ASC_KIND }
  const pool = poolFor(asc)
  const jury = drawJuryFor(asc, pool, 'genesis')
  const r = await rule(asc, jury, pool.find(h => !jury.includes(h)), () => {}, { seed: 'genesis' })
  assert.equal(r.passed, true)
  assert.equal(r.ascHash, ascHash(asc))
  assert.equal(verifyRuling(asc, r, { pool: pool.map(h => h.card), seed: 'genesis' }).ok, true)
})

// ---- Trigger kinds ----------------------------------------------------------

test('rename: new triggers are signed as verafy.trigger/1, and swarm.trigger/0 messages still verify', async () => {
  const asc = read('examples/market-resolution.json')
  const pool = poolFor(asc)
  const jury = drawJuryFor(asc, pool, 'genesis')
  const r = await rule(asc, jury, pool.find(h => !jury.includes(h)))
  const block = seal(null, [r], pool[0], { time: '2026-11-06T12:00:00Z' })
  const fresh = triggerMessage(r, r.triggers[0], { block: block.hash })
  assert.equal(TRIGGER_KIND, 'verafy.trigger/1')
  assert.equal(fresh.kind, 'verafy.trigger/1')
  assert.equal(verifyTrigger(fresh, jury.map(j => signTrigger(j, fresh)), r, { asc }).ok, true)

  const old = { ...fresh, kind: LEGACY_TRIGGER_KIND }
  const oldSigs = jury.map(j => signTrigger(j, old))
  assert.equal(verifyTrigger(old, oldSigs, r, { asc }).ok, true)
  // A signature binds the kind: an old signature does not release the new message.
  assert.match(verifyTrigger(fresh, oldSigs, r, { asc }).problems.join('\n'), /0 valid signatures/)

  const other = { ...fresh, kind: 'other.trigger/9' }
  assert.throws(() => signTrigger(jury[0], other), /not a verafy.trigger\/1 message/)
  assert.match(verifyTrigger(other, [], r, { asc }).problems[0], /not a verafy.trigger\/1 or swarm.trigger\/0 message/)
})

// ---- Config, state folder, env ----------------------------------------------

test('rename: verafy.config.json is read first, then swarm.config.json', () => {
  const d = tmp()
  assert.equal(configPath(d), join(d, 'verafy.config.json'), 'neither exists: the new name')
  writeFileSync(join(d, 'swarm.config.json'), '{}')
  assert.equal(configPath(d), join(d, 'swarm.config.json'), 'only the old file: fall back to it')
  writeFileSync(join(d, 'verafy.config.json'), '{}')
  assert.equal(configPath(d), join(d, 'verafy.config.json'), 'both: the new file wins')
})

test('rename: the chain is read from .swarm/chain.json while .verafy/ is empty, and always written to .verafy/', () => {
  const d = tmp()
  const fresh = join(d, '.verafy', 'chain.json')
  assert.deepEqual(chainPaths(d), { dir: join(d, '.verafy'), read: fresh, write: fresh })
  mkdirSync(join(d, '.swarm'))
  writeFileSync(join(d, '.swarm', 'chain.json'), '[]')
  assert.equal(chainPaths(d).read, join(d, '.swarm', 'chain.json'), 'no .verafy/: read the old chain')
  mkdirSync(join(d, '.verafy'))
  assert.equal(chainPaths(d).read, join(d, '.swarm', 'chain.json'), 'empty .verafy/: read the old chain')
  writeFileSync(fresh, '[]')
  assert.equal(chainPaths(d).read, fresh, '.verafy/ has a chain: read it')
  assert.equal(chainPaths(d).write, fresh)
})

test('rename: VERAFY_API_KEY and VERAFY_KEYBLOCK_PASSPHRASE fall back to the SWARM_ names', () => {
  assert.equal(apiKeyFromEnv({ VERAFY_API_KEY: 'new', SWARM_API_KEY: 'old' }), 'new')
  assert.equal(apiKeyFromEnv({ SWARM_API_KEY: 'old' }), 'old')
  assert.equal(apiKeyFromEnv({}), undefined)
  assert.equal(envValue('SWARM_API_KEY', { VERAFY_API_KEY: 'new' }), 'new', 'an old config naming SWARM_API_KEY finds the new variable')
  assert.equal(envValue('VLLM_API_KEY', { VLLM_API_KEY: 'v' }), 'v', 'names outside the rename are read as they are')
  assert.equal(keyblockPassphraseFromEnv({ VERAFY_KEYBLOCK_PASSPHRASE: 'new passphrase 1', SWARM_KEYBLOCK_PASSPHRASE: 'old passphrase 1' }), 'new passphrase 1')
  assert.equal(keyblockPassphraseFromEnv({ SWARM_KEYBLOCK_PASSPHRASE: 'old passphrase 1' }), 'old passphrase 1')

  const kb = Keyblock.fromEnv({}, { SWARM_KEYBLOCK_PASSPHRASE: 'correct horse battery' })
  kb.put('openrouter', 'test-secret')
  const stored = kb.export()
  const reopened = Keyblock.fromEnv(stored, { VERAFY_KEYBLOCK_PASSPHRASE: 'correct horse battery' })
  assert.deepEqual(reopened.names(), ['openrouter'], 'a keyblock sealed under the old name opens under the new one')
  assert.throws(() => Keyblock.fromEnv({}, {}), /set VERAFY_KEYBLOCK_PASSPHRASE/)
})

// ---- CLI ----------------------------------------------------------------------

/** A copy of the CLI and core in a scratch directory, so its state and config can be staged. */
function install() {
  const d = tmp()
  for (const p of ['bin', 'packages/core/src', 'examples', 'package.json']) cpSync(join(ROOT, p), join(d, p), { recursive: true })
  return d
}
const cli = (d, bin, ...args) => spawnSync(process.execPath, [join(d, 'bin', bin), ...args], { cwd: d, encoding: 'utf8', env: { ...process.env, VERAFY_API_KEY: '', SWARM_API_KEY: '' } })

test('rename: `swarm` is an alias that prints a one-line notice; `verafy` prints none', () => {
  const d = install()
  writeFileSync(join(d, 'verafy.config.json'), JSON.stringify(config))
  const a = cli(d, 'swarm.js', 'validate', 'examples/market-resolution.json')
  assert.equal(a.status, 0)
  assert.equal(a.stdout.trim(), 'valid')
  assert.equal(a.stderr.trim().split('\n').length, 1)
  assert.match(a.stderr, /`swarm` is now `verafy`/)
  const b = cli(d, 'verafy.js', 'validate', 'examples/market-resolution.json')
  assert.equal(b.status, 0)
  assert.equal(b.stdout.trim(), 'valid')
  assert.equal(b.stderr, '')
})

test('rename: on a pre-rename setup (swarm.config.json, .swarm/chain.json) the CLI keeps the chain going in .verafy/', () => {
  const d = install()
  writeFileSync(join(d, 'swarm.config.json'), JSON.stringify(config))
  // Block 1, then move the chain to where a pre-rename CLI kept it: .swarm/, with no .verafy/.
  const first = cli(d, 'verafy.js', 'run', 'examples/market-resolution.json', '--json')
  assert.equal(first.status, 0, first.stderr)
  const block1 = JSON.parse(first.stdout)
  mkdirSync(join(d, '.swarm'))
  renameSync(join(d, '.verafy', 'chain.json'), join(d, '.swarm', 'chain.json'))
  rmSync(join(d, '.verafy'), { recursive: true })
  const before = readFileSync(join(d, '.swarm', 'chain.json'), 'utf8')
  const second = cli(d, 'verafy.js', 'run', 'examples/fact-check.json', '--json')
  assert.equal(second.status, 0, second.stderr)
  const block2 = JSON.parse(second.stdout)
  assert.equal(block2.height, block1.height + 1)
  assert.equal(block2.parent, block1.hash)
  const chain = JSON.parse(readFileSync(join(d, '.verafy', 'chain.json'), 'utf8'))
  assert.deepEqual(chain.map(b => b.hash), [block1.hash, block2.hash])
  assert.equal(readFileSync(join(d, '.swarm', 'chain.json'), 'utf8'), before, 'the old chain is read, never rewritten')
  assert.ok(!existsSync(join(d, 'verafy.config.json')), 'the run used swarm.config.json')
})

// ---- Juror tools --------------------------------------------------------------

test('rename: the juror lock allows only verafy_load_contract and verafy_cast_vote', () => {
  const src = readFileSync(join(ROOT, 'packages', 'dsh-verafy-juror', 'src', 'index.ts'), 'utf8')
  assert.match(src, /const VERAFY_TOOLS = new Set\(\['verafy_load_contract', 'verafy_cast_vote'\]\)/)
  assert.match(src, /name: 'verafy:juror'/)
  assert.doesNotMatch(src, /swarm_/)
  const overlay = readFileSync(join(ROOT, 'config', 'cordis.verafy.yml'), 'utf8')
  assert.match(overlay, /'@verafyharness\/dsh-verafy-juror'/)
  assert.ok(!existsSync(join(ROOT, 'config', 'cordis.swarm.yml')), 'the old overlay is deleted')
})
