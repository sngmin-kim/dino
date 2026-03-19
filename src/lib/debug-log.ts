export interface DebugEntry {
  time: string
  tag: 'Bridge' | 'API' | 'Auth'
  message: string
  detail?: string
}

type Listener = (entries: DebugEntry[]) => void

const MAX_ENTRIES = 80
const entries: DebugEntry[] = []
const listeners = new Set<Listener>()

function now() {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}.${String(d.getMilliseconds()).padStart(3, '0')}`
}

export function dlog(tag: DebugEntry['tag'], message: string, detail?: string) {
  const entry: DebugEntry = { time: now(), tag, message, detail }
  entries.push(entry)
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES)
  listeners.forEach(fn => fn([...entries]))
}

export function getDebugEntries() {
  return [...entries]
}

export function onDebugLog(fn: Listener) {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}
