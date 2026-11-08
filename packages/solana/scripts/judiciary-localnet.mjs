#!/usr/bin/env node
/**
 * End to end on a local validator, against the real Squads v4 program (dumped
 * from mainnet): attach a judiciary signer to a Squads multisig and show it
 * votes only as a sealed jury ruling says.
 *
 *   node packages/solana/scripts/judiciary-localnet.mjs --squads squads_v4.so [--out results.json]
 *   node packages/solana/scripts/judiciary-localnet.mjs --rpc https://api.devnet.solana.com --payer payer.json [--out results.json]
 *
 * With --rpc it runs against a live cluster instead of starting a validator:
 * the four programs must already be deployed there (scripts/devnet-deploy.mjs),
 * Squads v4 must be live (it is on devnet), and --payer funds every account by
 * transfer. Amounts are scaled to 0.01 SOL units so a run costs well under 1 SOL.
 *
 * Needs `solana-test-validator` on PATH and network access to mainnet RPC, to
 * clone the Squads program config and treasury accounts. It starts its own
 * validator on port 8899 and stops it when done.
 *
 * Cases, each checked:
 *   1. The humans alone cannot reach the threshold.
 *   2. A ruling from the wrong jury, or on a different case, is refused.
 *   3. A ruling still inside its challenge window is refused; after it, the
 *      signer approves and the vault transfer executes.
 *   4. A REJECT ruling votes no, and that case can never escape.
 *   5. With no ruling at all, the escape hatch approves only after its delay.
 *   6. The case fee pays the jurors who revealed, once (VIP-0012).
 *   7. Harnesses register in verafy_registry and are discovered with one RPC
 *      call; only the operator can change them; a bond waits out unbonding.
 *   8. The encoder writes the policy on chain in Memo chunks and reads it back
 *      against the hash in the signer config (VIP-0019).
 *   9. A commission covenant pays its bond out when the commission goes over,
 *      and returns it when it held to the end (VIP-0016).
 */
import { spawn, execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { createHash } from 'node:crypto'
import {
  rpc as rpcClient, keypair, buildTx, createAccountIx, settleRuling, b58encode, b58decode,
  SQUADS_PROGRAM, PERMISSION, squadsPda, squadsIx, decodeMultisig, decodeProposal, decodeTransaction,
  judiciaryIx, authorityOf, caseOf, caseHash, decodeCase, decodeSignerConfig, CONFIG_SIZE, CASE_SIZE, judiciaryError,
  registryIx, harnessAccount, discoverHarnesses, decodeHarness, HARNESS_SIZE,
  memoBackend, encodeObject, decodeObject, covenantIx, decodeCovenant, voteCommission, COVENANT_SIZE,
} from '../src/index.js'

const HERE = new URL('..', import.meta.url).pathname
const { values: a } = parseArgs({ options: { squads: { type: 'string' }, out: { type: 'string' }, keep: { type: 'boolean' }, rpc: { type: 'string' }, payer: { type: 'string' } } })
const LIVE = Boolean(a.rpc)
if (LIVE && !a.payer) { console.error('--rpc needs --payer <keypair.json> with SOL on that cluster'); process.exit(2) }
if (!LIVE && !a.squads) { console.error('need --squads <path to squads_v4.so> (solana program dump -u m SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf squads_v4.so)'); process.exit(2) }

const RULING = keypair(JSON.parse(readFileSync(join(HERE, 'program/target/deploy/verafy_ruling-keypair.json'), 'utf8')))
const JUDICIARY = keypair(JSON.parse(readFileSync(join(HERE, 'judiciary/target/deploy/verafy_judiciary-keypair.json'), 'utf8')))
const REGISTRY = keypair(JSON.parse(readFileSync(join(HERE, 'registry/target/deploy/verafy_registry-keypair.json'), 'utf8')))
const COVENANT = keypair(JSON.parse(readFileSync(join(HERE, 'covenant/target/deploy/verafy_covenant-keypair.json'), 'utf8')))
const PROGRAM_CONFIG = squadsPda.programConfig().address
const URL_ = LIVE ? a.rpc : 'http://127.0.0.1:8899'
const source = rpcClient(LIVE ? a.rpc : 'https://api.mainnet-beta.solana.com')
const treasury = b58encode((await source.account(PROGRAM_CONFIG)).data.subarray(48, 80))
/** One unit of SOL in this run: 1 SOL on a local validator, 0.01 SOL on a live cluster. */
const U = LIVE ? 1e7 : 1e9

const ledger = mkdtempSync(join(tmpdir(), 'judiciary-'))
const validator = LIVE ? null : spawn('solana-test-validator', [
  '--reset', '--quiet', '--ledger', ledger,
  '--bpf-program', SQUADS_PROGRAM, a.squads,
  '--bpf-program', RULING.address, join(HERE, 'program/target/deploy/verafy_ruling.so'),
  '--bpf-program', JUDICIARY.address, join(HERE, 'judiciary/target/deploy/verafy_judiciary.so'),
  '--bpf-program', REGISTRY.address, join(HERE, 'registry/target/deploy/verafy_registry.so'),
  '--bpf-program', COVENANT.address, join(HERE, 'covenant/target/deploy/verafy_covenant.so'),
  '--url', 'https://api.mainnet-beta.solana.com', '--clone', PROGRAM_CONFIG, '--clone', treasury,
], { stdio: 'ignore' })
const stop = () => { if (validator && !a.keep) validator.kill('SIGINT') }
process.on('exit', stop)

const rpc = rpcClient(URL_)
for (let i = 0; ; i++) { try { await rpc.call('getHealth'); break } catch { if (i > 120) throw new Error('validator did not start'); await new Promise(r => setTimeout(r, 1000)) } }

const results = []
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); if (!ok) process.exitCode = 1 }
const payer = LIVE ? keypair(JSON.parse(readFileSync(a.payer, 'utf8'))) : keypair()
if (!LIVE) await rpc.confirm(await rpc.airdrop(payer.address, 100e9))
const transferIx = (from, to, lamports) => ({ programId: new Uint8Array(32), keys: [{ pubkey: b58decode(from), isSigner: true, isWritable: true }, { pubkey: b58decode(to), isSigner: false, isWritable: true }], data: Buffer.concat([Buffer.from([2, 0, 0, 0]), (() => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(Math.round(lamports))); return b })()]) })
/** Fund an account: an airdrop on a local validator, a transfer from the payer on a live cluster. */
const fund = async (address, lamports) => {
  if (!LIVE) return rpc.confirm(await rpc.airdrop(address, lamports))
  return rpc.send(buildTx([transferIx(payer.address, address, lamports)], payer, [payer], await rpc.blockhash()))
}
const send = async (ixs, signers = []) => rpc.send(buildTx(ixs, payer, [payer, ...signers], await rpc.blockhash()))
const fails = async (ixs, signers = []) => { try { await send(ixs, signers); return null } catch (e) { return judiciaryError(e) ?? String(e.message).slice(0, 160) } }
const slot = () => rpc.call('getSlot', [{ commitment: 'confirmed' }])
const waitUntil = async s => { while ((await slot()) < s) await new Promise(r => setTimeout(r, LIVE ? 1500 : 300)) }

// ---- Setup: the jury, the signer config, the multisig ---------------------------
const jurors = [keypair(), keypair(), keypair()]
const human = keypair(), proposer = keypair(), recipient = keypair()
for (const k of [...jurors, human, proposer]) await fund(k.address, 2e9 / 1e9 * U * (LIVE ? 2 : 1))
const createKey = keypair()
const multisig = squadsPda.multisig(createKey.address).address
const vault = squadsPda.vault(multisig, 0).address
const policyHash = createHash('sha256').update('example policy').digest('hex')
const modelsHash = createHash('sha256').update('example models').digest('hex')
const CHALLENGE = 6, ESCAPE = 40

const config = keypair()
await send([
  createAccountIx(payer, config, await rpc.rent(CONFIG_SIZE), CONFIG_SIZE, JUDICIARY.publicKey),
  judiciaryIx.attach({ programId: JUDICIARY.address, config: config.address, creator: payer.address, barPpm: 660_000, multisig, policyHash, modelsHash, rulingProgram: RULING.address, challengeSlots: CHALLENGE, escapeSlots: ESCAPE, jurors: jurors.map(j => j.address) }),
], [config])
const signer = authorityOf(config.address, JUDICIARY.address).address
const cfg = decodeSignerConfig((await rpc.account(config.address)).data)
check('signer attached with its jury, policy and models fixed', cfg.status === 'attached' && cfg.seats === 3 && cfg.policyHash === policyHash && cfg.multisig === multisig, `member ${signer}`)

// One human voter and the judiciary signer; threshold 2, so neither can pass a proposal alone.
await send([squadsIx.multisigCreate({ programConfig: PROGRAM_CONFIG, treasury, creator: payer.address, createKey: createKey.address, threshold: 2, timeLock: 0, members: [
  { key: human.address, mask: PERMISSION.all },
  { key: proposer.address, mask: PERMISSION.initiate },
  { key: signer, mask: PERMISSION.vote },
] })], [createKey])
const ms = decodeMultisig((await rpc.account(multisig)).data)
check('multisig created with the judiciary signer as a voting member', ms.threshold === 2 && ms.members.some(m => m.key === signer && m.vote))
await fund(vault, 5e9 / 1e9 * U * (LIVE ? 2 : 1))

let index = ms.transactionIndex
const caseRent = await rpc.rent(CASE_SIZE)
const FEE = 30_000_000
async function propose(lamports) {
  index += 1
  const transfer = { programId: new Uint8Array(32), keys: [{ pubkey: b58decode(vault), isSigner: true, isWritable: true }, { pubkey: recipient.publicKey, isSigner: false, isWritable: true }], data: Buffer.concat([Buffer.from([2, 0, 0, 0]), (() => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(lamports)); return b })()]) }
  await send([
    squadsIx.vaultTransactionCreate({ multisig, index, creator: proposer.address, rentPayer: payer.address, instructions: [transfer] }),
    squadsIx.proposalCreate({ multisig, index, creator: proposer.address, rentPayer: payer.address }),
  ], [proposer])
  await send([squadsIx.proposalApprove({ multisig, index, member: human.address })], [human])
  await send([judiciaryIx.register({ programId: JUDICIARY.address, config: config.address, multisig, index, payer: payer.address, lamports: caseRent, fee: FEE })])
  const proposal = squadsPda.proposal(multisig, index).address
  const txData = (await rpc.account(squadsPda.transaction(multisig, index).address)).data
  return { index, proposal, hash: caseHash(config.address, proposal, txData), tx: decodeTransaction(txData) }
}
const rule = async (contractHash, answer, jury = jurors, challengeWindow = CHALLENGE) => (await settleRuling({ rpc, programId: RULING.address, payer, contractHash, barPpm: 660_000, challengeWindow,
  votes: jury.map(k => ({ keypair: k, answer, reasoningHash: createHash('sha256').update(`juror ${k.address} answer ${answer}`).digest('hex') })) })).ruling
const status = async idx => decodeProposal((await rpc.account(squadsPda.proposal(multisig, idx).address)).data).status

// ---- Case 1 to 3: an approved transfer ------------------------------------------
const c1 = await propose(U)
const reg = decodeCase((await rpc.account(caseOf(config.address, c1.proposal, JUDICIARY.address).address)).data)
check('case registered; its hash binds signer, proposal and transaction bytes', reg.status === 'registered' && reg.caseHash === c1.hash)
check('the transaction decodes to what the jury will see', c1.tx.kind === 'vault' && c1.tx.instructions[0].program === '11111111111111111111111111111111')
check('1. the human alone does not reach the threshold', await status(c1.index) === 'active')

// A jury the signer never named: three fresh, funded keys.
const strangers = [keypair(), keypair(), keypair()]
for (const k of strangers) await fund(k.address, 1e9 / 1e9 * U * (LIVE ? 2 : 1))
const byStrangers = await rule(c1.hash, 0, strangers)
check('2a. a ruling from a jury the signer did not name is refused', await fails([judiciaryIx.decide({ programId: JUDICIARY.address, config: config.address, ruling: byStrangers, multisig, index: c1.index })]) === 'bad ruling')
const otherCase = await rule(createHash('sha256').update('another case').digest('hex'), 0)
check('2b. a ruling on a different case is refused', await fails([judiciaryIx.decide({ programId: JUDICIARY.address, config: config.address, ruling: otherCase, multisig, index: c1.index })]) === 'bad ruling')

const approve = await rule(c1.hash, 0)
const early = await fails([judiciaryIx.decide({ programId: JUDICIARY.address, config: config.address, ruling: approve, multisig, index: c1.index })])
check('3a. a ruling inside its challenge window is refused', early === 'too early', early ?? 'it went through')
const releasable = (await rpc.account(approve)).data.readBigUInt64LE(1434)
await waitUntil(Number(releasable))
await send([judiciaryIx.decide({ programId: JUDICIARY.address, config: config.address, ruling: approve, multisig, index: c1.index })])
check('3b. after the window, the signer approves as the ruling says', await status(c1.index) === 'approved')
const before = await rpc.balance(recipient.address)
const remaining = c1.tx.message.accountKeys.map((k, i) => ({ pubkey: b58decode(k), isSigner: false, isWritable: i < c1.tx.message.numWritableSigners || (i >= c1.tx.message.numSigners && i < c1.tx.message.numSigners + c1.tx.message.numWritableNonSigners) }))
await send([squadsIx.vaultTransactionExecute({ multisig, index: c1.index, member: human.address, remaining })], [human])
check('3c. the approved transfer executes from the vault', (await rpc.balance(recipient.address)) - before === U)
check('3d. a decided case cannot be decided again', await fails([judiciaryIx.decide({ programId: JUDICIARY.address, config: config.address, ruling: approve, multisig, index: c1.index })]) === 'wrong state')

// ---- Case 6: the jury gets paid ------------------------------------------------
const paid0 = await Promise.all(jurors.map(j => rpc.balance(j.address)))
await send([judiciaryIx.pay({ programId: JUDICIARY.address, config: config.address, proposal: c1.proposal, ruling: approve, jurors: jurors.map(j => j.address) })])
const paid1 = await Promise.all(jurors.map(j => rpc.balance(j.address)))
check('6a. the case fee is split among the jurors who revealed', paid1.every((b, i) => b - paid0[i] === FEE / 3), `${FEE / 3} lamports each`)
check('6b. a case pays once', await fails([judiciaryIx.pay({ programId: JUDICIARY.address, config: config.address, proposal: c1.proposal, ruling: approve, jurors: jurors.map(j => j.address) })]) === 'wrong state')

// ---- Case 4: a rejection ------------------------------------------------------
const c4 = await propose(3 * U)
const reject = await rule(c4.hash, 1)
await waitUntil(Number((await rpc.account(reject)).data.readBigUInt64LE(1434)))
await send([judiciaryIx.decide({ programId: JUDICIARY.address, config: config.address, ruling: reject, multisig, index: c4.index })])
const p4 = decodeProposal((await rpc.account(c4.proposal)).data)
check('4a. a REJECT ruling votes no', p4.rejected.includes(signer) && p4.status !== 'approved')
const c4case = decodeCase((await rpc.account(caseOf(config.address, c4.proposal, JUDICIARY.address).address)).data)
await waitUntil(c4case.registeredSlot + ESCAPE)
check('4b. a rejected case can never escape', await fails([judiciaryIx.escape({ programId: JUDICIARY.address, config: config.address, multisig, index: c4.index })]) === 'wrong state')

// ---- Case 5: the escape hatch -----------------------------------------------
const c5 = await propose(U / 2)
check('5a. with no ruling, escape is refused before the delay', await fails([judiciaryIx.escape({ programId: JUDICIARY.address, config: config.address, multisig, index: c5.index })]) === 'too early')
const c5case = decodeCase((await rpc.account(caseOf(config.address, c5.proposal, JUDICIARY.address).address)).data)
await waitUntil(c5case.registeredSlot + ESCAPE)
await send([judiciaryIx.escape({ programId: JUDICIARY.address, config: config.address, multisig, index: c5.index })])
check('5b. after the delay, the escape hatch approves', await status(c5.index) === 'approved')
check('5c. the case records that it escaped', decodeCase((await rpc.account(caseOf(config.address, c5.proposal, JUDICIARY.address).address)).data).status === 'escaped')

// ---- 7: the harness registry --------------------------------------------------
const operator = keypair()
await fund(operator.address, 10e9 / 1e9 * U * (LIVE ? 2 : 1))
const hRent = await rpc.rent(HARNESS_SIZE)
const families = ['mistral', 'gpt-oss', 'gemma']
for (const [i, j] of jurors.entries()) {
  await rpc.send(buildTx([registryIx.register({ programId: REGISTRY.address, harnessKey: j.address, operator: operator.address, lamports: hRent + U, family: families[i], model: `${families[i]}/model`, endpoint: `https://h${i}.example.org/cases`, price: 10_000_000 })], operator, [operator, j], await rpc.blockhash()))
}
// On a live cluster other runs' harnesses are registered too: count this run's operator only.
const mine = async () => (await discoverHarnesses(rpc, REGISTRY.address)).filter(h => h.operator === operator.address)
const found = await mine()
check('7a. harnesses register and are discovered with one RPC call', found.length === 3 && found.every(h => h.bond === U / 1e9 && h.endpoint.startsWith('https://')), found.map(h => h.id).join(', '))
const stranger = keypair()
await fund(stranger.address, 1e9 / 1e9 * U * (LIVE ? 2 : 1))
const notOp = await rpc.send(buildTx([registryIx.update({ programId: REGISTRY.address, harnessKey: jurors[0].address, operator: stranger.address, endpoint: 'https://evil.example', price: 0 })], stranger, [stranger], await rpc.blockhash())).then(() => null, e => String(e.message))
check('7b. only the operator can change a harness', /0x65/.test(notOp ?? ''), notOp ? 'not authorized' : 'it went through')
await rpc.send(buildTx([registryIx.update({ programId: REGISTRY.address, harnessKey: jurors[0].address, operator: operator.address, endpoint: 'https://h0.example.org/v2', price: 12_000_000 })], operator, [operator], await rpc.blockhash()))
const h0 = decodeHarness((await rpc.account(harnessAccount(jurors[0].address, REGISTRY.address).address)).data)
check('7c. the operator updates the endpoint and price', h0.endpoint === 'https://h0.example.org/v2' && h0.price === 12_000_000)
await rpc.send(buildTx([registryIx.retire({ programId: REGISTRY.address, harnessKey: jurors[1].address, operator: operator.address })], operator, [operator], await rpc.blockhash()))
check('7d. a retired harness drops out of discovery', (await mine()).length === 2)
const unbonding = await rpc.send(buildTx([registryIx.withdraw({ programId: REGISTRY.address, harnessKey: jurors[1].address, operator: operator.address, lamports: U })], operator, [operator], await rpc.blockhash())).then(() => null, e => String(e.message))
check('7e. its bond waits out the unbonding delay', /0x67/.test(unbonding ?? ''), unbonding ? 'too early' : 'it went through')

// ---- 8: the encoder -------------------------------------------------------------
const policy = { kind: 'verafy.policy/1', id: 'localnet-example', intent: 'Pays the auditor for audited work, within a monthly budget, and nothing else.', rules: [{ type: 'allow-programs', programs: ['11111111111111111111111111111111'] }], minTimeLockSeconds: 0, padding: 'p'.repeat(1500) }
const enc = await encodeObject(policy, memoBackend({ rpc, payer }))
const back = await decodeObject(enc.locator, memoBackend({ rpc, payer }), enc.hash)
check('8a. the encoder writes a policy on chain in Memo chunks and reads it back', createHash('sha256').update(JSON.stringify(back, Object.keys(back).sort())).digest('hex') === createHash('sha256').update(JSON.stringify(policy, Object.keys(policy).sort())).digest('hex') && back.padding.length === 1500, `${enc.bytes} bytes`)
const refused = await decodeObject(enc.locator, memoBackend({ rpc, payer }), 'ab'.repeat(32)).then(() => false, e => /refusing/.test(e.message))
check('8b. a reader refuses it against the wrong hash', refused)

// ---- 9: the commission covenant ------------------------------------------------
const dir = mkdtempSync(join(tmpdir(), 'covenant-'))
const file = (name, k) => { const p = join(dir, `${name}.json`); writeFileSync(p, JSON.stringify([...k.secret])); return p }
const identity = keypair(), voteKp = keypair(), withdrawer = keypair(), stakers = keypair()
for (const k of [identity, withdrawer]) await fund(k.address, 5e9 / 1e9 * U * (LIVE ? 2 : 1))
const cli = (...args) => execFileSync('solana', [...args, '-u', URL_, '--commitment', 'confirmed'], { stdio: 'pipe' }).toString()
cli('create-vote-account', file('vote', voteKp), file('identity', identity), withdrawer.address, '--commission', '5', '-k', file('payer', payer))
const v0 = voteCommission((await rpc.account(voteKp.address)).data)
check('9a. a vote account reads as withdrawer and commission', v0?.commission === 5 && v0.withdrawer === withdrawer.address, `commission ${v0?.commission}%`)
const covRent = await rpc.rent(COVENANT_SIZE)
async function openCovenant(endSlot, bond) {
  const acct = keypair()
  await rpc.send(buildTx([createAccountIx(withdrawer, acct, covRent + bond, COVENANT_SIZE, COVENANT.publicKey), covenantIx.open({ programId: COVENANT.address, covenant: acct.address, withdrawer: withdrawer.address, vote: voteKp.address, maxCommission: 5, endSlot, bond, beneficiary: stakers.address })], withdrawer, [withdrawer, acct], await rpc.blockhash()))
  return acct.address
}
const far = await openCovenant((await slot()) + 1_000_000, U)
const near = await openCovenant((await slot()) + 30, U)
check('9b. a validator bonds a commission promise', decodeCovenant((await rpc.account(far)).data).status === 'active')
const notBroken = await rpc.send(buildTx([covenantIx.claim({ programId: COVENANT.address, covenant: far, vote: voteKp.address, beneficiary: stakers.address })], payer, [payer], await rpc.blockhash())).then(() => null, e => String(e.message))
check('9c. a claim fails while the promise holds', /0x69/.test(notBroken ?? ''), notBroken ? 'not broken' : 'it went through')
await waitUntil(decodeCovenant((await rpc.account(near)).data).endSlot)
const w0 = await rpc.balance(withdrawer.address)
await rpc.send(buildTx([covenantIx.release({ programId: COVENANT.address, covenant: near, withdrawer: withdrawer.address })], withdrawer, [withdrawer], await rpc.blockhash()))
check('9d. a promise kept to the end gives the bond back', (await rpc.balance(withdrawer.address)) - w0 >= U - 10_000)
cli('vote-update-commission', file('vote2', voteKp), '10', file('withdrawer', withdrawer), '-k', file('payer2', payer))
const s0 = await rpc.balance(stakers.address)
await rpc.send(buildTx([covenantIx.claim({ programId: COVENANT.address, covenant: far, vote: voteKp.address, beneficiary: stakers.address })], payer, [payer], await rpc.blockhash()))
check('9e. raising the commission over the promise pays the bond to stakers', (await rpc.balance(stakers.address)) - s0 === U && decodeCovenant((await rpc.account(far)).data).status === 'broken')

const version = LIVE ? `cluster ${a.rpc}, ${(await rpc.call('getVersion'))['solana-core']}` : execFileSync('solana-test-validator', ['--version']).toString().trim()
const summary = { date: new Date().toISOString(), validator: version, squads: SQUADS_PROGRAM, squadsSource: LIVE ? 'live on the cluster' : 'dumped from mainnet', unitLamports: U, ruling: RULING.address, judiciary: JUDICIARY.address, registry: REGISTRY.address, covenant: COVENANT.address, challengeSlots: CHALLENGE, escapeSlots: ESCAPE, results, passed: results.filter(r => r.ok).length, total: results.length }
console.log(`\n${summary.passed}/${summary.total} passed`)
if (a.out) writeFileSync(a.out, JSON.stringify(summary, null, 2) + '\n')
stop()
process.exit(process.exitCode ?? 0)
