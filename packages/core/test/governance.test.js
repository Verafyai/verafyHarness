// MASTER_SPEC Part G, the harness side: the `verafy.amendment/1` kind and its
// validator (G2), and declining a seat on ethics grounds without fault (G1,
// Constitution Article 3.4). The panels themselves run on verafyChain.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  AMENDMENT_KIND, AMENDMENT_STAGES, ENTRENCHED, validateAmendment, entrenchment, amendmentHash, validate, ascHash,
  seal, sha256, Harness, mockProvider, rule, verifyRuling, checkDecline, DECLINE_KIND,
} from '../src/index.js'

const ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const SCRIPT = JSON.parse(readFileSync(`${ROOT}examples/mock-answers.json`, 'utf8'))
const CONFIG = JSON.parse(readFileSync(`${ROOT}verafy.config.json`, 'utf8'))

/** The AMENDMENTS.md example, with the comment-window pin computed and an escrow amount (illustrative). */
const A7 = {
  kind: 'verafy.amendment/1',
  id: 'A-7',
  amendmentKind: 'extend',
  target: 'ethics.neverAllowed',
  cites: ['block:0', 'constitution.article.3'],
  text: '10. **Election betting by jurors.** Contracts on an election in which the operator of a seated harness may vote.',
  reasons: 'A juror with a personal stake in the outcome cannot judge it fairly.',
  context: [{ role: 'comment-window', pin: `sha256:${sha256('comment window for A-7')}` }],
  payment: { asset: 'USDC', chain: 'solana', escrow: 5 },
  exits: ['adopt', 'reject', 'revise'],
}

test('verafy.amendment/1: the AMENDMENTS.md example validates, and its hash is canonical', () => {
  assert.equal(AMENDMENT_KIND, 'verafy.amendment/1')
  assert.deepEqual(validateAmendment(A7), [])
  assert.equal(amendmentHash(A7), amendmentHash(JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(A7).reverse())))))
  assert.deepEqual(AMENDMENT_STAGES, ['propose', 'comment', 'constitution-check', 'ethics-check', 'merit', 'challenge', 'seal'])
})

test('verafy.amendment/1: one target, declared exits, cites Block 0, and a known kind', () => {
  const bad = (patch, re) => assert.ok(validateAmendment({ ...A7, ...patch }).some(p => re.test(p)), JSON.stringify(patch))
  bad({ target: ['ethics.neverAllowed', 'constitution.article.1'] }, /exactly one/)
  bad({ target: 'ethics.everything' }, /target must name one/)
  bad({ exits: ['adopt', 'reject'] }, /exits must be exactly/)
  bad({ exits: ['adopt', 'reject', 'revise', 'fast-track'] }, /exits must be exactly/)
  bad({ cites: ['constitution.article.3'] }, /block:0/)
  bad({ amendmentKind: 'remove' }, /amendmentKind/)
  bad({ amendmentKind: 'supersede' }, /supersede amendment replaces an earlier amendment/)
  bad({ id: 'B-1' }, /id must be/)
  bad({ text: '' }, /text is required/)
  bad({ payment: { asset: 'USDC', chain: 'solana', escrow: 0 } }, /escrow/)
  bad({ context: [{ role: 'comment-window', pin: 'sha256:<computed at posting>' }] }, /pin/)
  bad({ kind: 'verafy.asc/1' }, /kind must be/)
  assert.deepEqual(validateAmendment({ ...A7, amendmentKind: 'supersede', target: 'amendment:A-3' }), [])
  assert.deepEqual(validateAmendment({ ...A7, target: 'constitution.article.3.5' }), [])
})

test('entrenched clauses: Extend and Clarify may touch them; Reclassify and Supersede that touch one fail', () => {
  assert.deepEqual(ENTRENCHED.map(e => e.clause), ['Article 1', 'The "Never allowed" list in the Embedded Ethics', 'Article 3.5 (no bypass)', 'Article 2.3 and the two checks in Article 5', 'The rule that Block 0 is never edited'])
  // Adding a Never allowed item is an ordinary Extend: it touches the list and does not weaken it.
  const add = entrenchment(A7)
  assert.equal(add.weakens, false)
  assert.deepEqual(add.touches, ['The "Never allowed" list in the Embedded Ethics'])
  // Removing "No treasury" (Article 1, clause 7) cannot pass.
  const remove = entrenchment({ ...A7, id: 'A-8', amendmentKind: 'reclassify', target: 'constitution.article.1.7', text: 'Remove clause 7 (No treasury) from Article 1.' })
  assert.equal(remove.weakens, true)
  assert.match(remove.problems[0], /reclassify cannot touch an entrenched clause \(Article 1\)/)
  // A clause inside Article 3 touches 3.5 only when it is 3.5 or the whole article.
  assert.deepEqual(entrenchment({ ...A7, amendmentKind: 'clarify', target: 'constitution.article.3' }).touches, ['Article 3.5 (no bypass)'])
  assert.deepEqual(entrenchment({ ...A7, amendmentKind: 'clarify', target: 'constitution.article.3.2' }).touches, [])
  assert.equal(entrenchment({ ...A7, amendmentKind: 'reclassify', target: 'ethics.caseByCase' }).weakens, false)
  // Supersede touches whatever the earlier amendment targeted.
  const earlier = { 'A-3': { ...A7, id: 'A-3', target: 'ethics.neverAllowed' }, 'A-4': { ...A7, id: 'A-4', target: 'ethics.caseByCase' } }
  assert.equal(entrenchment({ ...A7, amendmentKind: 'supersede', target: 'amendment:A-3' }, id => earlier[id]).weakens, true)
  assert.equal(entrenchment({ ...A7, amendmentKind: 'supersede', target: 'amendment:A-4' }, id => earlier[id]).weakens, false)
})

test('adding the amendment kind leaves every existing contract hash and block hash unchanged', () => {
  // Hashes computed on verafyHarness 2320630 (the proving branch) before Part G.
  const golden = {
    'delay-cover.json': 'df77fbc0585ce36a07b13ccb88bb9c52629dd49ec0ed6680d625095f6858ff87',
    'fact-check-escalation.json': '93cee3b79b06407de87caf5cb0ba96910ea99f1b48abd6a3bfaa321011b4a6b3',
    'fact-check.json': 'a6f64dc02727257fd81c77c1dedb9e24155e15b7cc02bf8f843c2586776ff1ad',
    'forecast.json': '0fff4eed4ceb9431ec351f4c6df058bc5bc25e1e7681bfd849f0bd90ea5a45cb',
    'graded-insurance.json': '8b87f258f3c5cc96b0aa2ba8466a60f0bdd5bede5effb06761ccd5c23b033357',
    'market-resolution.json': '595232d4a4ba556bc6d43f1e1d65a1c22842462b649020dd45365aa230f47d5e',
    'milestone-escrow.json': 'b0252971284caa20afc2df3631164b83de1cab8aba02c8b99a8f03eb5b13160a',
    'ranked-prize.json': '8005ce7e5439e0d0e6dad328f07767c554cbae1be4eaed9b6a9d153ecfb7e83b',
  }
  // The v0.0.2 examples, kept as fixtures: v0.0.3 moved the examples to minFamilies, which gives them new hashes,
  // and these pin that a contract written with the old names still keeps its old hash.
  const dir = `${ROOT}packages/core/test/fixtures/v0.0.2`
  const files = readdirSync(dir).filter(f => f.endsWith('.json') && f !== 'mock-answers.json' && f !== 'verafy.config.json').sort()
  assert.deepEqual(files, Object.keys(golden).sort())
  for (const f of files) {
    const asc = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'))
    assert.deepEqual(validate(asc), [], f)
    assert.equal(ascHash(asc), golden[f], f)
    assert.ok(validateAmendment(asc).length > 0, `${f} is not an amendment`)
  }
  const block = seal(null, [{ asc: 'x', n: 1 }], { id: 'node-1', sign: () => 'sig' }, { time: '2026-11-06T00:00:00.000Z' })
  assert.equal(block.hash, '377431ba9c524bfe72550becac7e4301769508316103bd5a2dcb39983c4a2ea1')
  assert.equal('screeningsRoot' in block || 'governanceRoot' in block, false)
  // A block with screenings or governance records carries their roots in the signed header.
  const gov = seal(null, [], { id: 'node-1', sign: () => 'sig' }, { time: '2026-11-06T00:00:00.000Z', governance: [{ stage: 'merit', panels: [{ asc: 'x' }] }] })
  assert.equal(gov.governanceRoot, sha256(sha256({ stage: 'merit', panels: [{ asc: 'x' }] })))
  assert.throws(() => seal(null, [], { id: 'node-1', sign: () => 'sig' }, { governance: [{ stage: 'seal' }] }), /no rulings, no block/)
})

test('a harness may decline a seat on ethics grounds: not counted, never a fault, and the ruling still verifies', async () => {
  const asc = JSON.parse(readFileSync(`${ROOT}examples/fact-check.json`, 'utf8'))
  const jury = CONFIG.pool.slice(0, 5).map(h => new Harness({ ...h, provider: mockProvider(SCRIPT) }))
  const decliner = jury[4]
  decliner.declines = a => a.id === asc.id ? 'I will not grade claims about a named executive (my own policy).' : null
  const ruling = await rule(asc, jury, jury[0], { seed: 'genesis' })
  assert.equal(ruling.votes.length, 4)
  assert.deepEqual(ruling.round.faults, [])
  assert.equal(ruling.round.declines.length, 1)
  assert.equal(ruling.round.declines[0].harness, decliner.id)
  assert.equal(ruling.round.declines[0].kind, DECLINE_KIND)
  assert.equal(ruling.diff.some(d => d.account === `harness:${decliner.id}`), false, 'a declined seat is not paid')
  assert.deepEqual(verifyRuling(asc, ruling), { ok: true, problems: [] })
  // A decline with a broken signature, or on other grounds, does not hold: the seat is a no-commit fault.
  const forged = structuredClone(ruling)
  forged.round.declines[0].reason = 'edited after signing'
  assert.equal(verifyRuling(asc, forged).ok, false)
  const card = decliner.card
  const d = decliner.decline(asc, 'policy')
  assert.equal(checkDecline(card, d, ascHash(asc)), null)
  const { signature, ...m } = { ...d, grounds: 'cost' }
  assert.match(checkDecline(card, { ...m, signature: decliner.sign(m) }, ascHash(asc)), /only on ethics grounds/)
  // A ruling with no declines has no `declines` key, so older rulings are unchanged.
  decliner.declines = null
  const plain = await rule(asc, jury, jury[0], { seed: 'genesis' })
  assert.equal('declines' in plain.round, false)
})
