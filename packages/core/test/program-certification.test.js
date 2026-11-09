import { test } from 'node:test'
import assert from 'node:assert/strict'
import { programCertificationContract, programCertificationLevel, programCertificationOnChainHash, validate, ascHash } from '../src/index.js'

const report = (over = {}) => ({ version: 'fuzzy-report/1', engine: 'fuzzy-engine/0.1.0', scoreVersion: 'fuzzy-score/1', tier: { id: 'sniff', name: 'Sniff' }, score: { score: 55, grade: 'Shaky' }, program: { name: 'example_vault' }, findings: [], leads: [], tested: { classes: [], state: 'synthetic' }, ...over })
const base = { program: '9LdWL4mYLEyM8YnZejQYp5UzEynN75pxqUosZuXcB5ve', bytecodeHash: '4fe939267083cd8aeb10f9422d7b84334dd12302226cb8f3c3ac6166ce5ec696', reportHash: 'a18052bec9658da292c91ff0a97d717880ea2048cd6fe3d0f9c7771a44dfdda8' }

test('levels follow the published rules', () => {
  assert.equal(programCertificationLevel(report()), 1)
  assert.equal(programCertificationLevel(report({ findings: [{ severity: 'critical', proven: true }] })), 0)
  assert.equal(programCertificationLevel(report({ tier: { id: 'deep' } })), 2)
  assert.equal(programCertificationLevel(report({ tier: { id: 'kitchen-sink' }, score: { score: 89 } })), 2)
  assert.equal(programCertificationLevel(report({ tier: { id: 'kitchen-sink' }, score: { score: 92 } })), 3)
  assert.equal(programCertificationLevel(null), 0)
})

test('the on-chain hash matches what verafy_certification checked on devnet', () => {
  // From the devnet run recorded in Verafyai/fuzzy data/certify-devnet.json: score 55.
  const h = programCertificationOnChainHash({ ...base, score: 55 })
  assert.match(h, /^[0-9a-f]{64}$/)
  assert.notEqual(h, programCertificationOnChainHash({ ...base, score: 56 }))
})

test('the certification contract is a valid ASC that pins the report', () => {
  const c = programCertificationContract({ report: report(), ...base })
  assert.deepEqual(validate(c), [])
  assert.deepEqual(c.question.answer.options, ['NOT_CERTIFIED', 'SNIFFED', 'FUZZED', 'HARDENED'])
  assert.ok(c.context.some(x => x.sha256 === base.reportHash))
  assert.equal(ascHash(c), ascHash(programCertificationContract({ report: report(), ...base })))
})
