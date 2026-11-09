import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateCharter, validateCharterAmendment, applyCharterAmendment, charterAmendmentContract, charterHash, validate } from '../src/index.js'

const charter = {
  kind: 'verafy.charter/1', name: 'Fuzzy', version: 1,
  review: { fee: '10000000', bar: 0.8, jury: { size: 5, minFamilies: 3 } },
  articles: [
    { id: '1', text: 'Only a finding reproduced by a transaction counts toward a score or a certification.', protected: true },
    { id: '2', text: 'A certification names one exact build of a program.', protected: true },
    { id: '3', text: 'Sniff costs 100 credits.' },
  ],
}

const amendment = (changes, over = {}) => ({ kind: 'verafy.charter-amendment/1', charter: charterHash(charter), title: 'Price Sniff at 80 credits', rationale: 'Cheaper first runs.', changes, ...over })

test('a well-formed charter and amendment validate', () => {
  assert.deepEqual(validateCharter(charter), [])
  assert.deepEqual(validateCharterAmendment(charter, amendment([{ op: 'replace', id: '3', text: 'Sniff costs 80 credits.' }])), [])
})

test('an amendment must name the current charter version and real articles', () => {
  assert.ok(validateCharterAmendment(charter, amendment([{ op: 'replace', id: '9', text: 'x' }])).some(p => /unknown article 9/.test(p)))
  assert.ok(validateCharterAmendment(charter, amendment([{ op: 'replace', id: '3', text: 'x' }], { charter: 'old' })).some(p => /current charter/.test(p)))
})

test('applying an amendment makes a new version and keeps the old one intact', () => {
  const after = applyCharterAmendment(charter, amendment([{ op: 'replace', id: '3', text: 'Sniff costs 80 credits.' }]))
  assert.equal(after.version, 2)
  assert.equal(after.articles.find(a => a.id === '3').text, 'Sniff costs 80 credits.')
  assert.equal(charter.articles.find(a => a.id === '3').text, 'Sniff costs 100 credits.')
})

test('the jury contract quotes every protected article and is a valid ASC', () => {
  const c = charterAmendmentContract(charter, amendment([{ op: 'remove', id: '1' }], { title: 'Count leads too' }))
  assert.deepEqual(validate(c), [])
  assert.match(c.instructions, /Protected article 1:/)
  assert.match(c.instructions, /Protected article 2:/)
  assert.deepEqual(c.question.answer.options, ['ADOPT', 'REJECT'])
})
