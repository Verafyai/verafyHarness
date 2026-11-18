/** Investor copy shared by /thesis and the PDF investor report, so the two never drift. */

export const HEADLINE = 'An independent AI co-signer for money that moves on Solana.'

export const SUBHEAD =
  "Stolen keys produce valid signatures. Before a treasury transfer goes through, a jury of five frontier models from different labs reviews it against the treasury's policy, holds a required signing key, and records on Solana which models ruled."

export const HOW_STEPS: [string, string][] = [
  ['Propose', 'A treasury or agent proposes a transfer. The policy it must follow is written down.'],
  ['Rule', 'Five models from different labs read the transfer, the policy and the evidence, and vote.'],
  ['Co-sign or block', 'Verafy holds a required key. It signs when the jury approves and withholds it when not.'],
]

export const COSTS: [string, string, string][] = [
  ['No proof', '$0.0033', 'Measured'],
  ['Commit-and-audit receipt', '$0.0038', 'Modeled from vendor overhead'],
  ['Full proof, every juror', '$0.109', 'Modeled'],
  ['Packed and screened proof', '$0.0045', 'Modeled; screen shares assumed'],
]

export const RISKS: [string, string, string][] = [
  ['Models wrong together', 'Jurors from different labs, required independent sources, appeal to a larger panel', 'Error rates by model family on human-judged sets'],
  ['Prompt injection and planted evidence', 'Evidence is never instructions (Prompt Guard); evidence set hashed with each ruling', 'Published red-team miss rates'],
  ['Liability for a wrong ruling', 'Bonds, value caps per ruling, human appeal for large amounts', 'Counsel opinion on bonds and slashing'],
  ['Key placement', "The jury's key sits outside the client's signing stack", 'Threat model and audit'],
  ['Regulation', 'Start with crypto-native treasuries that set their own policy', 'Counsel memo by jurisdiction'],
]

export const NEXT_24 = [
  'A first paying treasury customer.',
  'A published jury error rate on human-judged sets.',
  'The co-signer live on mainnet.',
  'A 1,000-ruling live cost run.',
  'Packing measured with a real prover.',
]

export const TEAM =
  'Rex St John, founder. Founded the Arm Innovator Program, built developer ecosystems at Intel, NVIDIA and Anza, and onboarded 224 projects in under 12 months at Saga.'

export const HIRING = 'Hiring next: a cryptography or zkML engineer, and a sales lead from custody or treasury security.'
