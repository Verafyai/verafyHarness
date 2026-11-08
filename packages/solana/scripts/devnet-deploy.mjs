#!/usr/bin/env node
/**
 * Deploy the four Verafy programs (verafy_ruling, verafy_judiciary,
 * verafy_registry, verafy_covenant) to a live cluster under their fixed program
 * ids, then check each one is executable. Programs already deployed are left
 * alone. The payer becomes the upgrade authority.
 *
 *   node packages/solana/scripts/devnet-deploy.mjs --payer payer.json [--rpc https://api.devnet.solana.com] [--out results/devnet-deploy.json]
 *
 * Checks the payer's balance against the rent the programs need before sending
 * anything, and says how much is missing. Needs the solana CLI on PATH and the
 * built programs (cargo build-sbf in each program directory).
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { rpc as rpcClient, keypair } from '../src/index.js'

const HERE = new URL('..', import.meta.url).pathname
const { values: a } = parseArgs({ options: { rpc: { type: 'string', default: 'https://api.devnet.solana.com' }, payer: { type: 'string' }, out: { type: 'string' } } })
if (!a.payer) { console.error('need --payer <keypair.json>'); process.exit(2) }
const PROGRAMS = [
  ['verafy_ruling', 'program'],
  ['verafy_judiciary', 'judiciary'],
  ['verafy_registry', 'registry'],
  ['verafy_covenant', 'covenant'],
].map(([name, dir]) => {
  const so = join(HERE, dir, 'target/deploy', `${name}.so`)
  const kp = join(HERE, dir, 'target/deploy', `${name}-keypair.json`)
  return { name, so, kp, id: keypair(JSON.parse(readFileSync(kp, 'utf8'))).address, bytes: statSync(so).size }
})
const rpc = rpcClient(a.rpc)
const payer = keypair(JSON.parse(readFileSync(a.payer, 'utf8')))
const cli = (...args) => execFileSync('solana', [...args, '-u', a.rpc, '-k', a.payer, '--commitment', 'confirmed'], { stdio: 'pipe' }).toString()

const todo = []
for (const p of PROGRAMS) {
  const acct = await rpc.account(p.id).catch(() => null)
  p.already = Boolean(acct?.executable)
  if (!p.already) todo.push(p)
}
// Program data rent (the program plus its 45-byte header) is kept; a buffer of the
// same size is rented during the deploy and refunded after. Keep a margin for fees.
const need = (await Promise.all(todo.map(async p => 2 * (await rpc.rent(p.bytes + 45)) + (await rpc.rent(36))))).reduce((s, x) => s + x, 0) + 50_000_000
const have = await rpc.balance(payer.address)
console.log(`payer ${payer.address}: ${have / 1e9} SOL; ${todo.length} program(s) to deploy need about ${(need / 1e9).toFixed(3)} SOL`)
if (have < need) {
  console.error(`not enough SOL: fund ${payer.address} with at least ${((need - have) / 1e9).toFixed(3)} more on ${a.rpc} (https://faucet.solana.com for devnet), then run this again`)
  process.exit(3)
}
for (const p of todo) {
  const out = cli('program', 'deploy', p.so, '--program-id', p.kp, '--use-rpc')
  p.signature = out.match(/Signature: (\w+)/)?.[1] ?? null
  console.log(`deployed ${p.name} at ${p.id}${p.signature ? ` (${p.signature.slice(0, 12)}...)` : ''}`)
}
for (const p of PROGRAMS) {
  const acct = await rpc.account(p.id)
  p.executable = Boolean(acct?.executable)
  console.log(`${p.executable ? 'ok  ' : 'FAIL'} ${p.name} ${p.id}${p.already ? ' (already deployed)' : ''}`)
}
const version = (await rpc.call('getVersion'))['solana-core']
const summary = { date: new Date().toISOString(), cluster: a.rpc, version, payer: payer.address, upgradeAuthority: payer.address, spentLamports: have - (await rpc.balance(payer.address)), programs: PROGRAMS.map(({ name, id, bytes, already, signature, executable }) => ({ name, id, bytes, already, signature: signature ?? null, executable })) }
if (a.out) writeFileSync(a.out, JSON.stringify(summary, null, 2) + '\n')
process.exit(PROGRAMS.every(p => p.executable) ? 0 : 1)
