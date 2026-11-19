// One data layer, two modes:
//  - Local mode (npm run dev): talks to the local server, which stores videos on disk.
//  - Browser mode (GitHub Pages build): no server. Projects and videos are stored in this
//    browser's own storage (IndexedDB) and never leave the visitor's device.
import { useEffect, useState } from 'react'

export const STATIC = import.meta.env.VITE_STATIC === 'true'
const EXTS = ['.mp4', '.m4v', '.mov', '.webm', '.mkv']

// ---------- local server mode ----------
async function api(url, opts) {
  const res = await fetch(url, opts)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Something went wrong (${res.status}). Is the server running?`)
  }
  return res.status === 204 ? null : res.json()
}
const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

function uploadFile(file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/projects/upload')
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total)
    xhr.onload = () => {
      const body = JSON.parse(xhr.responseText || '{}')
      xhr.status < 300 ? resolve(body) : reject(new Error(body.error || 'Upload failed.'))
    }
    xhr.onerror = () => reject(new Error('Could not reach the server. Is it running?'))
    const form = new FormData()
    form.append('file', file)
    xhr.send(form)
  })
}

// ---------- browser mode (IndexedDB) ----------
let dbPromise
const idb = () => (dbPromise ??= new Promise((resolve, reject) => {
  const req = indexedDB.open('clipping-studio', 1)
  req.onupgradeneeded = () => req.result.createObjectStore('projects', { keyPath: 'id' })
  req.onsuccess = () => resolve(req.result)
  req.onerror = () => reject(new Error('This browser blocked local storage. Try a normal (non-private) window.'))
}))
const tx = async (mode, fn) => {
  const store = (await idb()).transaction('projects', mode).objectStore('projects')
  return new Promise((resolve, reject) => {
    const req = fn(store)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}
const strip = ({ blob, ...meta }) => meta

function readMeta(file) {
  return new Promise((resolve) => {
    const v = document.createElement('video')
    const url = URL.createObjectURL(file)
    const done = (m) => { URL.revokeObjectURL(url); resolve(m) }
    v.preload = 'metadata'
    v.onloadedmetadata = () => done({ duration: v.duration, width: v.videoWidth, height: v.videoHeight })
    v.onerror = () => done({})
    v.src = url
  })
}

// ---------- shared API used by the UI ----------
export const listProjects = () => STATIC
  ? tx('readonly', (s) => s.getAll()).then((all) => all.map(strip).sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
  : api('/api/projects')

export const getProject = (id) => STATIC
  ? tx('readonly', (s) => s.get(id)).then((p) => { if (!p) throw new Error('Project not found.'); return strip(p) })
  : api(`/api/projects/${id}`)

export async function addFile(file, onProgress) {
  if (!STATIC) return uploadFile(file, onProgress)
  const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase()
  if (!EXTS.includes(ext)) throw new Error(`Unsupported file type "${ext}". Use MP4, MOV, M4V, WEBM or MKV.`)
  const meta = await readMeta(file)
  const project = { id: crypto.randomUUID(), name: file.name.replace(/\.[^.]+$/, ''), size: file.size,
    duration: meta.duration ?? null, width: meta.width ?? null, height: meta.height ?? null,
    createdAt: new Date().toISOString(), blob: file }
  try { await tx('readwrite', (s) => s.put(project)) }
  catch { throw new Error('Could not save this video in the browser. Free some disk space, or use the local version for large files.') }
  onProgress(1)
  return strip(project)
}

export const linkPath = (path) => api('/api/projects/link', json('POST', { path }))

export const renameProject = (id, name) => STATIC
  ? tx('readwrite', (s) => s.get(id)).then(async (p) => { await tx('readwrite', (s) => s.put({ ...p, name })) })
  : api(`/api/projects/${id}`, json('PATCH', { name }))

export const removeProject = (id) => STATIC
  ? tx('readwrite', (s) => s.delete(id))
  : api(`/api/projects/${id}`, { method: 'DELETE' })

// Returns a playable URL for a project's video (null until ready).
export function useMediaUrl(id) {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    if (!STATIC) return setUrl(`/media/${id}`)
    let made
    let cancelled = false
    tx('readonly', (s) => s.get(id)).then((p) => {
      if (p && !cancelled) { made = URL.createObjectURL(p.blob); setUrl(made) }
    })
    return () => { cancelled = true; made && URL.revokeObjectURL(made) }
  }, [id])
  return url
}
