#!/usr/bin/env node
/**
 * Slashing, end to end, in one process with scripted models. Run from the repo root:
 *
 *   node examples/slashing/walkthrough.mjs          one withheld reveal, then a challenge
 *   node examples/slashing/walkthrough.mjs --both   plus a changed reveal, which sinks the ruling
 *
 * 1. Every harness posts a bond. The jury scheduler draws a jury from the beacon.
 * 2. One juror withholds its reveal. With --both, another also reveals an answer
 *    that does not open its commitment. Faults are recorded in the ruling.
 * 3. The slashing schedule prices them; the bond diff conserves totals.
 * 4. The contract holds its payouts for a challenge window. A challenge on
 *    "error" overturns the ruling inside the window, so the held escrow pays out
 *    the other way and the challenger takes the forfeited juror share.
 *
 * Every rate and amount here is illustrative.
 */
import { readFileSync } from 'node:fs'
import {
  Harness, mockProvider, ascHash, ruleFromRecords, verifyRuling, rulingId,
  JuryScheduler, scheduleRecord, beaconChain, beaconEntry,
  slashRuling, slashDiff, bondAccount, exposure, DEFAULT_SLASHING,
  releaseHeld, challengeContract, resolveChallenge, appendReview, lockChallengeBond, settleChallengeBond, challengeBondFor,
} from '../../packages/core/src/index.js'

const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'))
const asc = read('./held-delay-cover.json')
const mock = read('../mock-answers.json')
const config = read('../../verafy.config.json')
const pool = config.pool.map(h => new Harness({ ...h, provider: mockProvider(mock, asc.id, h.family) }))
const bonds = Object.fromEntries(pool.map(h => [bondAccount(h.id), h.bond]))
const line = s => console.log(s)

line(`What a harness puts at stake: a ${pool[0].bond} bond; the worst single fault (${exposure(pool[0].bond).worstFault}) takes ${exposure(pool[0].bond).atStake}.`)

// 1. Draw from the beacon. (A fixed secret, so this walkthrough prints the same jury every time.)
const chainOf = beaconChain({ secret: '11'.repeat(32), length: 10 })
const beacon = beaconEntry(null, { sealer: 'node-1', reveal: chainOf.reveal(1) }, 1)
const scheduler = new JuryScheduler()
const { jury, schedule } = scheduler.draw(asc, pool, { seed: beacon.value, height: 1 })
line(`\nJury (seed ${beacon.value.slice(0, 12)}): ${jury.map(j => `${j.id} (${j.family})`).join(', ')}`)

// 2. Commit, then reveal. One juror withholds its reveal; with --both, a second reveals a changed answer.
const both = process.argv.includes('--both')
const commits = []
for (const j of jury) commits.push(await j.commit(asc))
const reveals = jury.map(j => j.reveal(ascHash(asc)))
reveals[0] = null
if (both) {
  const r1 = reveals[1]
  const changed = { harness: r1.harness, ascHash: r1.ascHash, vote: { ...r1.vote, answer: asc.question.answer.options.find(o => o !== r1.vote.answer) }, salt: r1.salt }
  reveals[1] = { ...changed, signature: jury[1].sign(changed) }
}
const ruling = ruleFromRecords(asc, commits, reveals, { jury: jury.map(j => j.card), sealer: 'node:node-1', seed: beacon.value, schedule: scheduleRecord(schedule) })
const v = verifyRuling(asc, ruling)
line(`Ruling: ${ruling.passed ? ruling.answer : 'below bar'}; verifies: ${v.ok}${v.ok ? '' : ` (${v.problems.join('; ')})`}`)
for (const f of ruling.round.faults) line(`  fault: ${f.harness} ${f.fault}${f.evidence ? ' (signed evidence kept)' : ''}`)

// 3. Price and apply the slashes.
const priced = slashRuling(ruling, DEFAULT_SLASHING, { history: [{ harness: jury[0].id, fault: 'no-reveal', height: -500 }], height: 1 })
const { diff } = slashDiff(priced, { balances: bonds })
for (const p of priced) line(`  slash: ${p.harness} ${p.fault}: ${p.amount}${p.forgiven ? ' (forgiven)' : ''}`)
for (const d of diff) line(`    ${d.account.padEnd(22)} ${d.delta > 0 ? '+' : ''}${d.delta}`)

// 4. The payouts wait; a challenge overturns the ruling inside the window.
if (!ruling.passed) { line('\nBelow the bar: the escrow carries to an escalated jury instead, and nothing is held. Two bad jurors sank it; each paid for it.'); process.exit(0) }
line(`\nPayouts held: ${ruling.held.amount} in ${ruling.held.account} for ${ruling.held.window} blocks.`)
line(`  at block 3: ${releaseHeld(asc, ruling, { sealedAt: 1, height: 3 }).status}`)
const ch = challengeContract(asc, ruling, { grounds: 'error' })
const bond = challengeBondFor(ch)
line(`Challenge opened on "error"; the challenger locks ${bond} (${lockChallengeBond(ch, 'harness:challenger').length} entries).`)
const other = asc.question.answer.options.find(o => o !== ruling.answer)
const review = resolveChallenge(ch, { ...ruling, round: undefined, ascHash: ascHash(ch), passed: true, answer: other, votes: [] }, ruling)
const out = releaseHeld(asc, ruling, { sealedAt: 1, height: 4, reviews: appendReview([], review), challenger: 'harness:challenger' })
line(`Challenge result: ${review.result} to ${other}; held escrow: ${out.status}`)
for (const d of out.diff) line(`    ${d.account.padEnd(36)} ${d.delta > 0 ? '+' : ''}${d.delta}`)
line(`Challenge bond: ${settleChallengeBond(ch, review, ruling, { from: 'harness:challenger', amount: bond }).diff.map(d => `${d.account} ${d.delta}`).join(', ')}`)
line(`\nRuling id ${rulingId(ruling).slice(0, 12)} stays on record; the review is appended after it.`)
