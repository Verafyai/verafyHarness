'use client'

import React, { useRef, useState } from 'react'

/**
 * Saves the nearest [data-snapshot] block as a PNG. Elements marked data-snapshot-skip (this button, rerun
 * buttons) are left out; elements marked data-snapshot-only (the source line) appear only in the image.
 */
export function Snapshot({ name, label = 'Snapshot' }: { name: string; label?: string }) {
  const ref = useRef<HTMLButtonElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function take() {
    const root = ref.current?.closest<HTMLElement>('[data-snapshot]')
    if (!root) return
    setBusy(true)
    setError('')
    const only = Array.from(root.querySelectorAll<HTMLElement>('[data-snapshot-only]'))
    only.forEach((el) => (el.style.display = 'block'))
    try {
      const { toPng } = await import('html-to-image')
      const url = await toPng(root, {
        pixelRatio: 2,
        backgroundColor: '#05080d',
        cacheBust: true,
        filter: (node) => !(node instanceof HTMLElement && node.dataset.snapshotSkip !== undefined),
        style: { margin: '0' },
      })
      const a = document.createElement('a')
      a.href = url
      a.download = `verafy-${name}-${new Date().toISOString().slice(0, 10)}.png`
      a.click()
    } catch {
      setError('Could not make the image. Try again.')
    } finally {
      only.forEach((el) => (el.style.display = ''))
      setBusy(false)
    }
  }

  return (
    <span data-snapshot-skip className="inline-flex items-center gap-2">
      <button
        ref={ref}
        type="button"
        onClick={take}
        disabled={busy}
        data-track="thesis_snapshot"
        className="inline-flex min-h-9 items-center gap-2 rounded border border-[#232c36] px-3 text-sm text-[#e6edf3] hover:border-[#5fe0c8] hover:text-[#5fe0c8] disabled:opacity-60"
      >
        <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
          <circle cx="12" cy="13" r="3.5" />
        </svg>
        {busy ? 'Saving...' : label}
      </button>
      {error ? <span className="text-sm text-[#f28b82]">{error}</span> : null}
    </span>
  )
}

/** A source line that shows only in snapshots, so a shared image says where it came from. */
export function SnapshotSource({ anchor }: { anchor: string }) {
  return (
    <p data-snapshot-only style={{ display: 'none' }} className="m-0 mt-4 border-t border-[#232c36] pt-3 font-mono text-sm text-[#9aa6b2]">
      verafy.ai/thesis/claims#{anchor}. Ruled by an AI jury on Swarm Explorer. The labs do not endorse Verafy.
    </p>
  )
}
