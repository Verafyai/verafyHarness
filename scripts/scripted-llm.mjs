#!/usr/bin/env node
/**
 * A scripted OpenAI-compatible chat completions server, so a DeepSeek Harness
 * juror can run end to end with no model key. DSH reaches it through an ordinary
 * `dsh-llm-pi-ai` route (`api: openai-completions`), the same route type the live
 * OpenRouter jurors use; only the baseURL and model id differ.
 *
 * The script is stateless and reads the conversation to decide the next step:
 *
 *   1. (with --probe) call every non-Verafy tool the headless profile mounts, once
 *      each, whether offered or not, to show the juror lock refuses them all
 *   2. call verafy_load_contract on the contract path
 *   3. call verafy_cast_vote with the family's answer from examples/mock-answers.json
 *   4. reply with plain text
 *
 * The family is read from the model id: `scripted-<family>`. Requests without tools
 * (auxiliary calls such as session titles) get a short text reply.
 *
 *   node scripts/scripted-llm.mjs --port 8790 --asc examples/market-resolution.json [--probe]
 *
 * Writes one JSON line per request to stdout. This is a test double, not a model.
 */
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const opt = (name, fallback) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : fallback }
const port = Number(opt('--port', '8790'))
const ascPath = resolve(opt('--asc', join(ROOT, 'examples', 'market-resolution.json')))
const probe = argv.includes('--probe')
const asc = JSON.parse(readFileSync(ascPath, 'utf8'))
const script = JSON.parse(readFileSync(join(ROOT, 'examples', 'mock-answers.json'), 'utf8'))

const PROBE = ['bash', 'create_goal', 'edit', 'get_goal', 'glob', 'grep', 'interrupt_agent', 'job_kill', 'job_list', 'job_output', 'list_agents', 'read', 'read_image', 'send_message', 'skill', 'subagent', 'subagent_fork', 'todo_write', 'update_goal', 'wait_agent', 'web_fetch', 'workflow', 'working_directory', 'write']
let n = 0
const log = record => process.stdout.write(JSON.stringify({ t: new Date().toISOString(), ...record }) + '\n')

/** Names of tools the assistant already called, in order, with their results. */
function history(messages) {
  const calls = []
  for (const m of messages) {
    if (m.role === 'assistant') for (const c of m.tool_calls ?? []) calls.push({ id: c.id, name: c.function?.name, result: null })
    if (m.role === 'tool') {
      const c = calls.find(x => x.id === m.tool_call_id)
      if (c) c.result = typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
    }
  }
  return calls
}

function next(body) {
  const tools = (body.tools ?? []).map(t => t.function?.name).filter(Boolean)
  if (tools.length === 0) return { text: 'Verafy juror run' }
  const family = String(body.model).replace(/^scripted-/, '')
  const done = history(body.messages ?? [])
  const called = name => done.some(c => c.name === name)
  if (probe) {
    // Every tool the headless profile mounts, offered or not: the lock hides them
    // from the juror, and the model calling one anyway must still fail.
    const other = [...PROBE, ...tools].find(t => !t.startsWith('verafy_') && !called(t))
    if (other) return { tool: other, args: {}, note: 'probe: a non-Verafy tool, which the juror lock must refuse' }
  }
  if (!called('verafy_load_contract')) return { tool: 'verafy_load_contract', args: { path: ascPath } }
  if (!called('verafy_cast_vote')) {
    const vote = script[asc.id]?.[family]
    if (!vote) return { text: `no scripted answer for ${asc.id} / ${family}` }
    return { tool: 'verafy_cast_vote', args: vote }
  }
  return { text: 'Vote committed.' }
}

function chunk(id, model, delta, finish = null) {
  return { id, object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model, choices: [{ index: 0, delta, finish_reason: finish }] }
}

const server = createServer((req, res) => {
  if (req.method === 'GET' && req.url.endsWith('/models')) {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ data: Object.keys(script[asc.id] ?? {}).map(l => ({ id: `scripted-${l}` })) }))
    return
  }
  if (req.method !== 'POST' || !req.url.endsWith('/chat/completions')) { res.writeHead(404).end(); return }
  let raw = ''
  req.on('data', d => { raw += d })
  req.on('end', () => {
    const body = JSON.parse(raw)
    const step = next(body)
    const id = `scripted-${++n}`
    const prior = history(body.messages ?? []).map(c => ({ name: c.name, result: c.result?.slice(0, 160) ?? null }))
    log({ request: n, model: body.model, stream: !!body.stream, tools: (body.tools ?? []).length, prior, reply: step.tool ? { tool: step.tool, args: step.args } : { text: step.text }, note: step.note })
    const message = step.tool
      ? { role: 'assistant', content: null, tool_calls: [{ id: `call_${n}`, type: 'function', function: { name: step.tool, arguments: JSON.stringify(step.args) } }] }
      : { role: 'assistant', content: step.text }
    const finish = step.tool ? 'tool_calls' : 'stop'
    const usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
    if (!body.stream) {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ id, object: 'chat.completion', created: Math.floor(Date.now() / 1000), model: body.model, choices: [{ index: 0, message, finish_reason: finish }], usage }))
      return
    }
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' })
    const send = obj => res.write(`data: ${JSON.stringify(obj)}\n\n`)
    if (step.tool) {
      send(chunk(id, body.model, { role: 'assistant', content: null, tool_calls: [{ index: 0, id: `call_${n}`, type: 'function', function: { name: step.tool, arguments: '' } }] }))
      send(chunk(id, body.model, { tool_calls: [{ index: 0, function: { arguments: JSON.stringify(step.args) } }] }))
    } else {
      send(chunk(id, body.model, { role: 'assistant', content: step.text }))
    }
    send(chunk(id, body.model, {}, finish))
    send({ id, object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model: body.model, choices: [], usage })
    res.end('data: [DONE]\n\n')
  })
})

server.listen(port, '127.0.0.1', () => log({ ready: `http://127.0.0.1:${port}/v1`, asc: asc.id, probe }))
