(function () {
  // OPEN_WEIGHTS, HOSTED, memoryNeededGb, tierFor, cloudInit and sq come from the deploy package, inlined at build time.
  var $ = function (id) { return document.getElementById(id) }
  var val = function (n) { var e = document.querySelector('input[name="' + n + '"]:checked'); return e ? e.value : '' }
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] }) }
  var PLANS = { digitalocean: { api: 's-1vcpu-2gb', small: 's-4vcpu-16gb', mid: 's-8vcpu-32gb' }, hetzner: { api: 'cx22', small: 'cx42', mid: 'cx52' } }
  var NAMES = { local: 'Node', docker: 'Docker', digitalocean: 'DigitalOcean', hetzner: 'Hetzner', 'user-data': 'Any cloud', buttons: 'One-click' }

  function fillModels() {
    var kind = val('kind')
    var list = kind === 'local' ? OPEN_WEIGHTS.map(function (m) { return { v: m.family + '|' + m.tag, t: m.tag + '  (' + m.family + ', about ' + memoryNeededGb(m.paramsB) + ' GB)' } })
      : HOSTED.map(function (m) { return { v: m.family + '|' + m.model, t: m.family + ': ' + m.model } })
    $('model').innerHTML = list.map(function (o) { return '<option value="' + esc(o.v) + '">' + esc(o.t) + '</option>' }).join('')
  }

  function block(title, code, note) {
    return '<h3>' + esc(title) + '</h3>' + (note ? '<p class="note">' + note + '</p>' : '') + '<div class="codebox"><pre><code>' + esc(code) + '</code></pre><button class="copy" type="button">Copy</button></div>'
  }

  function sizeFor(tag) {
    var m = OPEN_WEIGHTS.filter(function (x) { return x.tag === tag })[0]
    if (!m) return 'mid'
    var gb = memoryNeededGb(m.paramsB)
    return gb <= 12 ? 'small' : gb <= 26 ? 'mid' : null
  }

  function render() {
    var target = val('target'), kind = val('kind')
    var parts = $('model').value.split('|'), family = parts[0], model = parts[1]
    var nodes = $('nodes').value.split(',').map(function (s) { return s.trim() }).filter(Boolean)
    var id = ($('hid').value.trim() || 'h-' + family + '-1').replace(/[^\w.-]/g, '-')
    $('where').textContent = NAMES[target]
    var m = OPEN_WEIGHTS.filter(function (x) { return x.tag === model })[0]
    $('modelNote').textContent = kind === 'local' && m ? 'Needs about ' + memoryNeededGb(m.paramsB) + ' GB of memory (modeled); router tier: ' + tierFor(m.paramsB) + '.' : 'Any machine can call an open-weight model served over an API.'
    var flags = ['--target ' + (target === 'buttons' ? 'local' : target), '--kind ' + kind, '--family ' + family, '--model ' + model, '--id ' + id]
    if (nodes.length) flags.push('--nodes ' + nodes.join(','))
    var envBase = { VERAFY_HARNESS_ID: id, VERAFY_FAMILY: family, VERAFY_MODEL: model, VERAFY_BOND: '500', VERAFY_PORT: '7200' }
    if (nodes.length) envBase.VERAFY_NODES = nodes.join(',')
    var html = ''
    if (target === 'local' || target === 'docker') {
      html += block('With verafy up', 'verafy up ' + flags.join(' \\\n  '), 'Asks for your key without echoing it, shows the plan, and runs it.')
      if (kind === 'local') html += block('First, the model', 'ollama pull ' + model, 'Install <a href="https://ollama.com">Ollama</a>; it serves an OpenAI-compatible endpoint the harness calls on port 11434.')
      if (target === 'local') {
        var envs = Object.keys(envBase).map(function (k) { return k + '=' + envBase[k] })
        if (kind === 'local') envs.push('VERAFY_BASE_URL=http://127.0.0.1:11434/v1')
        html += block('Or by hand', (kind === 'hosted' ? 'export VERAFY_API_KEY=...   # your key\n' : '') + envs.join(' \\\n  ') + ' \\\n  verafy harness serve')
      } else {
        var d = ['docker run -d --name verafy-' + id + ' --restart unless-stopped', '-p 7200:7200 -v verafy-' + id + ':/data']
        Object.keys(envBase).forEach(function (k) { d.push('-e ' + k + '=' + envBase[k]) })
        if (kind === 'hosted') d.push('-e VERAFY_API_KEY')
        else d.push('-e VERAFY_BASE_URL=http://host.docker.internal:11434/v1 --add-host host.docker.internal:host-gateway')
        d.push('ghcr.io/verafyai/verafy-harness:latest')
        html += block('Or with Docker directly', d.join(' \\\n  '), kind === 'hosted' ? 'Export VERAFY_API_KEY first; Docker passes it through without writing it down.' : '')
      }
      if (nodes.length) html += '<p class="warn">Nodes must reach this harness: set VERAFY_PUBLIC_URL to a public address, a tunnel or a LAN address.</p>'
    } else if (target === 'digitalocean' || target === 'hetzner') {
      var sized = kind === 'local' ? sizeFor(model) : 'api'
      var plan = sized && PLANS[target][sized]
      html += block('With verafy up', (target === 'digitalocean' ? 'export DIGITALOCEAN_TOKEN=...' : 'export HCLOUD_TOKEN=...') + '\n# the token is used once, never stored\n' + (kind === 'hosted' ? 'export VERAFY_API_KEY=...\n' : '') + 'verafy up ' + flags.concat(plan ? ['--plan ' + plan] : []).join(' \\\n  '), 'Creates one server (' + (plan || 'pick a GPU plan') + '), waits for its address, and prints the health URL. The provider bills for the server from creation until you delete it.')
      if (!plan) html += '<p class="warn">' + esc(model) + ' needs more memory than the CPU plans here; use a GPU server or a hosted model.</p>'
    } else if (target === 'user-data') {
      var env = Object.assign({}, envBase)
      if (kind === 'hosted') env.VERAFY_API_KEY = 'PASTE_YOUR_KEY_HERE'
      else env.VERAFY_BASE_URL = 'http://127.0.0.1:11434/v1'
      html += block('First-boot script (user data)', cloudInit({ env: env, ollamaTag: kind === 'local' ? model : null, cloud: 'generic' }), 'Create an Ubuntu 24.04 server, paste this into its "user data" or "cloud-init" field, replace the key placeholder, and open port 7200. It installs Node 22, runs the daemon as a hardened service, and keeps the harness key on the server.')
    } else {
      html += '<p>Both build the Dockerfile from the repo and ask for your key as an encrypted secret.</p>'
      html += '<p class="btns"><a class="btn" href="https://render.com/deploy?repo=https://github.com/Verafyai/verafyHarness">Deploy to Render</a> <a class="btn" href="https://cloud.digitalocean.com/apps/new?repo=https://github.com/Verafyai/verafyHarness/tree/main">Deploy to DigitalOcean</a></p>'
      html += '<p class="note">Set VERAFY_FAMILY to <code>' + esc(family) + '</code> and VERAFY_MODEL to <code>' + esc(model) + '</code> in the form. One-click hosts suit hosted models; open weights need a GPU server.</p>'
    }
    $('out').innerHTML = html
  }

  function table() {
    $('hwTable').innerHTML = OPEN_WEIGHTS.map(function (m) { return '<tr><td>' + esc(m.model) + '</td><td>' + esc(m.family) + '</td><td><code>' + esc(m.tag) + '</code></td><td class="v">' + memoryNeededGb(m.paramsB) + ' GB</td><td>' + tierFor(m.paramsB) + '</td></tr>' }).join('')
  }

  document.addEventListener('change', function (e) { if (e.target.name === 'kind') fillModels(); render() })
  document.addEventListener('input', function (e) { if (e.target.id === 'nodes' || e.target.id === 'hid') render() })
  document.addEventListener('click', function (e) {
    if (!e.target.classList.contains('copy')) return
    var code = e.target.parentNode.querySelector('code').textContent
    try { navigator.clipboard.writeText(code); e.target.textContent = 'Copied' } catch (err) { e.target.textContent = 'Select and copy' }
    setTimeout(function () { e.target.textContent = 'Copy' }, 1500)
  })
  fillModels(); table(); render()
})()
