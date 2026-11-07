// Page logic for /economics. The economics functions are inlined above this by site/build.py.
(function () {
  var GROUPS = [
    ['Machine', ['gpuHourUsd', 'cpuHourUsd', 'utilizationPct', 'warmupMinutes']],
    ['Proof', ['proverBatch', 'proverBatchSeconds', 'contextTokens', 'proofMB', 'verifySeconds']],
    ['Jury and block', ['jurors', 'verifiersPerProof', 'contracts', 'tokensPerContract']],
    ['Proof packing', ['atomize', 'proveOnce', 'atomsPerContract', 'atomTokens', 'reasoningTokens', 'atomAnswerTokens', 'atomHeaderTokens', 'dedupePct', 'fidelityCheckUsd', 'packing', 'decisionsPerRequest', 'briefMaxTokens', 'answerTokensPerDecision', 'headerTokens']],
    ['Fast screen (System 1)', ['screen', 'screenPct', 'screenFidelityPct', 'screenUsd']],
    ['Storage and margin', ['storageUsdPerGBMonth', 'retentionMonths', 'marginPct']],
  ]
  var NAMES = {
    gpuHourUsd: 'GPU, $ per hour', cpuHourUsd: 'Verifier CPU box, $ per hour', utilizationPct: 'GPU utilization, %', warmupMinutes: 'Warm-up per session, minutes',
    proverBatch: 'Requests per prover batch', proverBatchSeconds: 'Seconds per batch', contextTokens: 'Tokens per proven request', proofMB: 'Proof size, MB', verifySeconds: 'Verify time, seconds',
    jurors: 'Jurors per jury', verifiersPerProof: 'Verifiers per proof', contracts: 'Contracts in the block', tokensPerContract: 'Tokens per contract',
    atomize: 'Atomize and pack', atomsPerContract: 'Atoms per contract', atomTokens: 'Tokens per atom slot', reasoningTokens: 'Reasoning tokens per atom (proven)', atomAnswerTokens: 'Answer tokens per atom', atomHeaderTokens: 'Packed header tokens', dedupePct: 'Atoms shared across contracts, %',
    screen: 'Use a fast screen (Jev)', screenPct: 'Atoms the screen settles, %', screenFidelityPct: 'Fidelity checks the screen settles, %', screenUsd: 'Screen cost per decision, $',
    packing: 'Briefs, fixed decisions per request', proveOnce: 'Prove once, verify many', decisionsPerRequest: 'Decisions per request', briefMaxTokens: 'Brief budget, tokens', answerTokensPerDecision: 'Answer tokens per decision', headerTokens: 'Header tokens', fidelityCheckUsd: 'Fidelity check per brief, $',
    storageUsdPerGBMonth: 'Storage, $ per GB-month', retentionMonths: 'Retention, months', marginPct: 'Operator margin, %',
  }
  var TAGCLS = { 'vendor-reported': 'vr', measured: 'm', modeled: 'mo' }
  var form = document.getElementById('inputs')
  var state = inputs({})

  function money(x) { return '$' + (Math.abs(x) >= 1 ? x.toFixed(2) : x.toFixed(4)) }
  function num(x, d) { return Number(x).toLocaleString('en-US', { maximumFractionDigits: d === undefined ? 1 : d }) }
  function dur(s) { return s >= 3600 ? num(s / 3600, 1) + ' h' : num(s / 60, 1) + ' min' }

  function build() {
    GROUPS.forEach(function (g) {
      var fs = document.createElement('fieldset')
      fs.innerHTML = '<legend>' + g[0] + '</legend>'
      g[1].forEach(function (k) {
        var d = DEFAULTS[k], row = document.createElement('label')
        row.className = 'in'
        var tag = '<span class="tag ' + (TAGCLS[d.label] || '') + '" title="' + d.source.replace(/"/g, '&quot;') + '">' + d.label + '</span>'
        if (typeof d.value === 'boolean') {
          row.innerHTML = '<span class="nm">' + NAMES[k] + ' ' + tag + '</span><input type="checkbox" name="' + k + '">'
        } else {
          row.innerHTML = '<span class="nm">' + NAMES[k] + ' ' + tag + '</span><input type="number" step="any" min="0" name="' + k + '">'
        }
        fs.appendChild(row)
      })
      form.appendChild(fs)
    })
    form.addEventListener('input', read)
  }

  function fill() {
    Object.keys(NAMES).forEach(function (k) {
      var el = form.elements[k]
      if (!el) return
      if (el.type === 'checkbox') el.checked = !!state[k]
      else el.value = +Number(state[k]).toPrecision(6)
    })
  }

  function read() {
    Object.keys(NAMES).forEach(function (k) {
      var el = form.elements[k]
      if (!el) return
      if (el.type === 'checkbox') state[k] = el.checked
      else if (el.value !== '' && isFinite(+el.value) && +el.value > 0) state[k] = +el.value
    })
    render(); save()
  }

  function save() {
    var diff = {}, base = inputs({})
    Object.keys(NAMES).forEach(function (k) { if (state[k] !== base[k]) diff[k] = state[k] })
    var q = Object.keys(diff).length ? '?s=' + encodeURIComponent(JSON.stringify(diff)) : ''
    try { history.replaceState(null, '', location.pathname + q + location.hash) } catch (e) {}
  }

  function load() {
    try {
      var s = new URLSearchParams(location.search).get('s')
      if (s) state = inputs(JSON.parse(s))
    } catch (e) {}
  }

  function out(name, text) {
    document.querySelectorAll('[data-out="' + name + '"]').forEach(function (n) { n.textContent = text })
  }

  function render() {
    var e = estimate(state)
    var u = estimate(Object.assign({}, state, { packing: false, atomize: false, proveOnce: false, screen: false }))
    var p = estimate(Object.assign({}, state, { packing: false, atomize: true, proveOnce: true, screen: false }))
    var bq = estimate(Object.assign({}, state, { packing: true, atomize: false, proveOnce: true, screen: false }))
    var jq = estimate(Object.assign({}, state, { packing: false, atomize: true, proveOnce: true, screen: true, screenPct: state.screen ? state.screenPct : 50, screenFidelityPct: state.screen ? state.screenFidelityPct : 70 }))
    document.getElementById('mode').textContent = (state.atomize ? 'atomized' : state.packing ? 'briefs' : 'unpacked') + (state.proveOnce ? ', proved once' : '') + (state.atomize && state.screen ? ', screened' : '')
    out('blockCostUsd', money(e.blockCostUsd))
    out('perContractUsd', money(e.perContractUsd))
    out('priceWithMarginUsd', money(e.priceWithMarginUsd))
    out('perDecisionUsd', money(e.perDecisionUsd))
    out('requestsInBlock', num(e.requestsInBlock, 0))
    out('proofsLine', e.provers + ' prover' + (e.provers > 1 ? 's' : '') + ', ' + num(e.proofs, 0) + ' proofs, ' + num(e.verifications, 0) + ' verifications')
    out('sealLine', dur(e.sealSeconds) + ' (provers work in parallel)')
    out('proofGB', num(e.proofGB, 2) + ' GB, in the availability layer, never on chain')
    out('capacityPerHour', num(e.capacityPerHour, 0))
    out('breakEvenFeePerProof', money(e.breakEvenFeePerProof) + ' at ' + num(state.utilizationPct, 0) + '% utilization')
    out('minWarmLine', num(e.minRequestsForWarmup, 0) + ' requests per prover' + (state.packing || state.atomize ? ', about ' + num(e.minDecisionsForWarmup, 0) + ' contracts' : ''))
    out('proveUsd', money(e.proveUsd))
    out('warmShare', num(100 * u.parts.warmup / u.blockCostUsd, 0) + '%')
    out('packGain', num(u.perDecisionUsd / p.perDecisionUsd, 0) + 'x')

    var w = document.getElementById('fitWarn')
    if (state.packing && !e.packingFits) { w.hidden = false; w.textContent = 'This packing does not fit: ' + num(e.packedTokens, 0) + ' tokens per request against a limit of ' + num(state.contextTokens, 0) + '. Lower the decisions per request or the brief budget.' }
    else w.hidden = true

    var COLORS = { proving: 'var(--accent)', verifying: 'var(--allow)', storing: 'var(--mute)', warmup: 'var(--hold)', fidelity: '#8A5CC7', screening: '#C79A2E' }
    var LABELS = { proving: 'Proving', verifying: 'Verifying', storing: 'Storing proofs', warmup: 'Warm-up', fidelity: 'Fidelity checks', screening: 'Fast screen' }
    var bar = '', leg = ''
    Object.keys(e.parts).forEach(function (k) {
      var v = e.parts[k]; if (v <= 0) return
      var pct = 100 * v / e.blockCostUsd
      bar += '<span style="width:' + pct + '%;background:' + COLORS[k] + '" title="' + LABELS[k] + '"></span>'
      leg += '<li><i style="background:' + COLORS[k] + '"></i>' + LABELS[k] + ' ' + money(v) + ' (' + num(pct, 0) + '%)</li>'
    })
    document.getElementById('bar').innerHTML = bar
    document.getElementById('legend').innerHTML = leg

    var rows = [
      ['Proven requests', u.requestsInBlock, bq.requestsInBlock, p.requestsInBlock, jq.requestsInBlock],
      ['Provers', u.provers, bq.provers, p.provers, jq.provers],
      ['Proofs', u.proofs, bq.proofs, p.proofs, jq.proofs],
      ['Proof data', u.proofGB, bq.proofGB, p.proofGB, jq.proofGB],
      ['Warm-up', u.parts.warmup, bq.parts.warmup, p.parts.warmup, jq.parts.warmup],
      ['Proving', u.parts.proving, bq.parts.proving, p.parts.proving, jq.parts.proving],
      ['Fidelity checks', u.parts.fidelity, bq.parts.fidelity, p.parts.fidelity, jq.parts.fidelity],
      ['Fast screen', u.parts.screening, bq.parts.screening, p.parts.screening, jq.parts.screening],
      ['Block cost', u.blockCostUsd, bq.blockCostUsd, p.blockCostUsd, jq.blockCostUsd],
      ['Per contract', u.perContractUsd, bq.perContractUsd, p.perContractUsd, jq.perContractUsd],
      ['Per decision, before warm-up', u.perDecisionUsd, bq.perDecisionUsd, p.perDecisionUsd, jq.perDecisionUsd],
      ['Time to seal', u.sealSeconds, bq.sealSeconds, p.sealSeconds, jq.sealSeconds],
    ]
    var fmt = function (label, v) { return label === 'Proof data' ? num(v, 2) + ' GB' : label === 'Time to seal' ? dur(v) : /Proven|Provers|Proofs/.test(label) ? num(v, 0) : money(v) }
    document.getElementById('compare').innerHTML = rows.map(function (r) { return '<tr><td class="k">' + r[0] + '</td>' + r.slice(1).map(function (v) { return '<td class="v">' + fmt(r[0], v) + '</td>' }).join('') + '</tr>' }).join('')

    var R = e.roles
    document.getElementById('roles').innerHTML =
      '<tr><td>Proving operator</td><td class="v">' + money(R.prover.feePerProof) + ' per proof</td><td class="v">' + money(R.prover.revenuePerHour) + '</td><td class="v">' + money(R.prover.costPerHour) + '</td><td class="v ' + (R.prover.netPerHour < 0 ? 'neg' : 'pos') + '">' + money(R.prover.netPerHour) + '</td><td class="v">' + money(R.prover.blockRevenue) + '</td></tr>' +
      '<tr><td>Verifier</td><td class="v">' + money(R.verifier.feePerVerification) + ' per check</td><td class="v">' + money(R.verifier.revenuePerHour) + '</td><td class="v">' + money(R.verifier.costPerHour) + '</td><td class="v ' + (R.verifier.netPerHour < 0 ? 'neg' : 'pos') + '">' + money(R.verifier.netPerHour) + '</td><td class="v">' + money(R.verifier.blockRevenue) + '</td></tr>' +
      '<tr><td colspan="6" class="k">Break-even GPU utilization for the proving operator at this margin: ' + num(R.prover.breakEvenUtilizationPct, 0) + '%. Below it the GPU rent outruns the fees.</td></tr>'

    chart(state)
    tables(state)
  }

  function tables(s) {
    var b = Object.assign({}, s, { atomize: true, packing: false, proveOnce: true, contracts: 1000 })
    var base = estimate(Object.assign({}, b, { screen: false }))
    var rows = [['No screen', Object.assign({}, b, { screen: false })], ['Half the atoms', Object.assign({}, b, { screen: true, screenPct: 50, screenFidelityPct: 0 })],
      ['70% of the fidelity checks', Object.assign({}, b, { screen: true, screenPct: 0, screenFidelityPct: 70 })], ['Both', Object.assign({}, b, { screen: true, screenPct: 50, screenFidelityPct: 70 })],
      ['Nothing (screens every atom, settles none)', Object.assign({}, b, { screen: true, screenPct: 0, screenFidelityPct: 0 })]]
    document.getElementById('screenTable').innerHTML = rows.map(function (r) {
      var e = estimate(r[1]), d = (e.perContractUsd / base.perContractUsd - 1) * 100
      return '<tr><td>' + r[0] + '</td><td class="v">' + money(e.perContractUsd) + '</td><td class="v ' + (d > 0.5 ? 'neg' : d < -0.5 ? 'pos' : '') + '">' + (Math.abs(d) < 0.5 ? 'baseline' : (d > 0 ? '+' : '') + num(d, 0) + '%') + '</td></tr>'
    }).join('')
    document.getElementById('reasonTable').innerHTML = [[0, 'None'], [40, 'Short, about 40 tokens'], [150, 'Full, about 150 tokens'], [400, 'Long, about 400 tokens']].map(function (r) {
      var e = estimate(Object.assign({}, b, { screen: false, reasoningTokens: r[0] }))
      return '<tr><td>' + r[1] + '</td><td class="v">' + e.atomsPerRequest + '</td><td class="v">' + num(e.proofs, 0) + '</td><td class="v">' + money(e.perContractUsd) + '</td><td class="v">' + dur(e.sealSeconds) + '</td></tr>'
    }).join('')
  }

  var tiers = CASCADE_EXAMPLE.map(function (t) { return Object.assign({}, t) })
  var TIERNAMES = { screen: 'Fast screen (Jev)', small: 'Small models, 3 families', mid: 'Mid models, 5 families', frontier: 'Frontier, 5 to 7 families' }
  function buildCascade() {
    var f = document.getElementById('cascadeInputs')
    tiers.forEach(function (t, i) {
      var fs = document.createElement('fieldset')
      fs.innerHTML = '<legend>Tier ' + i + ': ' + TIERNAMES[t.id] + '</legend>' +
        '<label class="in"><span class="nm">Cost per question, $</span><input type="number" step="any" min="0" data-t="' + i + '" data-k="usd" value="' + t.usd + '"></label>' +
        '<label class="in"><span class="nm">Seconds</span><input type="number" step="any" min="0" data-t="' + i + '" data-k="seconds" value="' + t.seconds + '"></label>' +
        '<label class="in"><span class="nm">Questions that stop here, %</span><input type="number" step="any" min="0" max="100" data-t="' + i + '" data-k="stopShare" value="' + Math.round(t.stopShare * 100) + '"></label>'
      f.appendChild(fs)
    })
    f.addEventListener('input', function (e) {
      var el = e.target, i = +el.dataset.t, k = el.dataset.k
      if (!(el.value !== '' && isFinite(+el.value) && +el.value >= 0)) return
      tiers[i][k] = k === 'stopShare' ? +el.value / 100 : +el.value
      renderCascade()
    })
  }
  function renderCascade() {
    var w = document.getElementById('cascadeWarn')
    var sum = tiers.reduce(function (a, t) { return a + t.stopShare }, 0)
    if (Math.abs(sum - 1) > 1e-6) { w.hidden = false; w.textContent = 'The stop shares add up to ' + num(sum * 100, 1) + '%; they need to add up to 100%.'; return }
    w.hidden = true
    var c = cascade(tiers)
    out('cAvgUsd', money(c.avgUsd)); out('cAvgSec', num(c.avgSeconds, 1) + ' s'); out('cMedSec', num(c.medianSeconds, 1) + ' s')
    out('cWorst', money(c.worstUsd) + ', ' + num(c.worstSeconds, 1) + ' s'); out('cBase', money(c.baseline.usd) + ', ' + num(c.baseline.seconds, 1) + ' s')
    out('cGain', num(c.cheaper, 1) + 'x cheaper, ' + num(c.fasterAvg, 1) + 'x faster on average, ' + num(c.fasterMedian, 0) + 'x typical')
  }

  function chart(s) {
    var sizes = [1, 2, 4, 8, 12, 16, 24, 32, 48, 64, 96, 128, 160, 200]
    var a = curve(Object.assign({}, s, { packing: false, atomize: false, proveOnce: false, screen: false }), sizes)
    var b = curve(Object.assign({}, s, { packing: false, atomize: true, proveOnce: true, screen: false }), sizes)
    var W = 760, H = 300, L = 70, B = 40, T = 16, Rr = 16
    var ymax = Math.max.apply(null, a.concat(b).map(function (p) { return p.perContractUsd }))
    var lg = function (n) { return Math.log(n) / Math.log(200) }
    var X = function (n) { return L + lg(n) * (W - L - Rr) }
    var Y = function (v) { return H - B - (v / ymax) * (H - B - T) }
    var path = function (pts) { return pts.map(function (p, k) { return (k ? 'L' : 'M') + X(p.contracts).toFixed(1) + ' ' + Y(p.perContractUsd).toFixed(1) }).join(' ') }
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" font-family="JetBrains Mono, monospace" font-size="12">'
    for (var g = 0; g <= 4; g++) { var v = ymax * g / 4, y = Y(v); svg += '<line x1="' + L + '" x2="' + (W - Rr) + '" y1="' + y + '" y2="' + y + '" stroke="var(--rule)"/><text x="' + (L - 8) + '" y="' + (y + 4) + '" text-anchor="end" fill="var(--mute)">' + money(v) + '</text>' }
    ;[1, 4, 12, 24, 48, 96, 200].forEach(function (n) { svg += '<text x="' + X(n) + '" y="' + (H - B + 18) + '" text-anchor="middle" fill="var(--mute)">' + n + '</text>' })
    svg += '<text x="' + ((W + L) / 2) + '" y="' + (H - 4) + '" text-anchor="middle" fill="var(--mute)">contracts in the block (log scale)</text>'
    svg += '<path d="' + path(a) + '" fill="none" stroke="var(--hold)" stroke-width="2.5"/>'
    svg += '<path d="' + path(b) + '" fill="none" stroke="var(--accent)" stroke-width="2.5"/>'
    var n = Math.min(200, Math.max(1, s.contracts))
    var cu = estimate(Object.assign({}, s, { packing: false, atomize: false, proveOnce: false, screen: false })).perContractUsd
    var cp = estimate(Object.assign({}, s, { packing: false, atomize: true, proveOnce: true, screen: false })).perContractUsd
    svg += '<line x1="' + X(n) + '" x2="' + X(n) + '" y1="' + T + '" y2="' + (H - B) + '" stroke="var(--ink)" stroke-dasharray="3 4"/>'
    svg += '<circle cx="' + X(n) + '" cy="' + Y(cu) + '" r="5" fill="var(--hold)"/><circle cx="' + X(n) + '" cy="' + Y(cp) + '" r="5" fill="var(--accent)"/>'
    svg += '<rect x="' + (W - 230) + '" y="' + T + '" width="214" height="48" fill="var(--sheet)" stroke="var(--rule)"/>'
    svg += '<line x1="' + (W - 220) + '" x2="' + (W - 196) + '" y1="' + (T + 16) + '" y2="' + (T + 16) + '" stroke="var(--hold)" stroke-width="2.5"/><text x="' + (W - 188) + '" y="' + (T + 20) + '" fill="var(--ink)">unpacked</text>'
    svg += '<line x1="' + (W - 220) + '" x2="' + (W - 196) + '" y1="' + (T + 34) + '" y2="' + (T + 34) + '" stroke="var(--accent)" stroke-width="2.5"/><text x="' + (W - 188) + '" y="' + (T + 38) + '" fill="var(--ink)">atomized and packed</text>'
    document.getElementById('chart').innerHTML = svg + '</svg>'
  }

  function sources() {
    document.getElementById('srcs').innerHTML = Object.keys(NAMES).map(function (k) {
      var d = DEFAULTS[k]
      var v = typeof d.value === 'boolean' ? (d.value ? 'on' : 'off') : +Number(d.value).toPrecision(6)
      var src = d.url ? '<a href="' + d.url + '">' + d.source + '</a>' : d.source
      return '<tr><td>' + NAMES[k] + '</td><td class="v">' + v + '</td><td><span class="tag ' + (TAGCLS[d.label] || '') + '">' + d.label + '</span></td><td>' + src + (d.date ? ' (' + d.date + ')' : '') + '</td></tr>'
    }).join('')
  }

  document.querySelectorAll('[data-preset]').forEach(function (b) {
    b.addEventListener('click', function () {
      var pr = PRESETS[b.getAttribute('data-preset')]
      state = inputs(pr.values)
      document.getElementById('presetNote').textContent = pr.note || ''
      fill(); render(); save()
    })
  })
  document.getElementById('share').addEventListener('click', function () {
    try { navigator.clipboard.writeText(location.href); this.textContent = 'Link copied' } catch (e) {}
  })

  function renderStake() {
    var t = document.getElementById('stakeTable'); if (!t || typeof stake !== 'function') return
    var s = stake(), m = function (x, d) { return '$' + (+x).toFixed(d === undefined ? 2 : d) }
    var rows = [
      ['Bond per harness', m(s.inputs.bondUsd, 0), 'illustrative; it caps the value one vote may decide'],
      ['Seats per harness per day', Math.round(s.seatsPerDay).toLocaleString(), s.inputs.contractsPerBlock.toLocaleString() + ' contracts a block, ' + s.inputs.blocksPerDay + ' blocks a day, ' + s.inputs.jurors + ' seats each, ' + s.inputs.poolSize + ' harnesses'],
      ['Cost of holding the bond, per 1,000-contract block', m(s.capitalPerBlockUsd), 'across every seat, at ' + s.inputs.capitalCostPct + '% a year; next to about $6.87 for the packed, proven block'],
      ['Honest harness, ' + s.inputs.missCommitPct + '% of seats missed', m(s.honestSlashPerSeatUsd, 4) + ' a seat', 'inside the free ' + s.inputs.graceNoCommitPct + '% allowance'],
      ['Unreliable harness, 5% missed', m(stake({ missCommitPct: 5, missRevealPct: 0.5 }).honestSlashPerSeatUsd, 4) + ' a seat', (stake({ missCommitPct: 5, missRevealPct: 0.5 }).honestSlashShareOfFees).toFixed(1) + ' times its fees: it loses money'],
      ['One bad reveal', m(s.badRevealUsd, 0), Math.round(s.badRevealInSeatFees).toLocaleString() + ' seat fees'],
      ['One double commit', m(s.doubleCommitUsd, 0), 'the whole bond'],
      ['Bonds behind a majority of one jury', m(s.majorityBondsUsd, 0), Math.ceil(s.inputs.jurors / 2) + ' seats, each on its own bond and operator'],
      ['Challenge bond', m(s.challengeBondUsd, 4), s.inputs.challengeBondFactor + ' times the challenge jury escrow'],
    ]
    t.innerHTML = rows.map(function (r) { return '<tr><td>' + r[0] + '</td><td class="v">' + r[1] + '</td><td>' + r[2] + '</td></tr>' }).join('')
  }

  load(); build(); fill(); sources(); render(); buildCascade(); renderCascade(); renderStake()
})()
