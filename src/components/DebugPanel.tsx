import { useState, useEffect, useRef } from 'react'
import { type DebugEntry, getDebugEntries, onDebugLog } from '../lib/debug-log'

const TAG_COLORS: Record<DebugEntry['tag'], string> = {
  Bridge: '#a78bfa',
  API: '#34d399',
  Auth: '#fbbf24',
}

export default function DebugPanel() {
  const [entries, setEntries] = useState<DebugEntry[]>(getDebugEntries)
  const [open, setOpen] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => onDebugLog(setEntries), [])

  useEffect(() => {
    if (open && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [entries, open])

  const ctx = window.SeniorContext
  const hasBridge = !!window.SeniorBridge

  return (
    <>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          position: 'fixed', top: 4, right: 4, zIndex: 99999,
          background: '#1e1e1e', color: '#0f0', border: '1px solid #333',
          borderRadius: 4, padding: '2px 8px', fontSize: 11, fontFamily: 'monospace',
          opacity: 0.85,
        }}
      >
        {open ? 'X' : `DBG(${entries.length})`}
      </button>

      {open && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 99998,
          background: 'rgba(0,0,0,0.92)', color: '#ccc', fontFamily: 'monospace',
          fontSize: 11, maxHeight: '45vh', display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ padding: '6px 8px', borderBottom: '1px solid #333', fontSize: 10, lineHeight: 1.5 }}>
            <span style={{ color: '#888' }}>Bridge:</span>{' '}
            <span style={{ color: hasBridge ? '#34d399' : '#f87171' }}>{hasBridge ? 'Y' : 'N'}</span>
            {' | '}
            <span style={{ color: '#888' }}>Context:</span>{' '}
            <span style={{ color: ctx ? '#34d399' : '#f87171' }}>{ctx ? 'Y' : 'N'}</span>
            {ctx && (<>
              {' | '}
              <span style={{ color: '#888' }}>userId:</span> {ctx.userId}
              {' | '}
              <span style={{ color: '#888' }}>token:</span> {ctx.token?.slice(0, 10)}...
              {' | '}
              <span style={{ color: '#888' }}>platform:</span> {ctx.platform}
              {' | '}
              <span style={{ color: '#888' }}>v:</span> {ctx.appVersion}
            </>)}
          </div>
          <div ref={listRef} style={{ overflow: 'auto', flex: 1, padding: '4px 8px' }}>
            {entries.map((e, i) => (
              <div key={i} style={{ lineHeight: 1.4, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                <span style={{ color: '#555' }}>{e.time}</span>{' '}
                <span style={{ color: TAG_COLORS[e.tag], fontWeight: 600 }}>[{e.tag}]</span>{' '}
                <span>{e.message}</span>
                {e.detail && <span style={{ color: '#888' }}> {e.detail}</span>}
              </div>
            ))}
            {entries.length === 0 && <div style={{ color: '#555' }}>no logs</div>}
          </div>
        </div>
      )}
    </>
  )
}
