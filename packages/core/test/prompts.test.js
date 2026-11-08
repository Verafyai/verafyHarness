// Every featured ASC template ships with a tailoring prompt that names its
// template, never asks for keys, and ends with the harness call that checks it.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { POLICY_TEMPLATES } from '../src/index.js'

const SLUGS = ['agentic-contract', 'agent-bond', 'super-grant', 'hackathon', 'treasury', 'dao-constitution']

test('each featured template has a prompt in templates/prompts', () => {
  for (const s of SLUGS) {
    assert.ok(POLICY_TEMPLATES[s], `${s} is a policy template`)
    const p = readFileSync(new URL(`../../../templates/prompts/${s}.md`, import.meta.url), 'utf8')
    assert.match(p, new RegExp(`policyFromTemplate\\('${s}'`), `${s}: the prompt shows the call`)
    assert.match(p, /Never ask for or handle private keys/, `${s}: keys stay out`)
    assert.doesNotMatch(p, /[–—]/, `${s}: no em or en dashes`)
  }
})
