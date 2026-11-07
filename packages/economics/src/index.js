/**
 * Verafy Harness economics: what a proven block costs, how proof packing
 * changes it, and what each role earns. Pure functions, no I/O, no
 * dependencies. Every output is MODELED from the inputs; each default carries
 * its own label and source.
 *
 * The site (harness.verafy.ai/economics) inlines this file at build time, so
 * the page and the tests run the same math.
 */

/** Defaults, each with its label and source. */
export const DEFAULTS = {
  gpuHourUsd: { value: 4.0, label: 'modeled', source: 'Typical on-demand H100 80 GB, about $3.19 to $4.50 per GPU-hour (Spheron, Lambda, Crusoe, Hyperbolic, Nebius, Jul to Nov 2026). Low about $2.87, hyperscaler high about $12.29.', url: 'https://www.spheron.network/blog/h100-price-per-hour-2026/', date: '2026-11-06' },
  proverBatch: { value: 24, label: 'vendor-reported', source: 'FlashProve, one H100', url: 'https://anthropic.com/research/provable-inference', date: '2026-11' },
  proverBatchSeconds: { value: 223, label: 'vendor-reported', source: 'FlashProve online phase for a batch of 24, one H100', url: 'https://anthropic.com/research/provable-inference', date: '2026-11' },
  setupMinutes: { value: 39, label: 'vendor-reported', source: 'FlashProve one-time setup per model', url: 'https://anthropic.com/research/provable-inference', date: '2026-11' },
  requestsPerCommitment: { value: 16e6, label: 'vendor-reported', source: 'FlashProve: one commitment covers about 16 million requests', url: 'https://anthropic.com/research/provable-inference', date: '2026-11' },
  contextTokens: { value: 1024, label: 'vendor-reported', source: 'FlashProve context limit per proven request', url: 'https://anthropic.com/research/provable-inference', date: '2026-11' },
  proofMB: { value: 18.78, label: 'vendor-reported', source: 'FlashProve proof size', url: 'https://anthropic.com/research/provable-inference', date: '2026-11' },
  verifySeconds: { value: 17, label: 'vendor-reported', source: 'FlashProve verification on 24 CPU threads, including offline-phase checks (conservative)', url: 'https://anthropic.com/research/provable-inference', date: '2026-11' },
  cpuHourUsd: { value: 1.0, label: 'illustrative', source: 'A 24-thread verifier box. Set your own.' },
  jurors: { value: 5, label: 'prototype default', source: 'Verafy Harness juries' },
  verifiersPerProof: { value: 2, label: 'illustrative', source: 'Verifiers drawn per proof' },
  storageUsdPerGBMonth: { value: 0.02, label: 'illustrative', source: 'Availability-layer storage. Set your own.' },
  retentionMonths: { value: 3, label: 'illustrative', source: 'Proofs kept through the challenge window and archive' },
  warmupMinutes: { value: 15, label: 'illustrative', source: 'Loading weights and artifacts per proving session. Measure it.' },
  contracts: { value: 24, label: 'input', source: 'Contracts in the block' },
  tokensPerContract: { value: 800, label: 'input', source: 'Instructions, context and answer for one contract' },
  marginPct: { value: 30, label: 'input', source: 'Operator margin over cost' },
  utilizationPct: { value: 50, label: 'input', source: 'Share of rented GPU hours spent proving' },
  packing: { value: false, label: 'design', source: 'Proof packing: briefs, several decisions per proven request' },
  proveOnce: { value: false, label: 'design', source: 'Prove each request once while only one model is provable' },
  decisionsPerRequest: { value: 4, label: 'illustrative', source: 'Packed decisions per 1,024-token request' },
  briefMaxTokens: { value: 200, label: 'illustrative', source: 'Token budget for one decision brief' },
  answerTokensPerDecision: { value: 40, label: 'illustrative', source: 'Tokens reserved for each packed answer line' },
  headerTokens: { value: 64, label: 'illustrative', source: 'Fixed juror rules and answer format at the top of a packed request' },
  atomize: { value: false, label: 'design', source: 'Atomize: split each contract into small yes or no questions, dedupe them across contracts, pack as many as fit' },
  atomsPerContract: { value: 2, label: 'illustrative', source: 'Atoms one contract breaks into' },
  atomTokens: { value: 50, label: 'measured', source: 'Tokens per packed atom slot, question plus one cited fact, counted by packages/pack (about four characters per token)', url: 'https://github.com/Verafyai/verafyHarness/tree/main/packages/pack', date: '2026-11-06' },
  reasoningTokens: { value: 0, label: 'input', source: 'Reasoning each proven juror writes per atom; every token uses the 1,024-token window' },
  atomAnswerTokens: { value: 6, label: 'illustrative', source: 'Tokens reserved per atom answer line, such as "S12: YES"' },
  atomHeaderTokens: { value: 94, label: 'measured', source: 'Tokens in the packed-request header used by packages/pack', url: 'https://github.com/Verafyai/verafyHarness/tree/main/packages/pack', date: '2026-11-06' },
  dedupePct: { value: 0, label: 'input', source: 'Share of atoms already asked by another contract in the same block' },
  screen: { value: false, label: 'design', source: 'A fast System 1 screen (for example TypeSafe Jev) answers atoms first' },
  screenPct: { value: 0, label: 'illustrative', source: 'Share of atoms the screen settles, only where the contract allows a screen to settle them' },
  screenFidelityPct: { value: 0, label: 'illustrative', source: 'Share of brief and plan fidelity checks the screen settles; the rest go to the unproven multi-family panel' },
  screenUsd: { value: 0.0004, label: 'vendor-reported', source: 'TypeSafe Jev, about $0.0004 a decision in 70 to 500 ms; not reproduced', url: 'https://thenewstack.io/typesafe-jev-system-one/', date: '2026-11' },
  fidelityCheckUsd: { value: 0.0163 / 5, label: 'measured', source: 'One unproven multi-family check per brief, from the measured live run: $0.0163 for five contracts', url: 'https://github.com/Verafyai/verafyHarness/blob/main/results/live-2026-11-06.md', date: '2026-11-06' },
}

/** Presets: overrides on DEFAULTS. */
export const PRESETS = {
  unpacked: { name: 'L2, FlashProve, unpacked', values: {} },
  packed: { name: 'L2, FlashProve, proof packing', values: { packing: true, proveOnce: true } },
  atomized: { name: 'L2, FlashProve, atomized', values: { atomize: true, proveOnce: true } },
  jev: { name: 'L2, atomized, with a Jev screen', note: 'The screen settles half the atoms and 70% of the fidelity checks here (illustrative), only where a contract allows it. Screened atoms are not proven: a hosted, closed model cannot carry a proof of inference.', values: { atomize: true, proveOnce: true, screen: true, screenPct: 50, screenFidelityPct: 70 } },
  deepprove: {
    name: 'L2 prototype, DeepProve on CPU (Gemma 3)',
    note: 'Gemma 3: 19 min to prove, 4.3 s to verify, 27 MiB per proof, 512-token sequences, on a 24-core 504 GB CPU server (vendor-reported, Lagrange DeepProve). For testing the pipeline, not for real juries.',
    values: { gpuHourUsd: 3.0, proverBatch: 1, proverBatchSeconds: 19 * 60, contextTokens: 512, proofMB: 27 * 1.048576, verifySeconds: 4.3, warmupMinutes: 5 },
  },
}

/** Plain values from DEFAULTS, with optional overrides. */
export function inputs(overrides = {}) {
  const out = {}
  for (const [k, d] of Object.entries(DEFAULTS)) out[k] = d.value
  return { ...out, ...overrides }
}

/**
 * Estimate the cost of one proven block and the earnings of each role.
 * @param {object} raw - inputs; anything missing falls back to DEFAULTS.
 * @returns {object} modeled outputs, all in US dollars, seconds, or GB.
 */
export function estimate(raw = {}) {
  const i = inputs(raw)
  const ceil = Math.ceil
  const secondsPerProof = i.proverBatchSeconds / i.proverBatch
  const proveUsd = secondsPerProof / 3600 * i.gpuHourUsd
  const setupUsd = (i.setupMinutes / 60 * i.gpuHourUsd) / i.requestsPerCommitment
  const verifyUsd = i.verifySeconds / 3600 * i.cpuHourUsd
  const storeUsd = i.proofMB / 1024 * i.storageUsdPerGBMonth * i.retentionMonths
  const provers = i.proveOnce ? 1 : i.jurors
  const perProofAllIn = proveUsd + setupUsd + i.verifiersPerProof * verifyUsd + storeUsd
  const perRequestUsd = provers * perProofAllIn

  // Packing: each contract becomes a brief; several briefs share one request.
  // Unpacked: a long contract splits into ceil(tokens / context) requests.
  // Atomize: contracts split into atoms; atoms dedupe across the block; an
  // optional screen settles some; the rest pack as many per request as fit.
  const atomsPerRequest = Math.max(1, Math.floor((i.contextTokens - i.atomHeaderTokens) / (i.atomTokens + i.reasoningTokens + i.atomAnswerTokens)))
  const atomsTotal = i.contracts * i.atomsPerContract
  const uniqueAtoms = ceil(atomsTotal * (1 - i.dedupePct / 100))
  const screenedAtoms = i.screen ? Math.floor(uniqueAtoms * i.screenPct / 100) : 0
  const provenAtoms = uniqueAtoms - screenedAtoms
  const screenUsdTotal = i.atomize && i.screen ? uniqueAtoms * i.screenUsd : 0

  let requestsPerContract, requestsInBlock, fidelityUsd, perDecisionUsd
  if (i.atomize) {
    requestsInBlock = ceil(provenAtoms / atomsPerRequest)
    requestsPerContract = requestsInBlock / i.contracts
    const sf = i.screen ? i.screenFidelityPct / 100 : 0
    fidelityUsd = i.contracts * ((i.screen ? i.screenUsd : 0) + (1 - sf) * i.fidelityCheckUsd)
    perDecisionUsd = (requestsInBlock * perRequestUsd + fidelityUsd + screenUsdTotal) / i.contracts
  } else if (i.packing) {
    requestsPerContract = 1 / i.decisionsPerRequest
    requestsInBlock = ceil(i.contracts / i.decisionsPerRequest)
    fidelityUsd = i.contracts * i.fidelityCheckUsd
    perDecisionUsd = perRequestUsd / i.decisionsPerRequest + i.fidelityCheckUsd
  } else {
    requestsPerContract = ceil(i.tokensPerContract / i.contextTokens)
    requestsInBlock = i.contracts * requestsPerContract
    fidelityUsd = 0
    perDecisionUsd = perRequestUsd * requestsPerContract
  }

  const proofs = provers * requestsInBlock
  const verifications = proofs * i.verifiersPerProof
  const warmupUsd = provers * i.warmupMinutes / 60 * i.gpuHourUsd
  const parts = {
    proving: proofs * (proveUsd + setupUsd),
    verifying: verifications * verifyUsd,
    storing: proofs * storeUsd,
    warmup: warmupUsd,
    fidelity: fidelityUsd,
    screening: screenUsdTotal,
  }
  const blockCostUsd = Object.values(parts).reduce((a, b) => a + b, 0)
  const perContractUsd = blockCostUsd / i.contracts
  const m = 1 + i.marginPct / 100
  const sealSeconds = ceil(requestsInBlock / i.proverBatch) * i.proverBatchSeconds
  const proofGB = proofs * i.proofMB / 1024
  const capacityPerHour = 3600 / secondsPerProof
  const util = i.utilizationPct / 100
  const breakEvenFeePerProof = i.gpuHourUsd / (capacityPerHour * util)
  const marginalPerRequest = provers * (proveUsd + i.verifiersPerProof * verifyUsd + storeUsd)
  const minRequestsForWarmup = ceil(9 * warmupUsd / marginalPerRequest)

  // Roles, priced at cost plus margin on the marginal work.
  const proverFee = (proveUsd + setupUsd) * m
  const proverRevenueHour = capacityPerHour * util * proverFee
  const verifierFee = verifyUsd * m
  const verifierCapacityHour = 3600 / i.verifySeconds
  const roles = {
    prover: {
      feePerProof: proverFee,
      revenuePerHour: proverRevenueHour,
      costPerHour: i.gpuHourUsd,
      netPerHour: proverRevenueHour - i.gpuHourUsd,
      breakEvenUtilizationPct: 100 * i.gpuHourUsd / (capacityPerHour * proverFee),
      blockRevenue: proofs * proverFee + warmupUsd * m,
    },
    verifier: {
      feePerVerification: verifierFee,
      capacityPerHour: verifierCapacityHour,
      revenuePerHour: verifierCapacityHour * util * verifierFee,
      costPerHour: i.cpuHourUsd,
      netPerHour: verifierCapacityHour * util * verifierFee - i.cpuHourUsd,
      blockRevenue: verifications * verifierFee,
    },
    juror: {
      note: 'Paid per counted vote from the contract escrow, dissent included. The contract author sets the escrow.',
    },
  }

  const packedTokens = i.headerTokens + i.decisionsPerRequest * (i.briefMaxTokens + i.answerTokensPerDecision)
  const packingFits = packedTokens <= i.contextTokens
  const briefRatio = i.tokensPerContract / i.briefMaxTokens

  return {
    packedTokens, packingFits, briefRatio,
    atomsPerRequest, atomsTotal, uniqueAtoms, screenedAtoms, provenAtoms,
    secondsPerProof, proveUsd, setupUsd, verifyUsd, storeUsd, provers,
    perProofAllIn, perRequestUsd, perDecisionUsd, requestsPerContract, requestsInBlock,
    proofs, verifications, parts, blockCostUsd, perContractUsd,
    priceWithMarginUsd: perContractUsd * m, sealSeconds, proofGB, capacityPerHour,
    breakEvenFeePerProof, minRequestsForWarmup,
    minDecisionsForWarmup: i.atomize ? Math.ceil(minRequestsForWarmup * atomsPerRequest / i.atomsPerContract) : i.packing ? minRequestsForWarmup * i.decisionsPerRequest : minRequestsForWarmup,
    roles, inputs: i,
  }
}

/** Cost per contract across block sizes, for the batch curve. */
export function curve(raw = {}, sizes = [1, 2, 4, 8, 12, 16, 24, 32, 48, 64, 96, 128, 160, 200]) {
  return sizes.map(n => ({ contracts: n, perContractUsd: estimate({ ...raw, contracts: n }).perContractUsd }))
}

/**
 * Tiered routing (a cascade): each question starts at the cheapest tier and
 * moves up only when needed. A question that reaches tier k pays every tier
 * up to k. All shares here are inputs; nothing is measured until the router
 * runs on real traffic.
 * @param {Array<{id: string, usd: number, seconds: number, stopShare: number}>} tiers - cheapest first; stopShare is the share of questions that stop there (the shares sum to 1).
 * @param {object} [opts] - { baseline: tier id to compare against (default: the last tier, everything sent there) }.
 * @returns {object} average cost and time per question, the typical (median) time, the worst case, and the comparison with the baseline.
 */
export function cascade(tiers, { baseline } = {}) {
  const sum = tiers.reduce((s, t) => s + t.stopShare, 0)
  if (Math.abs(sum - 1) > 1e-9) throw new Error(`stop shares must sum to 1, got ${sum}`)
  let reach = 1, cumUsd = 0, cumSec = 0, avgUsd = 0, avgSec = 0, cumShare = 0, medianSeconds = null
  const rows = tiers.map(t => {
    const row = { id: t.id, reachShare: reach, stopShare: t.stopShare }
    avgUsd += reach * t.usd
    cumUsd += t.usd
    cumSec += t.seconds
    avgSec += t.stopShare * cumSec
    cumShare += t.stopShare
    if (medianSeconds === null && cumShare >= 0.5) medianSeconds = cumSec
    row.cumulativeUsd = cumUsd
    row.cumulativeSeconds = cumSec
    reach -= t.stopShare
    return row
  })
  const base = tiers.find(t => t.id === (baseline ?? tiers.at(-1).id))
  return {
    rows,
    avgUsd, avgSeconds: avgSec, medianSeconds,
    worstUsd: cumUsd, worstSeconds: cumSec,
    baseline: { id: base.id, usd: base.usd, seconds: base.seconds },
    cheaper: base.usd / avgUsd, fasterAvg: base.seconds / avgSec, fasterMedian: base.seconds / medianSeconds,
  }
}

/** The illustrative cascade from the Nov 6 analysis: shares 30, 35, 20 and 15 percent. */
export const CASCADE_EXAMPLE = [
  { id: 'screen', usd: 0.0004, seconds: 0.3, stopShare: 0.30 },
  { id: 'small', usd: 0.0010, seconds: 2, stopShare: 0.35 },
  { id: 'mid', usd: 0.0033, seconds: 10, stopShare: 0.20 },
  { id: 'frontier', usd: 0.0300, seconds: 35, stopShare: 0.15 },
]

/**
 * Stake: what it costs to post a bond, what an honest harness should expect to
 * lose to slashing, what a dishonest one stands to lose, and what a challenge
 * costs (VIP-0005, VIP-0006). Every default is illustrative; the fault prices
 * mirror DEFAULT_SLASHING in packages/core/src/slashing.js (this file has no
 * imports, so the site can inline it).
 */
export const STAKE_DEFAULTS = {
  bondUsd: { value: 500, label: 'illustrative', source: 'Bond per harness, as in verafy.config.json' },
  capitalCostPct: { value: 8, label: 'illustrative', source: 'Yearly return the bond could earn elsewhere' },
  poolSize: { value: 50, label: 'illustrative', source: 'Harnesses in the network' },
  jurors: { value: 5, label: 'prototype default', source: 'Seats per contract' },
  contractsPerBlock: { value: 1000, label: 'input', source: 'Contracts per block' },
  blocksPerDay: { value: 24, label: 'illustrative', source: 'One block an hour' },
  feePerSeatUsd: { value: 0.0068 / 5, label: 'modeled', source: 'The routed jury: $0.0068 per decision on average, over five seats (packages/economics cascade)' },
  missCommitPct: { value: 1, label: 'illustrative', source: 'Seats an honest harness misses (outages, timeouts)' },
  missRevealPct: { value: 0.1, label: 'illustrative', source: 'Seats an honest harness commits and then fails to reveal' },
  fixedNoCommitUsd: { value: 0.05, label: 'illustrative', source: 'DEFAULT_SLASHING.fixed["no-commit"]' },
  fixedNoRevealUsd: { value: 0.5, label: 'illustrative', source: 'DEFAULT_SLASHING.fixed["no-reveal"]' },
  graceNoCommitPct: { value: 2, label: 'illustrative', source: 'DEFAULT_SLASHING.graceRate["no-commit"]: share of seats a harness may miss for free' },
  graceNoRevealPct: { value: 0.2, label: 'illustrative', source: 'DEFAULT_SLASHING.graceRate["no-reveal"]' },
  windowBlocks: { value: 1000, label: 'illustrative', source: 'DEFAULT_SLASHING.window' },
  livenessCapPct: { value: 5, label: 'illustrative', source: 'DEFAULT_SLASHING.livenessCap' },
  badRevealPct: { value: 25, label: 'illustrative', source: 'DEFAULT_SLASHING.rates["bad-reveal"]' },
  doubleCommitPct: { value: 100, label: 'illustrative', source: 'DEFAULT_SLASHING.rates["double-commit"]' },
  challengeBondFactor: { value: 1.5, label: 'illustrative', source: 'HOLD_DEFAULTS.challengeBondFactor: a challenge locks 1.5 times its jury\'s escrow' },
  challengeEscrowUsd: { value: 0.0068 * 2, label: 'modeled', source: 'A challenge jury at least as large as the original, from model families not on it: about twice the routed jury cost' },
}

/**
 * @param {object} [raw] - overrides on STAKE_DEFAULTS (plain numbers).
 * @returns {object} per-seat and per-block costs, honest expected slashing, attack costs, and the challenge bond.
 */
export function stake(raw = {}) {
  const i = Object.fromEntries(Object.entries(STAKE_DEFAULTS).map(([k, d]) => [k, raw[k] ?? d.value]))
  const seatsPerDay = i.contractsPerBlock * i.blocksPerDay * i.jurors / i.poolSize
  const capitalPerDay = i.bondUsd * i.capitalCostPct / 100 / 365
  const capitalPerSeat = capitalPerDay / seatsPerDay
  // Honest liveness slashing: misses past the grace share pay the fixed price. Honest misses are spread out,
  // so they rarely form a streak; escalation is for clustered misses and is not modeled here.
  const seatsPerWindow = seatsPerDay / i.blocksPerDay * i.windowBlocks
  const excess = (missPct, gracePct) => Math.max(0, seatsPerWindow * (missPct - gracePct) / 100)
  const honestPerWindow = excess(i.missCommitPct, i.graceNoCommitPct) * i.fixedNoCommitUsd + excess(i.missRevealPct, i.graceNoRevealPct) * i.fixedNoRevealUsd
  const honestPerSeat = seatsPerWindow ? honestPerWindow / seatsPerWindow : 0
  const feesPerWindow = seatsPerWindow * i.feePerSeatUsd
  const perBlockSeats = i.contractsPerBlock * i.jurors
  // A dishonest harness: what one provable fault costs, against what one seat earns.
  const badReveal = i.bondUsd * i.badRevealPct / 100
  const doubleCommit = i.bondUsd * i.doubleCommitPct / 100
  // Taking a majority of one jury needs ceil(jurors/2) seats, each on its own bond, and each caught seat is slashed.
  const majority = Math.ceil(i.jurors / 2)
  return {
    inputs: i,
    seatsPerDay,
    capitalPerSeatUsd: capitalPerSeat,
    capitalPerBlockUsd: capitalPerSeat * perBlockSeats,
    honestSlashPerSeatUsd: honestPerSeat,
    honestSlashPerBlockUsd: honestPerSeat * perBlockSeats,
    honestSlashShareOfFees: feesPerWindow ? honestPerWindow / feesPerWindow : 0,
    feePerSeatUsd: i.feePerSeatUsd,
    badRevealUsd: badReveal,
    doubleCommitUsd: doubleCommit,
    badRevealInSeatFees: badReveal / i.feePerSeatUsd,
    majorityBondsUsd: majority * i.bondUsd,
    challengeBondUsd: i.challengeBondFactor * i.challengeEscrowUsd,
  }
}
