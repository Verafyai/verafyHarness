import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  serveConfig, checkServeConfig, isLocalEndpoint, recommend, fits, memoryNeededGb, tierFor,
  cloudInit, sq, CLOUDS, serverName, plan, envFile, parseEnvFile, redact, sizeFor, apply, startServe,
} from '../src/index.js'

test('serve config comes from the environment, which wins over the file', () => {
  const c = serveConfig({ harness: { family: 'gpt-oss', model: 'x', bond: 9 }, nodes: ['http://a'] }, { VERAFY_FAMILY: 'qwen', VERAFY_NODES: 'http://b, http://c', VERAFY_PORT: '8000' })
  assert.equal(c.harness.family, 'qwen')
  assert.equal(c.harness.model, 'x')
  assert.deepEqual(c.nodes, ['http://b', 'http://c'])
  assert.equal(c.port, 8000)
  assert.equal(c.publicUrl, 'http://127.0.0.1:8000')
})

test('checks say what is missing; a local model server needs no key', () => {
  assert.equal(checkServeConfig(serveConfig({}, {}), {}).length, 3)
  const local = serveConfig({}, { VERAFY_FAMILY: 'qwen', VERAFY_MODEL: 'qwen3:4b', VERAFY_BASE_URL: 'http://127.0.0.1:11434/v1' })
  assert.deepEqual(checkServeConfig(local, {}), [])
  assert.ok(isLocalEndpoint('http://host.docker.internal:11434/v1'))
  assert.ok(!isLocalEndpoint('https://openrouter.ai/api/v1'))
  const remote = serveConfig({}, { VERAFY_FAMILY: 'qwen', VERAFY_MODEL: 'm', VERAFY_MOCK: '1', VERAFY_NODES: 'https://node.example' })
  assert.match(checkServeConfig(remote, {}).join(), /VERAFY_PUBLIC_URL/)
})

test('hardware profiles: modeled memory, tiers, and a pick per machine', () => {
  assert.equal(memoryNeededGb(8), 6)
  assert.equal(tierFor(4), 'small'); assert.equal(tierFor(27), 'mid'); assert.equal(tierFor(70), 'frontier')
  assert.equal(recommend({ memGb: 4 }).kind, 'hosted')
  const gpu = recommend({ memGb: 64, gpuMemGb: 24 })
  assert.equal(gpu.kind, 'local')
  assert.ok(gpu.model.needGb <= 24)
  assert.ok(fits({ memGb: 16 }).every(m => m.needGb <= 14 && m.on === 'cpu'))
  assert.equal(recommend({ memGb: 64, gpuMemGb: 24 }, { family: 'llama' }).model.family, 'llama')
})

test('user data: quotes values, refuses bad names and refs, never runs as root', () => {
  const s = cloudInit({ env: { VERAFY_FAMILY: 'mistral', VERAFY_API_KEY: "a'b" }, cloud: 'hetzner' })
  assert.match(s, /VERAFY_API_KEY='a'\\''b'/)
  assert.match(s, /hetzner\/v1\/metadata\/public-ipv4/)
  assert.match(s, /User=verafy/)
  assert.match(s, /ufw allow 7200\/tcp/)
  assert.doesNotMatch(s, /ollama/)
  assert.match(cloudInit({ env: {}, ollamaTag: 'qwen3:4b' }), /ollama pull qwen3:4b/)
  assert.throws(() => cloudInit({ env: { 'bad;name': 'x' } }))
  assert.throws(() => cloudInit({ env: {}, ref: 'main; rm -rf /' }))
  assert.throws(() => cloudInit({ env: {}, ollamaTag: 'x$(id)' }))
  assert.equal(sq("it's"), "'it'\\''s'")
})

test('every target plans; keys only in mode-600 files or user data', () => {
  const base = { family: 'mistral', model: 'mistralai/mistral-small-3.2-24b-instruct', apiKey: 'sk-test-123456', nodes: ['https://n1'], id: 'h-mistral-1' }
  const local = plan({ ...base, target: 'local', publicUrl: 'https://me.example' })
  assert.equal(local.files[0].mode, 0o600)
  assert.match(local.files[0].content, /VERAFY_API_KEY='sk-test-123456'/)
  const docker = plan({ ...base, target: 'docker', kind: 'local', model: 'qwen3:8b', family: 'qwen', apiKey: undefined })
  assert.match(docker.steps.at(-1), /docker run .*ghcr.io\/verafyai\/verafy-harness:latest/)
  assert.match(docker.steps.at(-1), /host-gateway/)
  assert.equal(docker.env.VERAFY_BASE_URL, 'http://host.docker.internal:11434/v1')
  const doPlan = plan({ ...base, target: 'digitalocean' })
  assert.equal(doPlan.cloud.plan, 's-1vcpu-2gb')
  assert.equal(doPlan.cloud.name, 'verafy-h-mistral-1')
  assert.ok(doPlan.warnings.some(w => /spending limit/.test(w)))
  const hz = plan({ ...base, target: 'hetzner', kind: 'local', family: 'qwen', model: 'qwen3:14b', apiKey: undefined })
  assert.equal(hz.cloud.plan, 'cx42')
  assert.match(hz.cloud.userData, /ollama pull qwen3:14b/)
  assert.ok(plan({ ...base, target: 'user-data' }).files[0].print)
  assert.throws(() => plan({ ...base, target: 'local', apiKey: undefined }), /API key/)
  assert.throws(() => plan({ ...base, target: 'mars' }))
  assert.equal(sizeFor('qwen3:4b'), 'small')
  const shown = JSON.stringify(redact(doPlan))
  assert.doesNotMatch(shown, /sk-test-123456/)
})

test('env files round-trip', () => {
  const env = { A: "it's", B: 'x=y', C: '' }
  assert.deepEqual(parseEnvFile(envFile(env)), env)
  assert.deepEqual(parseEnvFile('X=1\n# c\nY="two"\n'), { X: '1', Y: 'two' })
})

test('cloud apply creates one server and waits for its address (fake API)', async () => {
  const calls = []
  const fetch = async (url, init = {}) => {
    calls.push({ url, method: init.method ?? 'GET', auth: init.headers.authorization, body: init.body && JSON.parse(init.body) })
    const reply = body => ({ ok: true, status: 200, json: async () => body })
    if (init.method === 'POST') return reply({ droplet: { id: 42 } })
    return reply({ droplet: { id: 42, status: 'active', networks: { v4: [{ type: 'public', ip_address: '203.0.113.9' }] } } })
  }
  const p = plan({ target: 'digitalocean', family: 'mistral', model: 'm', mock: true, id: 'h-1' })
  p.files = []
  const r = await apply(p, { env: { DIGITALOCEAN_TOKEN: 'do-token' }, fetch, say: () => {}, waitMs: 1 })
  assert.equal(r.server.url, 'http://203.0.113.9:7200')
  assert.equal(calls[0].method, 'POST')
  assert.equal(calls[0].auth, 'Bearer do-token')
  assert.equal(calls[0].body.size, 's-1vcpu-2gb')
  assert.match(calls[0].body.user_data, /verafy-harness.service/)
  await assert.rejects(apply(p, { env: {}, fetch, say: () => {} }), /DIGITALOCEAN_TOKEN/)
})

test('hetzner client posts the right body', async () => {
  let body
  const fetch = async (url, init) => { body = JSON.parse(init.body); return { ok: true, json: async () => ({ server: { id: 7 } }) } }
  const r = await CLOUDS.hetzner.create({ token: 't', name: serverName('H_Qwen 1'), plan: 'cx22', region: 'hil', userData: '#!/bin/bash', fetch })
  assert.equal(r.id, '7')
  assert.equal(body.name, 'verafy-h-qwen-1')
  assert.equal(body.image, 'ubuntu-24.04')
})

test('startServe keeps one id per data directory', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'serve-'))
  const c = serveConfig({}, { VERAFY_FAMILY: 'qwen', VERAFY_MODEL: 'm', VERAFY_MOCK: '1', VERAFY_PORT: '0', VERAFY_DATA_DIR: dataDir })
  const d1 = await startServe(c, { env: {}, log: () => {} })
  const id = d1.harness.id
  await d1.stop()
  const d2 = await startServe(c, { env: {}, log: () => {} })
  assert.equal(d2.harness.id, id)
  assert.equal(d2.harness.identity.publicKey, d1.harness.identity.publicKey)
  await d2.stop()
})

test('a local testnet: one daemon per family, juries over HTTP, sealed blocks', async () => {
  const { testnetUp } = await import('../src/index.js')
  const dir = mkdtempSync(join(tmpdir(), 'testnet-'))
  const r = await testnetUp({ dir, basePort: 7401, say: () => {} })
  assert.equal(r.blocks.length, 3)
  assert.deepEqual(r.blocks.map(b => b.height), [1, 2, 3])
  assert.equal(r.blocks[1].parent, r.blocks[0].hash)
  assert.ok(r.blocks.every(b => b.rulings[0].passed))
})
