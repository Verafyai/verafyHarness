// Verafy Certification (VIP-0034): read a program's report card on Solana.
// Zero dependencies. The program is packages/solana/certification.
import { createHash } from 'node:crypto'
import { b58decode, b58encode } from './tx.js'
import { findPda } from './squads.js'

/** verafy_certification on devnet. */
export const CERTIFICATION_PROGRAM = '1dcJPW3aGMCWDkNV6do6sEUwSxLdf8NtSuQb1teCdXt'
export const CERTIFICATION_DOMAIN = 'verafy-certification/1'
export const CERT_SIZE = 192
export const CERT_LEVELS = ['Not certified', 'Sniffed', 'Fuzzed', 'Hardened']
export const CERTIFICATION_ERRORS = { 100: 'not authorized', 101: 'not a verafy_ruling account', 102: 'ruling not sealed', 103: 'ruling is about something else', 104: 'jury not eligible', 105: 'not newer than the current certification' }

const UPGRADEABLE = 'BPFLoaderUpgradeab1e11111111111111111111111'
const sha = (...parts) => createHash('sha256').update(Buffer.concat(parts.map(p => Buffer.from(p)))).digest()

/** The bytes Solana runs: the ELF up to its section header table, without loader padding. */
export function bytecodeOf(programData) {
  const b = Buffer.from(programData)
  if (b.length >= 64 && b.readUInt32BE(0) === 0x7f454c46) {
    const end = Number(b.readBigUInt64LE(40)) + b.readUInt16LE(58) * b.readUInt16LE(60)
    if (end > 64 && end <= b.length) return b.subarray(0, end)
  }
  let n = b.length
  while (n > 0 && b[n - 1] === 0) n--
  return b.subarray(0, n)
}

/** The contract hash a certification ruling must carry. */
export function certificationContractHash({ program, bytecodeHash, reportHash, score }) {
  return sha(Buffer.from(CERTIFICATION_DOMAIN), b58decode(program), Buffer.from(bytecodeHash, 'hex'), Buffer.from(reportHash, 'hex'), Buffer.from([score])).toString('hex')
}

export const certificationAccount = (program, bytecodeHash, programId = CERTIFICATION_PROGRAM) =>
  findPda(['cert', b58decode(program), Buffer.from(bytecodeHash, 'hex')], programId)

export function decodeCertification(data) {
  const b = Buffer.from(data)
  if (b.length < CERT_SIZE || b.subarray(0, 8).toString() !== 'VRFYCRT1') return null
  return {
    level: b[8], levelName: CERT_LEVELS[b[8]] ?? `Level ${b[8]}`, score: b[9], seats: b[10], families: b[11],
    program: b58encode(b.subarray(16, 48)), bytecodeHash: b.subarray(48, 80).toString('hex'), reportHash: b.subarray(80, 112).toString('hex'),
    ruling: b58encode(b.subarray(112, 144)), certifier: b58encode(b.subarray(144, 176)),
    releasableAfterSlot: Number(b.readBigUInt64LE(176)), certifiedSlot: Number(b.readBigUInt64LE(184)),
  }
}

/**
 * Should an agent trust this program? Hash its current bytecode and read the
 * certification for exactly that build. An upgrade changes the hash, so an
 * old certification never vouches for new code.
 * @param {ReturnType<import('./tx.js').rpc>} rpc
 * @param {string} program - the program address.
 */
export async function lookupCertification(rpc, program, { programId = CERTIFICATION_PROGRAM } = {}) {
  const acct = await rpc.account(program)
  if (!acct?.executable) return { program, certified: false, reason: 'not a program on this cluster' }
  let programData = acct.data
  if (acct.owner === UPGRADEABLE) {
    const pd = await rpc.account(b58encode(acct.data.subarray(4, 36)))
    if (!pd) return { program, certified: false, reason: 'program data account is missing' }
    programData = pd.data.subarray(45)
  }
  const bytecodeHash = sha(bytecodeOf(programData)).toString('hex')
  const address = certificationAccount(program, bytecodeHash, programId).address
  const cert = await rpc.account(address)
  if (!cert || cert.owner !== programId) return { program, bytecodeHash, certificationAccount: address, certified: false, reason: 'no certification for this exact build' }
  const c = decodeCertification(cert.data)
  const slot = await rpc.call('getSlot', [{ commitment: 'confirmed' }])
  const settled = slot >= c.releasableAfterSlot
  return {
    program, bytecodeHash, certificationAccount: address,
    certified: c.level > 0 && settled,
    reason: c.level === 0 ? 'the jury did not certify this build' : settled ? `certified ${c.levelName}` : 'certified, but still inside the challenge window',
    ...c,
  }
}
