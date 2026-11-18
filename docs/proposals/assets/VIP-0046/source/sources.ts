/** Every source cited on verafy.ai/thesis, by area. Read by people and by juries. */
export type Source = { title: string; url: string; note?: string }
export type SourceGroup = { id: string; title: string; sources: Source[] }

export const SOURCE_GROUPS: SourceGroup[] = [
  {
    id: 'inference-cost',
    title: 'Cost of inference',
    sources: [
      { title: 'Epoch AI: LLM inference price trends', url: 'https://epoch.ai/data-insights/llm-inference-price-trends', note: 'Price at fixed performance falls by roughly 9 to 900x a year depending on the task.' },
      { title: 'Verafy Harness: five live rulings, Nov 6, 2026', url: 'https://github.com/Verafyai/verafyHarness/blob/main/results/live-2026-11-06.md', note: 'Founder-measured. $0.0163 for five rulings.' },
      { title: 'Verafy Harness: economics model', url: 'https://github.com/Verafyai/verafyHarness/tree/main/packages/economics', note: 'Source of every modeled cost.' },
    ],
  },
  {
    id: 'onchain-fees',
    title: 'On-chain fees',
    sources: [
      { title: 'YCharts: Ethereum average transaction fee', url: 'https://ycharts.com/indicators/ethereum_average_transaction_fee' },
      { title: 'BitInfoCharts: Ethereum transaction fees', url: 'https://bitinfocharts.com/comparison/ethereum-transactionfees.html' },
      { title: 'VALR: Solana transaction fees', url: 'https://www.valr.com/blog/solana-transaction-fees' },
      { title: 'Solana docs: transactions and size limits', url: 'https://solana.com/docs/core/transactions' },
    ],
  },
  {
    id: 'proving',
    title: 'Proving inference',
    sources: [
      { title: 'Anthropic: provable inference (FlashProve)', url: 'https://anthropic.com/research/provable-inference', note: 'Vendor-reported costs and limits.' },
      { title: 'CommitLLM', url: 'https://commitllm.com/', note: 'Commit-and-audit receipts. Vendor-reported overhead.' },
      { title: 'Lagrange: DeepProve year in review', url: 'https://www.lagrange.dev/blog/lagranges-year-in-review-2025' },
      { title: 'EZKL', url: 'https://ezkl.xyz' },
    ],
  },
  {
    id: 'models',
    title: 'Smaller, cheaper models',
    sources: [
      { title: 'AlphaSignal: PrismML compresses Qwen3.8 27B to 5.9 GB', url: 'https://alphasignal.ai/news/prismml-squeezes-qwen3-8-27b-into-5-9-gb-with-98-performance-retained', note: 'Vendor-reported: 98.2% of benchmark performance at 1.76 bits per weight.' },
      { title: 'PrismML: Bonsai 2 27B whitepaper', url: 'https://github.com/PrismML-Eng/Bonsai-demo/blob/main/bonsai-2-27b-whitepaper.pdf' },
      { title: 'Benjamin Marie on X', url: 'https://x.com/bnjmn_marie/status/2122930360631832787' },
    ],
  },
  {
    id: 'model-diversity',
    title: 'Do different models fail differently?',
    sources: [
      { title: 'Kim et al., Correlated Errors in Large Language Models (ICML 2025)', url: 'https://proceedings.mlr.press/v267/kim25e.html', note: 'Models that both err agree about 60% of the time on one leaderboard; larger models correlate more.' },
      { title: 'The Oracle\'s Fingerprint: correlated AI forecasting errors', url: 'https://arxiv.org/pdf/2605.00844', note: 'GPT-4o, Claude and Gemini errors correlate on 568 forecasting questions.' },
    ],
  },
  {
    id: 'agent-payments',
    title: 'Agent payments and demand',
    sources: [
      { title: 'Token Terminal: agentic payments (x402)', url: 'https://tokenterminal.com/explorer/agentic-payments', note: 'All-time transfers and volume.' },
      { title: 'Bitquery: auditing x402 agent payments', url: 'https://bitquery.io/investigations/x402-ai-agent-payments-audit', note: 'Finds real agent commerce is still small.' },
      { title: 'Juniper Research: agentic commerce to $1.5T by 2030', url: 'https://technode.global/2026/04/08/agentic-commerce-spending-can-reach-1-5-trillion-by-2030-study-finds/' },
    ],
  },
  {
    id: 'incidents',
    title: 'Incidents',
    sources: [
      { title: 'ChangeNOW: the Binance hack, Oct 29, 2026', url: 'https://changenow.io/blog/binance-hack-2026' },
      { title: 'Tech Insider: Binance hot wallet timeline', url: 'https://tech-insider.org/?p=50590' },
      { title: 'Bloomberg via KuCoin: whales dominate Polymarket disputes', url: 'https://www.kucoin.com/news/flash/bloomberg-a-few-whales-dominate-polymarket-dispute-resolutions' },
    ],
  },
  {
    id: 'competitors',
    title: 'Competitors and adjacent projects',
    sources: [
      { title: 'GenLayer and the Internet Court (Cointelegraph)', url: 'https://cointelegraph.com/magazine/ai-agent-disputes-sent-to-internet-court-and-a-jury-of-ai-agents' },
      { title: 'GenLayer raises $7.5M seed (The Block)', url: 'https://www.theblock.co/post/312105/vcs-back-ai-focused-blockchain-team-building-internet-connected-smart-contracts' },
      { title: 'Internet Court launch, 27 companies', url: 'https://sociable.co/?p=101165' },
      { title: 'Kleros', url: 'https://kleros.io' },
      { title: 'UMA', url: 'https://uma.xyz' },
      { title: 'Chainlink on DefiLlama', url: 'https://defillama.com/protocol/chainlink' },
      { title: 'OpenGradient raises $9.5M', url: 'https://www.prnewswire.com/news-releases/opengradient-announces-9-5-million-in-total-funding-to-build-the-compute-layer-for-verifiable-ai-302741614.html' },
      { title: 'Ritual', url: 'https://ritual.net' },
      { title: 'Squads security docs', url: 'https://docs.squads.so/main/basics/security' },
    ],
  },
  {
    id: 'market',
    title: 'Market size',
    sources: [
      { title: 'Blockchain oracle market forecast (AInvest)', url: 'https://www.ainvest.com/news/blockchain-randomness-created-important-oracle-moat-2608/' },
      { title: 'Juniper Research: agentic commerce forecast', url: 'https://technode.global/2026/04/08/agentic-commerce-spending-can-reach-1-5-trillion-by-2030-study-finds/' },
      { title: 'Squads: value secured', url: 'https://docs.squads.so/main/basics/security' },
    ],
  },
  {
    id: 'verafy',
    title: 'Verafy',
    sources: [
      { title: 'Swarm Explorer', url: 'https://swarm.verafy.ai' },
      { title: 'Verafy Explorer', url: 'https://explorer.verafy.ai' },
      { title: 'Verafy Devnet', url: 'https://devnet.verafy.ai' },
      { title: 'Actually Smart Contracts', url: 'https://asc.verafy.ai' },
      { title: 'Verafy Harness on GitHub', url: 'https://github.com/Verafyai/verafyHarness' },
      { title: 'SIMD discussion #724', url: 'https://github.com/solana-foundation/solana-improvement-documents/discussions/724' },
      { title: '@verafy/mcp on npm', url: 'https://www.npmjs.com/package/@verafy/mcp' },
      { title: '@verafy/sdk on npm', url: 'https://www.npmjs.com/package/@verafy/sdk' },
    ],
  },
]
