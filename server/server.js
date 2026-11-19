// Personal Clipping Studio: local server (Stage 1)
// Stores projects in SQLite and streams video files to the browser in small chunks.
import Fastify from 'fastify'
import multipart from '@fastify/multipart'
import { DatabaseSync } from 'node:sqlite'
import { execFile } from 'node:child_process'
import { createReadStream, createWriteStream, existsSync, mkdirSync, statSync, unlinkSync } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DATA = path.join(ROOT, 'data')
const VIDEOS = path.join(DATA, 'videos')
mkdirSync(VIDEOS, { recursive: true })

const db = new DatabaseSync(path.join(DATA, 'studio.db'))
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  owned INTEGER NOT NULL,          -- 1 = copy stored in data/videos, 0 = linked from elsewhere
  size INTEGER, duration REAL, width INTEGER, height INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`)

const MIME = { '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.mkv': 'video/x-matroska' }
const ALLOWED = new Set(Object.keys(MIME))

// Reads duration and resolution with ffprobe. If ffprobe is missing we carry on without them.
const probe = (file) => new Promise((resolve) => {
  execFile('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries',
    'stream=width,height:format=duration', '-of', 'json', file], (err, out) => {
    if (err) return resolve({})
    try {
      const j = JSON.parse(out)
      resolve({ width: j.streams?.[0]?.width, height: j.streams?.[0]?.height, duration: Number(j.format?.duration) || null })
    } catch { resolve({}) }
  })
})

const toApi = (r) => ({ id: r.id, name: r.name, size: r.size, duration: r.duration, width: r.width,
  height: r.height, linked: !r.owned, createdAt: r.created_at, missing: !existsSync(r.file_path) })

function addProject({ name, file, owned }) {
  const id = randomUUID()
  return probe(file).then((m) => {
    db.prepare('INSERT INTO projects (id,name,file_path,owned,size,duration,width,height) VALUES (?,?,?,?,?,?,?,?)')
      .run(id, name, file, owned ? 1 : 0, statSync(file).size, m.duration ?? null, m.width ?? null, m.height ?? null)
    return toApi(db.prepare('SELECT * FROM projects WHERE id=?').get(id))
  })
}

const app = Fastify({ logger: { level: 'warn' } })
await app.register(multipart, { limits: { fileSize: 50 * 1024 ** 3 } })

app.get('/api/projects', async () =>
  db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all().map(toApi))

app.get('/api/projects/:id', async (req, reply) => {
  const r = db.prepare('SELECT * FROM projects WHERE id=?').get(req.params.id)
  return r ? toApi(r) : reply.code(404).send({ error: 'Project not found.' })
})

// Upload: the file is streamed straight to disk, never held in memory.
app.post('/api/projects/upload', async (req, reply) => {
  const part = await req.file()
  if (!part) return reply.code(400).send({ error: 'No file received.' })
  const ext = path.extname(part.filename).toLowerCase()
  if (!ALLOWED.has(ext)) return reply.code(400).send({ error: `Unsupported file type "${ext}". Use MP4, MOV, M4V, WEBM or MKV.` })
  const dest = path.join(VIDEOS, `${randomUUID()}${ext}`)
  try {
    await pipeline(part.file, createWriteStream(dest))
  } catch (e) {
    if (existsSync(dest)) unlinkSync(dest)
    return reply.code(500).send({ error: 'Upload failed. Check that you have enough free disk space.' })
  }
  return addProject({ name: path.basename(part.filename, ext), file: dest, owned: true })
})

// Link: use a file where it already lives (no copy, no extra disk space).
app.post('/api/projects/link', async (req, reply) => {
  const file = String(req.body?.path ?? '').trim().replace(/^["']|["']$/g, '')
  const ext = path.extname(file).toLowerCase()
  if (!file || !existsSync(file) || !statSync(file).isFile()) return reply.code(400).send({ error: 'No file found at that path. Check the spelling and try again.' })
  if (!ALLOWED.has(ext)) return reply.code(400).send({ error: `Unsupported file type "${ext}". Use MP4, MOV, M4V, WEBM or MKV.` })
  return addProject({ name: path.basename(file, ext), file, owned: false })
})

app.patch('/api/projects/:id', async (req, reply) => {
  const name = String(req.body?.name ?? '').trim()
  if (!name) return reply.code(400).send({ error: 'Name cannot be empty.' })
  db.prepare('UPDATE projects SET name=? WHERE id=?').run(name, req.params.id)
  return toApi(db.prepare('SELECT * FROM projects WHERE id=?').get(req.params.id))
})

// Delete only removes files this app created; linked originals are never touched.
app.delete('/api/projects/:id', async (req, reply) => {
  const r = db.prepare('SELECT * FROM projects WHERE id=?').get(req.params.id)
  if (!r) return reply.code(404).send({ error: 'Project not found.' })
  if (r.owned && existsSync(r.file_path)) unlinkSync(r.file_path)
  db.prepare('DELETE FROM projects WHERE id=?').run(r.id)
  return reply.code(204).send()
})

// Video streaming with HTTP Range support, so seeking works and only needed bytes are read.
app.get('/media/:id', (req, reply) => {
  const r = db.prepare('SELECT * FROM projects WHERE id=?').get(req.params.id)
  if (!r || !existsSync(r.file_path)) return reply.code(404).send({ error: 'Video file not found.' })
  const size = statSync(r.file_path).size
  const type = MIME[path.extname(r.file_path).toLowerCase()] ?? 'application/octet-stream'
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? '')
  if (!m) return reply.headers({ 'Content-Type': type, 'Content-Length': size, 'Accept-Ranges': 'bytes' }).send(createReadStream(r.file_path))
  let start = m[1] ? Number(m[1]) : size - Number(m[2])
  let end = m[1] && m[2] ? Number(m[2]) : size - 1
  if (start >= size || end >= size || start > end) return reply.code(416).header('Content-Range', `bytes */${size}`).send()
  reply.code(206).headers({ 'Content-Type': type, 'Content-Length': end - start + 1,
    'Content-Range': `bytes ${start}-${end}/${size}`, 'Accept-Ranges': 'bytes' })
  return reply.send(createReadStream(r.file_path, { start, end }))
})

await app.listen({ port: 3001, host: '127.0.0.1' })
console.log('Clipping Studio server ready on http://127.0.0.1:3001')
