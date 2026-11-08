// Repository snapshots (VIP-0031): deterministic, limited, and pinned to one commit.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gzipSync, gunzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import { readTar, snapshotFromTarball, snapshotRepo, priority, LIMITS } from '../src/index.js'

const SHA = 'a'.repeat(40)
const REPO = 'https://github.com/ada/escrow-agents'
// A minimal ustar writer, as GitHub's archives are built.
function tar(files) {
  const blocks = []
  for (const [path, body] of files) {
    const data = Buffer.from(body)
    const h = Buffer.alloc(512)
    h.write(path, 0, 100)
    h.write('0000644\0', 100); h.write('0000000\0', 108); h.write('0000000\0', 116)
    h.write(data.length.toString(8).padStart(11, '0') + '\0', 124)
    h.write('00000000000\0', 136)
    h.write('        ', 148)
    h.write('0', 156)
    h.write('ustar\0' + '00', 257)
    let sum = 0
    for (const b of h) sum += b
    h.write(sum.toString(8).padStart(6, '0') + '\0 ', 148)
    blocks.push(h, data, Buffer.alloc((512 - (data.length % 512)) % 512))
  }
  blocks.push(Buffer.alloc(1024))
  return gzipSync(Buffer.concat(blocks))
}
const P = `ada-escrow-agents-${SHA.slice(0, 7)}/`
const archive = tar([
  [P + 'README.md', '# Escrow agents\nTwo agents settle through a signed contract.'],
  [P + 'src/escrow.ts', 'export const pay = () => 1\n'],
  [P + 'package-lock.json', '{"huge": true}'],
  [P + 'node_modules/x/index.js', 'module.exports = 1'],
  [P + 'logo.png', '\x89PNG\0\0\0'],
  [P + 'notes/big.txt', 'x'.repeat(LIMITS.fileBytes + 500)],
])

test('reads the archive and renders the same bytes every time', () => {
  assert.equal(readTar(gunzipSync(archive)).length, 6)
  const a = snapshotFromTarball(archive, { repo: REPO, commit: SHA })
  const b = snapshotFromTarball(archive, { repo: REPO, commit: SHA })
  assert.equal(a.content, b.content)
  assert.equal(a.sha256, createHash('sha256').update(a.content).digest('hex'))
  assert.match(a.content, new RegExp(`commit: ${SHA}`))
})

test('the README and source come first; lockfiles, vendored code and binaries stay out; big files are cut', () => {
  const s = snapshotFromTarball(archive, { repo: REPO, commit: SHA })
  const order = [...s.content.matchAll(/^===== (\S+) \(/gm)].map(m => m[1]).filter(p => p !== 'file')
  assert.deepEqual(order, ['README.md', 'src/escrow.ts', 'notes/big.txt'])
  assert.ok(s.content.includes('package-lock.json  14'), 'every file is still listed in the tree')
  assert.deepEqual(s.truncated, ['notes/big.txt'])
  assert.ok(priority('README.md') < priority('src/a.rs') && priority('src/a.rs') < priority('docs/notes.md'))
})

test('only a GitHub repository and a full commit', async () => {
  assert.throws(() => snapshotFromTarball(archive, { repo: 'https://gitlab.com/a/b', commit: SHA }), /github\.com/)
  assert.throws(() => snapshotFromTarball(archive, { repo: REPO, commit: 'main' }), /40-character/)
  const seen = []
  const s = await snapshotRepo({ repo: REPO, commit: SHA }, { fetch: async url => { seen.push(url); return { ok: true, arrayBuffer: async () => archive } } })
  assert.equal(seen[0], `https://codeload.github.com/ada/escrow-agents/tar.gz/${SHA}`)
  assert.equal(s.included, 3)
  await assert.rejects(snapshotRepo({ repo: REPO, commit: SHA }, { fetch: async () => ({ ok: false, status: 404 }) }), /404/)
})

