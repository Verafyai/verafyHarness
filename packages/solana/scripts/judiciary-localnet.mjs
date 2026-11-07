#!/usr/bin/env node
/**
 * End to end on a local validator, against the real Squads v4 program (dumped
 * from mainnet): attach a judiciary signer to a Squads multisig and show it
 * votes only as a sealed jury ruling says.
 *
 *   node packages/solana/scripts/judiciary-localnet.mjs --squads squads_v4.so [--out results.json]
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
} from '../src/index.js'

const HERE = new URL('..', import.meta.url).pathname
const { values: a } = parseArgs({ options: { squads: { type: 'string' }, out: { type: 'string' }, keep: { type: 'boolean' } } })
if (!a.squads) { console.error('need --squads <path to squads_v4.so> (solana program dump -u m SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf squads_v4.so)'); process.exit(2) }

const RULING = keypair(JSON.parse(readFileSync(join(HERE, 'program/target/deploy/verafy_ruling-keypair.json'), 'utf8')))
const JUDICIARY = keypair(JSON.parse(readFileSync(join(HERE, 'judiciary/target/deploy/verafy_judiciary-keypair.json'), 'utf8')))
const PROGRAM_CONFIG = squadsPda.programConfig().address
const mainnet = rpcClient('https://api.mainnet-beta.solana.com')
const treasury = b58encode((await mainnet.account(PROGRAM_CONFIG)).data.subarray(48, 80))

const ledger = mkdtempSync(join(tmpdir(), 'judiciary-'))
const validator = spawn('solana-test-validator', [
  '--reset', '--quiet', '--ledger', ledger,
  '--bpf-program', SQUADS_PROGRAM, a.squads,
  '--bpf-program', RULING.address, join(HERE, 'program/target/deploy/verafy_ruling.so'),
  '--bpf-program', JUDICIARY.address, join(HERE, 'judiciary/target/deploy/verafy_judiciary.so'),
  '--url', 'https://api.mainnet-beta.solana.com', '--clone', PROGRAM_CONFIG, '--clone', treasury,
], { stdio: 'ignore' })
const stop = () => { if (!a.keep) validator.kill('SIGINT') }
process.on('exit', stop)

const rpc = rpcClient('http://127.0.0.1:8899')
for (let i = 0; ; i++) { try { await rpc.call('getHealth'); break } catch { if (i > 120) throw new Error('validator did not start'); await new Promise(r => setTimeout(r, 1000)) } }

const results = []
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); if (!ok) process.exitCode = 1 }
const payer = keypair()
await rpc.confirm(await rpc.airdrop(payer.address, 100e9))
const send = async (ixs, signers = []) => rpc.send(buildTx(ixs, payer, [payer, ...signers], await rpc.blockhash()))
const fails = async (ixs, signers = []) => { try { await send(ixs, signers); return null } catch (e) { return judiciaryError(e) ?? String(e.message).slice(0, 160) } }
const slot = () => rpc.call('getSlot', [{ commitment: 'confirmed' }])
const waitUntil = async s => { while ((await slot()) < s) await new Promise(r => setTimeout(r, 300)) }

// ---- Setup: the jury, the signer config, the multisig ---------------------------
const jurors = [keypair(), keypair(), keypair()]
const human = keypair(), proposer = keypair(), recipient = keypair()
for (const k of [...jurors, human, proposer]) await rpc.confirm(await rpc.airdrop(k.address, 2e9))
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
await rpc.confirm(await rpc.airdrop(vault, 5e9))

let index = ms.transactionIndex
const caseRent = await rpc.rent(CASE_SIZE)
async function propose(lamports) {
  index += 1
  const transfer = { programId: new Uint8Array(32), keys: [{ pubkey: b58decode(vault), isSigner: true, isWritable: true }, { pubkey: recipient.publicKey, isSigner: false, isWritable: true }], data: Buffer.concat([Buffer.from([2, 0, 0, 0]), (() => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(lamports)); return b })()]) }
  await send([
    squadsIx.vaultTransactionCreate({ multisig, index, creator: proposer.address, rentPayer: payer.address, instructions: [transfer] }),
    squadsIx.proposalCreate({ multisig, index, creator: proposer.address, rentPayer: payer.address }),
  ], [proposer])
  await send([squadsIx.proposalApprove({ multisig, index, member: human.address })], [human])
  await send([judiciaryIx.register({ programId: JUDICIARY.address, config: config.address, multisig, index, payer: payer.address, lamports: caseRent })])
  const proposal = squadsPda.proposal(multisig, index).address
  const txData = (await rpc.account(squadsPda.transaction(multisig, index).address)).data
  return { index, proposal, hash: caseHash(config.address, proposal, txData), tx: decodeTransaction(txData) }
}
const rule = async (contractHash, answer, jury = jurors, challengeWindow = CHALLENGE) => (await settleRuling({ rpc, programId: RULING.address, payer, contractHash, barPpm: 660_000, challengeWindow,
  votes: jury.map(k => ({ keypair: k, answer, reasoningHash: createHash('sha256').update(`juror ${k.address} answer ${answer}`).digest('hex') })) })).ruling
const status = async idx => decodeProposal((await rpc.account(squadsPda.proposal(multisig, idx).address)).data).status

// ---- Case 1 to 3: an approved transfer ------------------------------------------
const c1 = await propose(1e9)
const reg = decodeCase((await rpc.account(caseOf(config.address, c1.proposal, JUDICIARY.address).address)).data)
check('case registered; its hash binds signer, proposal and transaction bytes', reg.status === 'registered' && reg.caseHash === c1.hash)
check('the transaction decodes to what the jury will see', c1.tx.kind === 'vault' && c1.tx.instructions[0].program === '11111111111111111111111111111111')
check('1. the human alone does not reach the threshold', await status(c1.index) === 'active')

// A jury the signer never named: three fresh, funded keys.
const strangers = [keypair(), keypair(), keypair()]
for (const k of strangers) await rpc.confirm(await rpc.airdrop(k.address, 1e9))
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
check('3c. the approved transfer executes from the vault', (await rpc.balance(recipient.address)) - before === 1e9)
check('3d. a decided case cannot be decided again', await fails([judiciaryIx.decide({ programId: JUDICIARY.address, config: config.address, ruling: approve, multisig, index: c1.index })]) === 'wrong state')

// ---- Case 4: a rejection ------------------------------------------------------
const c4 = await propose(3e9)
const reject = await rule(c4.hash, 1)
await waitUntil(Number((await rpc.account(reject)).data.readBigUInt64LE(1434)))
await send([judiciaryIx.decide({ programId: JUDICIARY.address, config: config.address, ruling: reject, multisig, index: c4.index })])
const p4 = decodeProposal((await rpc.account(c4.proposal)).data)
check('4a. a REJECT ruling votes no', p4.rejected.includes(signer) && p4.status !== 'approved')
const c4case = decodeCase((await rpc.account(caseOf(config.address, c4.proposal, JUDICIARY.address).address)).data)
await waitUntil(c4case.registeredSlot + ESCAPE)
check('4b. a rejected case can never escape', await fails([judiciaryIx.escape({ programId: JUDICIARY.address, config: config.address, multisig, index: c4.index })]) === 'wrong state')

// ---- Case 5: the escape hatch -----------------------------------------------
const c5 = await propose(5e8)
check('5a. with no ruling, escape is refused before the delay', await fails([judiciaryIx.escape({ programId: JUDICIARY.address, config: config.address, multisig, index: c5.index })]) === 'too early')
const c5case = decodeCase((await rpc.account(caseOf(config.address, c5.proposal, JUDICIARY.address).address)).data)
await waitUntil(c5case.registeredSlot + ESCAPE)
await send([judiciaryIx.escape({ programId: JUDICIARY.address, config: config.address, multisig, index: c5.index })])
check('5b. after the delay, the escape hatch approves', await status(c5.index) === 'approved')
check('5c. the case records that it escaped', decodeCase((await rpc.account(caseOf(config.address, c5.proposal, JUDICIARY.address).address)).data).status === 'escaped')

const version = execFileSync('solana-test-validator', ['--version']).toString().trim()
const summary = { date: new Date().toISOString(), validator: version, squads: SQUADS_PROGRAM, squadsSource: 'dumped from mainnet', ruling: RULING.address, judiciary: JUDICIARY.address, challengeSlots: CHALLENGE, escapeSlots: ESCAPE, results, passed: results.filter(r => r.ok).length, total: results.length }
console.log(`\n${summary.passed}/${summary.total} passed`)
if (a.out) writeFileSync(a.out, JSON.stringify(summary, null, 2) + '\n')
stop()
process.exit(process.exitCode ?? 0)
