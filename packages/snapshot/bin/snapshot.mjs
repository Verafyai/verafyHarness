#!/usr/bin/env node
/**
 * Snapshot a GitHub repository at a commit, as a council would read it.
 *
 *   verafy-snapshot https://github.com/<owner>/<name> <40-character sha> [--out snapshot.txt] [--json]
 */
import { writeFileSync } from 'node:fs'
import { snapshotRepo } from '../src/index.js'

const [repo, commit, ...rest] = process.argv.slice(2)
if (!repo || !commit) { console.error('usage: verafy-snapshot <https://github.com/owner/name> <commit sha> [--out file] [--json]'); process.exit(2) }
const s = await snapshotRepo({ repo, commit }).catch(e => { console.error(e.message); process.exit(1) })
const out = rest[rest.indexOf('--out') + 1]
if (rest.includes('--out') && out) writeFileSync(out, s.content)
const { content, ...meta } = s
console.log(rest.includes('--json') ? JSON.stringify(meta, null, 2) : `${s.repo} at ${s.commit}\nsha256 ${s.sha256}\n${s.files} files, ${s.included} included, ${s.truncated.length} truncated, ${s.omitted} left out by the limits`)
