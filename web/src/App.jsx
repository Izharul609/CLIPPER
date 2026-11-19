import { useCallback, useEffect, useRef, useState } from 'react'

import { STATIC, addFile, getProject, linkPath as linkByPath, listProjects, removeProject, renameProject, useMediaUrl } from './store.js'

// ---------- helpers ----------
const pad = (n) => String(Math.floor(n)).padStart(2, '0')
export function timecode(s = 0) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
  const base = `${pad(m)}:${pad(sec)}.${String(Math.floor((sec % 1) * 100)).padStart(2, '0')}`
  return h ? `${h}:${base}` : base
}
const duration = (s) => (s == null ? 'unknown length' : timecode(s).replace(/\.\d+$/, ''))
const bytes = (n) => (n > 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(1)} GB` : `${Math.round(n / 1024 ** 2)} MB`)

function useRoute() {
  const [hash, setHash] = useState(window.location.hash || '#/')
  useEffect(() => {
    const on = () => setHash(window.location.hash || '#/')
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  const m = /^#\/project\/([\w-]+)/.exec(hash)
  return m ? { page: 'editor', id: m[1] } : { page: 'dashboard' }
}

// ---------- shell ----------
export default function App() {
  const route = useRoute()
  return (
    <div className="shell">
      <header className="topbar">
        <a className="brand" href="#/">Clipping Studio</a>
        <nav>
          <a href="#/" aria-current={route.page === 'dashboard' ? 'page' : undefined}>Dashboard</a>
          <span className="soon" title="Arrives in Stage 3">AI highlights</span>
          <span aria-current={route.page === 'editor' ? 'page' : undefined} className={route.page === 'editor' ? 'on' : 'soon'}>Editor</span>
          <span className="soon" title="Arrives in Stage 2">Export</span>
        </nav>
      </header>
      {route.page === 'editor' ? <Editor id={route.id} /> : <Dashboard />}
    </div>
  )
}

// ---------- dashboard ----------
function Dashboard() {
  const [projects, setProjects] = useState(null)
  const [busy, setBusy] = useState(null) // { label, progress }
  const [error, setError] = useState('')
  const [linkPath, setLinkPath] = useState('')
  const [dragging, setDragging] = useState(false)
  const fileInput = useRef()

  const load = useCallback(() => listProjects().then(setProjects).catch((e) => { setError(e.message); setProjects([]) }), [])
  useEffect(() => { load() }, [load])

  async function importFiles(files) {
    setError('')
    for (const f of files) {
      setBusy({ label: f.name, progress: 0 })
      try { await addFile(f, (p) => setBusy({ label: f.name, progress: p })) }
      catch (e) { setError(e.message); break }
    }
    setBusy(null)
    load()
  }

  async function linkFile(e) {
    e.preventDefault()
    setError('')
    try {
      await linkByPath(linkPath)
      setLinkPath('')
      load()
    } catch (err) { setError(err.message) }
  }

  async function remove(p) {
    const note = p.linked ? 'The original video file stays where it is.' : STATIC ? 'The copy stored in this browser will be deleted.' : 'The imported copy of the video will be deleted.'
    if (!confirm(`Delete "${p.name}"? ${note}`)) return
    await removeProject(p.id)
    load()
  }

  async function rename(p) {
    const name = prompt('Project name', p.name)
    if (name?.trim()) { await renameProject(p.id, name.trim()); load() }
  }

  return (
    <main className="dash">
      <section className="import">
        <div
          className={`drop ${dragging ? 'over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); importFiles([...e.dataTransfer.files]) }}
        >
          <h2>Import a video</h2>
          <p>Drop a file here, or choose one. MP4, MOV, M4V, WEBM and MKV work.</p>
          <button className="primary" onClick={() => fileInput.current.click()} disabled={!!busy}>Choose file</button>
          <input ref={fileInput} type="file" accept="video/*,.mkv" multiple hidden onChange={(e) => importFiles([...e.target.files])} />
          {busy && (
            <div className="progress" role="status">
              <span>Importing {busy.label}</span>
              <progress value={busy.progress} max="1" />
            </div>
          )}
        </div>
        {!STATIC && <form className="link" onSubmit={linkFile}>
          <label htmlFor="path">Large file? Use it where it is, without copying.</label>
          <div className="row">
            <input id="path" value={linkPath} onChange={(e) => setLinkPath(e.target.value)} placeholder="C:\Videos\podcast-episode.mp4" />
            <button disabled={!linkPath.trim()}>Add</button>
          </div>
        </form>}
        {STATIC && <p className="muted">Browser mode: your videos stay on this device, stored in this browser. Clearing site data removes them.</p>}
        <p className="muted">YouTube import arrives in a later stage. For your own videos, download the original from YouTube Studio and import it here.</p>
        {error && <p className="error" role="alert">{error}</p>}
      </section>

      <section className="projects">
        <h2>Projects</h2>
        {projects === null && <p className="muted">Loading…</p>}
        {projects?.length === 0 && <p className="muted">No projects yet. Import a video to start clipping.</p>}
        <ul>
          {projects?.map((p) => (
            <li key={p.id} className={p.missing ? 'missing' : ''}>
              <a href={`#/project/${p.id}`} className="title">{p.name}</a>
              <span className="meta">
                {duration(p.duration)}
                {p.width ? ` · ${p.width}×${p.height}` : ''} · {bytes(p.size)}{p.linked ? ' · linked' : ''}
              </span>
              {p.missing && <span className="error">File moved or deleted. Remove this project and import again.</span>}
              <span className="actions">
                <button className="ghost" onClick={() => rename(p)}>Rename</button>
                <button className="ghost danger" onClick={() => remove(p)}>Delete</button>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}

// ---------- editor (Stage 1: playback and navigation) ----------
const FRAME = 1 / 30
function Editor({ id }) {
  const video = useRef()
  const [project, setProject] = useState(null)
  const [error, setError] = useState('')
  const [t, setT] = useState(0)
  const [dur, setDur] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [rate, setRate] = useState(1)
  const src = useMediaUrl(id)

  useEffect(() => { getProject(id).then(setProject).catch((e) => setError(e.message)) }, [id])

  const seek = useCallback((to) => {
    const v = video.current
    if (v) v.currentTime = Math.max(0, Math.min(v.duration || 0, to))
  }, [])
  const toggle = useCallback(() => { const v = video.current; v && (v.paused ? v.play() : v.pause()) }, [])

  useEffect(() => {
    function onKey(e) {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) && e.target.type !== 'range') return
      const v = video.current
      if (!v) return
      const step = e.shiftKey ? FRAME : 5
      if (e.code === 'Space' || e.key === 'k') { e.preventDefault(); toggle() }
      else if (e.key === 'ArrowLeft' || e.key === 'j') { e.preventDefault(); seek(v.currentTime - step) }
      else if (e.key === 'ArrowRight' || e.key === 'l') { e.preventDefault(); seek(v.currentTime + step) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [seek, toggle])

  if (error) return <main className="editor-empty"><p className="error">{error}</p><a href="#/">Back to projects</a></main>
  if (!project) return <main className="editor-empty"><p className="muted">Loading…</p></main>

  return (
    <main className="editor">
      <div className="editor-head">
        <a href="#/">Projects</a>
        <h1>{project.name}</h1>
      </div>
      <div className="stage">
        <video
          ref={video}
          src={src ?? undefined}
          preload="metadata"
          onClick={toggle}
          onTimeUpdate={(e) => setT(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => setDur(e.currentTarget.duration)}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onError={() => setError('This browser cannot play this video format. MP4 (H.264) works best; Stage 2 adds automatic lightweight previews for other formats.')}
        />
      </div>
      <div className="transport">
        <input
          type="range" min="0" max={dur || 0} step="0.01" value={t}
          aria-label="Position"
          onChange={(e) => seek(Number(e.target.value))}
          style={{ '--fill': dur ? `${(t / dur) * 100}%` : '0%' }}
        />
        <div className="controls">
          <span className="clock">{timecode(t)} <i>/ {timecode(dur)}</i></span>
          <span className="buttons">
            <button onClick={() => seek(t - 5)} title="Back 5 seconds (←)">−5s</button>
            <button onClick={() => seek(t - FRAME)} title="Previous frame (Shift+←)">◂ frame</button>
            <button className="primary" onClick={toggle} title="Play / pause (Space)">{playing ? 'Pause' : 'Play'}</button>
            <button onClick={() => seek(t + FRAME)} title="Next frame (Shift+→)">frame ▸</button>
            <button onClick={() => seek(t + 5)} title="Forward 5 seconds (→)">+5s</button>
          </span>
          <label className="speed">Speed
            <select value={rate} onChange={(e) => { const r = Number(e.target.value); setRate(r); video.current.playbackRate = r }}>
              {[0.5, 1, 1.25, 1.5, 2].map((r) => <option key={r} value={r}>{r}×</option>)}
            </select>
          </label>
        </div>
      </div>
    </main>
  )
}
