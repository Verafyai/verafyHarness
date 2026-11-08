/**
 * Repository snapshots (VIP-0031): what a council reads when it grades a
 * hackathon submission. A snapshot is a deterministic text rendering of a
 * GitHub repository at one commit: a header, the full file tree, then the text
 * of the files that matter most, within fixed limits. The same repository and
 * commit always give the same bytes, so anyone can rebuild a snapshot and check
 * its hash against the one pinned in the jury's contract.
 *
 * No dependencies: node:zlib for gzip, a small tar reader for the archive.
 * @module @verafyharness/snapshot
 */
import { gunzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'

export const SNAPSHOT_KIND = 'verafy.repo-snapshot/1'
/** The limits are part of the format: change them and every hash changes. */
export const LIMITS = Object.freeze({ totalBytes: 240_000, fileBytes: 24_000, treeEntries: 2_000, archiveBytes: 200_000_000 })
const REPO = /^https:\/\/github\.com\/([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9._-]{1,100})$/
const COMMIT = /^[0-9a-f]{40}$/
const sha256 = b => createHash('sha256').update(b).digest('hex')

/**
 * Read a tar archive (ustar, with GNU and PAX long names).
 * @param {Buffer} tar - the uncompressed archive.
 * @returns {{path: string, size: number, data: Buffer}[]} regular files.
 */
export function readTar(tar) {
  const files = []
  let off = 0
  let longName = null
  let pax = null
  const str = (b, s, n) => b.subarray(s, s + n).toString('utf8').replace(/\0.*$/s, '')
  while (off + 512 <= tar.length) {
    const h = tar.subarray(off, off + 512)
    if (h.every(x => x === 0)) break
    const size = parseInt(str(h, 124, 12).trim() || '0', 8)
    const type = String.fromCharCode(h[156] || 48)
    const prefix = str(h, 345, 155)
    let name = (prefix ? prefix + '/' : '') + str(h, 0, 100)
    const body = tar.subarray(off + 512, off + 512 + size)
    off += 512 + Math.ceil(size / 512) * 512
    if (type === 'L') { longName = body.toString('utf8').replace(/\0.*$/s, ''); continue }
    if (type === 'x') { pax = Object.fromEntries(body.toString('utf8').split('\n').filter(Boolean).map(l => l.slice(l.indexOf(' ') + 1)).map(kv => [kv.slice(0, kv.indexOf('=')), kv.slice(kv.indexOf('=') + 1)])); continue }
    if (type === 'g') continue
    if (longName) { name = longName; longName = null }
    if (pax?.path) { name = pax.path }
    pax = null
    if (type === '0' || type === '\0' || type === '7') files.push({ path: name, size, data: Buffer.from(body) })
  }
  return files
}

const SKIP_DIR = /(^|\/)(node_modules|vendor|dist|build|target|\.git|\.next|out|coverage|__pycache__|\.venv|venv)\//
const SKIP_FILE = /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|Cargo\.lock|poetry\.lock|bun\.lockb|go\.sum)$|\.(png|jpe?g|gif|webp|ico|svg|pdf|zip|gz|tgz|tar|so|dylib|dll|exe|bin|wasm|woff2?|ttf|otf|mp3|mp4|mov|webm|lock|min\.js|map)$/i
const isText = b => { const n = Math.min(b.length, 8000); for (let i = 0; i < n; i++) if (b[i] === 0) return false; return true }

/** Which files a grader reads first: the README, then manifests, then source, then the rest. */
export function priority(path) {
  const base = path.split('/').pop().toLowerCase()
  const depth = path.split('/').length - 1
  if (/^readme(\.|$)/.test(base)) return depth === 0 ? 0 : 3
  if (/^(package\.json|cargo\.toml|pyproject\.toml|go\.mod|anchor\.toml|requirements\.txt|makefile|dockerfile)$/.test(base)) return depth === 0 ? 1 : 4
  if (/^(license|licence|copying)(\.|$)/.test(base)) return 2
  if (/(^|\/)(src|programs|lib|app|contracts|cmd|pkg)\//.test(path) && /\.(rs|ts|tsx|js|mjs|py|go|sol|move|c|h|cpp|swift|kt)$/.test(base)) return 5
  if (/\.(rs|ts|tsx|js|mjs|py|go|sol|move|c|h|cpp|swift|kt)$/.test(base)) return 6
  if (/(^|\/)(test|tests|__tests__|spec)\//.test(path)) return 7
  if (/\.(md|txt|toml|yaml|yml|json)$/.test(base)) return 8
  return 9
}

/**
 * Render a snapshot from a repository archive.
 * @param {Buffer} tarball - the .tar.gz GitHub serves for the commit.
 * @param {{repo: string, commit: string}} at - the repository URL and the full commit SHA.
 * @returns {{kind: string, repo: string, commit: string, content: string, sha256: string, files: number, included: number, truncated: string[], omitted: number}} the snapshot.
 */
export function snapshotFromTarball(tarball, { repo, commit }) {
  if (!REPO.test(repo)) throw new Error('repo must be https://github.com/<owner>/<name>')
  if (!COMMIT.test(commit)) throw new Error('commit must be a full 40-character SHA')
  if (tarball.length > LIMITS.archiveBytes) throw new Error(`the archive is over ${LIMITS.archiveBytes} bytes`)
  const all = readTar(gunzipSync(tarball))
  // GitHub prefixes every path with "<owner>-<name>-<sha>/": strip the first segment.
  const files = all.map(f => ({ ...f, path: f.path.split('/').slice(1).join('/') })).filter(f => f.path && !f.path.endsWith('/'))
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  const tree = files.slice(0, LIMITS.treeEntries).map(f => `${f.path}  ${f.size}`)
  const candidates = files.filter(f => !SKIP_DIR.test(f.path) && !SKIP_FILE.test(f.path) && isText(f.data))
    .sort((a, b) => priority(a.path) - priority(b.path) || (a.path < b.path ? -1 : 1))
  const parts = []
  const truncated = []
  let used = 0
  let included = 0
  for (const f of candidates) {
    if (used >= LIMITS.totalBytes) break
    let text = f.data.toString('utf8')
    let cut = false
    if (Buffer.byteLength(text) > LIMITS.fileBytes) { text = f.data.subarray(0, LIMITS.fileBytes).toString('utf8'); cut = true }
    const room = LIMITS.totalBytes - used
    if (Buffer.byteLength(text) > room) { text = Buffer.from(text).subarray(0, room).toString('utf8'); cut = true }
    if (cut) truncated.push(f.path)
    const block = `\n===== ${f.path} (${f.size} bytes${cut ? ', truncated' : ''}) =====\n${text}\n`
    parts.push(block)
    used += Buffer.byteLength(text)
    included++
  }
  const header = [
    `${SNAPSHOT_KIND}`,
    `repo: ${repo}`,
    `commit: ${commit}`,
    `files: ${files.length}${files.length > LIMITS.treeEntries ? ` (tree shows the first ${LIMITS.treeEntries})` : ''}`,
    `included: ${included} file(s), ${used} bytes of text, ${truncated.length} truncated, ${candidates.length - included} text file(s) left out by the limits`,
    'This is the repository at the pinned commit. Work that is not here does not count.',
    '',
    '===== file tree (path, bytes) =====',
    ...tree,
  ].join('\n')
  const content = header + '\n' + parts.join('')
  return { kind: SNAPSHOT_KIND, repo, commit, content, sha256: sha256(content), files: files.length, included, truncated, omitted: candidates.length - included }
}

/**
 * Fetch the archive of a repository at a commit from GitHub.
 * @param {{repo: string, commit: string}} at - the repository and commit.
 * @param {{fetch?: typeof fetch}} [o] - a fetch to use.
 * @returns {Promise<Buffer>} the .tar.gz bytes.
 */
export async function fetchTarball({ repo, commit }, { fetch: f = globalThis.fetch } = {}) {
  const m = repo.match(REPO)
  if (!m) throw new Error('repo must be https://github.com/<owner>/<name>')
  if (!COMMIT.test(commit)) throw new Error('commit must be a full 40-character SHA')
  const res = await f(`https://codeload.github.com/${m[1]}/${m[2]}/tar.gz/${commit}`, { redirect: 'follow' })
  if (!res.ok) throw new Error(`GitHub returned ${res.status} for ${repo} at ${commit}: the repository may be private, renamed, or missing that commit`)
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length > LIMITS.archiveBytes) throw new Error(`the archive is over ${LIMITS.archiveBytes} bytes`)
  return buf
}

/**
 * Fetch and render in one step.
 * @param {{repo: string, commit: string}} at - the repository and commit.
 * @param {{fetch?: typeof fetch}} [o] - a fetch to use.
 */
export async function snapshotRepo(at, o) {
  return snapshotFromTarball(await fetchTarball(at, o), at)
}
