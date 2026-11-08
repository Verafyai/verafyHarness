// Example programs and scripted jurors shared by the tests and the demos
// (scripts/grant-demo.mjs, scripts/hackathon-demo.mjs).
import { GRANT_KIND, HACKATHON_KIND } from '../src/index.js'

const DAY = 86_400
const T0 = 1_800_000_000
const SOL = 1_000_000_000

export function program(foundation, over = {}) {
  return {
    kind: GRANT_KIND,
    id: 'agent-payments-rfi-1',
    title: 'Agents that pay each other',
    foundation: { name: 'Example Foundation', key: foundation.publicKey, wallet: 'FoundationWallet11111111111111111111111111' },
    request: {
      summary: 'We want working tools that let one AI agent pay another for a service on Solana, with a receipt both sides can check.',
      terms: [
        { id: 'prototype', text: 'Ships a working prototype in a public GitHub repository.' },
        { id: 'license', text: 'The code is open source under MIT or Apache-2.0.' },
        { id: 'solana', text: 'Payments settle on Solana devnet or mainnet, with a transaction signature shown.' },
      ],
      responseSeconds: 14 * DAY,
      responseEvidence: 'A write-up with the repository link, the license and one transaction signature',
    },
    agentTerms: { text: 'The grantee runs its AI agents under these terms: no custody of user funds, every payment logged with a receipt, and the Verafy review is final for this grant.' },
    money: { asset: 'SOL', budget: String(20 * SOL), baseGrant: String(2 * SOL), maxGrantees: 2 },
    tranches: [
      { id: 'revenue-1k', outcome: 'Revenue', text: 'At least $1,000 received from at least five paying customers who are not the grantee or the foundation.', evidence: 'A payment processor export or on-chain receipts, with customer counts', amount: String(5 * SOL), claimSeconds: 90 * DAY },
      { id: 'integration', outcome: 'Integration', text: 'Another team ships the tool in a product, shown by a public release that uses it.', evidence: 'A link to the release and the line that uses it', amount: String(3 * SOL), claimSeconds: 90 * DAY },
    ],
    followOn: { instrument: 'post-money-safe', text: 'The foundation may invest up to $250,000 on a post-money SAFE at a $10M cap within 6 months of a met revenue tranche.' },
    window: { applyUntil: T0 + 10 * DAY, endsAt: T0 + 120 * DAY },
    review: { bar: 0.66, jury: { size: 3, minFamilies: 3 }, fee: 0.05 },
    ...over,
  }
}

// Scripted jurors: they read the pinned evidence, never the grantee's own claims.
export const reviewer = {
  async complete({ user }) {
    let answer
    if (/meet every term/.test(user)) {
      const ok = /github\.com\/\S+/.test(user) && /(MIT|Apache-2\.0)/.test(user) && /signature [1-9A-HJ-NP-Za-km-z]{40,}/.test(user)
      answer = ok ? 'CLEARED' : 'NOT_CLEARED'
    } else {
      const m = user.match(/received \$([0-9,]+) from ([0-9]+) outside customers/i)
      answer = m && Number(m[1].replace(/,/g, '')) >= 1000 && Number(m[2]) >= 5 ? 'MET' : 'NOT_MET'
    }
    return JSON.stringify({ answer, confidence: 0.9, reasoning: 'Read the pinned evidence against the written terms.', sources: ['c1'] })
  },
}

export function hackathon(initiator, over = {}) {
  return {
    kind: HACKATHON_KIND,
    id: 'agent-escrow-hack-1',
    title: 'Agent escrow hackathon',
    initiator: { name: 'Example Foundation', key: initiator.publicKey, wallet: 'InitiatorWallet1111111111111111111111111' },
    challenge: {
      summary: 'Build a tool that lets two AI agents hold money in escrow on Solana and settle it by an agentic contract.',
      rules: ['The code must be written during the hackathon.', 'The repository must be public and open source.'],
    },
    criteria: [
      { id: 'works', text: 'It runs, and the README shows how to run it end to end on devnet.', weight: 4 },
      { id: 'contract', text: 'It uses a signed agentic contract with remedies, not a plain transfer.', weight: 3 },
      { id: 'safety', text: 'Agent keys never leave the agent; payouts are checked against the terms.', weight: 3 },
    ],
    money: { asset: 'SOL', pool: String(10 * SOL) },
    prizes: { shares: [500_000, 300_000, 200_000], minScore: 6 },
    window: { opensAt: T0, closesAt: T0 + 14 * DAY },
    council: { bar: 0.66, jury: { size: 3, minFamilies: 3 }, fee: 0.05 },
    maxSubmissions: 50,
    ...over,
  }
}

// Scripted council: the score each repository earns (standing in for reading the code).
export const SCORES = { 'https://github.com/ada/escrow-agents': '9', 'https://github.com/bo/agentpay': '7', 'https://github.com/cy/quick-hack': '4', 'https://github.com/di/twin': '7' }
export const council = {
  async complete({ user }) {
    const repo = Object.keys(SCORES).find(r => user.includes(r))
    return JSON.stringify({ answer: repo ? SCORES[repo] : '0', confidence: 0.85, reasoning: 'Graded the repository at the pinned commit against the weighted criteria.', sources: ['c1'] })
  },
}

export function covenant(operator, agent, over = {}) {
  return {
    kind: 'verafy.agent-bond/1',
    id: 'support-agent-bond-1',
    title: 'Support agent conduct bond',
    operator: { name: 'Example Labs', key: operator.publicKey, wallet: 'OperatorWallet11111111111111111111111111' },
    agent: { name: 'example-support-agent', key: agent.publicKey, scope: 'Answers customer support questions and issues refunds of up to $50 from the support budget.' },
    articles: [
      { id: 'refund-cap', text: 'Never issues a refund above $50 or outside the support budget.', evidence: 'A transaction or refund record signed by the agent', slash: String(2 * SOL) },
      { id: 'no-secrets', text: 'Never asks a user for a password, seed phrase or private key.', evidence: 'A transcript signed by the agent or logged by the platform', slash: String(5 * SOL) },
      { id: 'no-impersonation', text: 'Never claims to be a human or to speak for a company other than Example Labs.', evidence: 'A transcript signed by the agent', slash: String(3 * SOL) },
    ],
    money: { asset: 'SOL', bond: String(10 * SOL), reporterBond: String(SOL / 10) },
    slashTo: 'harmed',
    term: { startsAt: T0, endsAt: T0 + 30 * DAY, reportGraceSeconds: 7 * DAY, answerSeconds: 3 * DAY },
    review: { bar: 0.66, jury: { size: 3, minFamilies: 3 }, fee: 0.05 },
    ...over,
  }
}

// Scripted jurors for agent bonds: they look for the forbidden act in the agent-signed transcript.
export const conduct = {
  async complete({ user }) {
    const violated = (/Article no-secrets/.test(user) && /AGENT: .*(seed phrase|private key|password)/i.test(user)) || (/Article refund-cap/.test(user) && /refund \$([0-9]+)/i.test(user) && Number(user.match(/refund \$([0-9]+)/i)[1]) > 50)
    return JSON.stringify({ answer: violated ? 'VIOLATED' : 'CLEAN', confidence: 0.9, reasoning: 'Read the agent-signed record against the article.', sources: ['c1'] })
  },
}
