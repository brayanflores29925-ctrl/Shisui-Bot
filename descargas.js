// descargas.js - descargas con yt-dlp (TikTok, Instagram, Facebook, X y YouTube)
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFile } = require('child_process')

const ESPERA_MS = 20000
const ultimoUso = new Map()

function ytdlp(args, timeout = 150000) {
  return new Promise((resolve, reject) => {
    execFile('yt-dlp', args, { timeout, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        if (err.code === 'ENOENT') return reject(new Error('yt-dlp todavía no está listo en este servidor. Intenta de nuevo en un minuto.'))
        const linea = String(stderr || err.message || '').split('\n').map(s => s.trim()).filter(Boolean).pop()
        return reject(new Error(linea || err.message))
      }
      resolve(stdout)
    })
  })
}

function traducirError(msg) {
  const m = String(msg || '')
  if (/private|login|log in|sign in|cookies|members only/i.test(m)) {
    return 'Ese contenido es privado o pide iniciar sesión.'
  }
  if (/Cannot parse data|Unable to extract|Unsupported URL/i.test(m)) {
    return 'No pude leer ese enlace. Prueba con el enlace directo del video, o puede que esté privado.'
  }
  if (/max-filesize|larger than/i.test(m)) {
    return 'El archivo pesa más de 50 MB.'
  }
  if (/HTTP Error 429|Too Many Requests/i.test(m)) {
    return 'Hay demasiadas solicitudes. Intenta más tarde.'
  }
  return m.replace(/^ERROR:\s*/, '').slice(0, 150)
}

async function descargar(tipo, entrada, apikey, usuario) {
  const ahora = Date.now()
  const previo = ultimoUso.get(usuario) || 0
  if (usuario && ahora - previo < ESPERA_MS) {
    const falta = Math.ceil((ESPERA_MS - (ahora - previo)) / 1000)
    return { ok: false, error: 'Espera ' + falta + ' segundos antes de pedir otra descarga.' }
  }
  if (usuario) ultimoUso.set(usuario, ahora)

  const esUrl = /^https?:\/\//i.test(entrada)
  const dir = os.tmpdir()
  const prefijo = 'dl_' + Date.now() + '_' + Math.floor(Math.random() * 1e6)
  const base = path.join(dir, prefijo)
  const comunes = [
    '--no-playlist', '--no-warnings', '--no-progress', '--js-runtimes', 'node:' + process.execPath,
    '--max-filesize', '50M',
    '-o', base + '.%(ext)s',
    '--print-to-file', '%(title)s', base + '.titulo'
  ]
  let args
  let tipoResultado
  if (tipo === 'musica') {
    const objetivo = esUrl ? entrada : 'ytsearch1:' + entrada
    args = [...comunes, '-x', '--audio-format', 'mp3', '--audio-quality', '5', objetivo]
    tipoResultado = 'audio'
  } else if (tipo === 'video') {
    const objetivo = esUrl ? entrada : 'ytsearch1:' + entrada
    args = [...comunes, '-f', 'bv*[height<=480]+ba/b[height<=480]/bv*+ba/b', '--merge-output-format', 'mp4', objetivo]
    tipoResultado = 'video'
  } else {
    args = [...comunes, '-f', 'bv*+ba/b', '--merge-output-format', 'mp4', entrada]
    tipoResultado = 'video'
  }

  const limpiar = () => {
    try {
      for (const f of fs.readdirSync(dir)) {
        if (f.startsWith(prefijo)) {
          try { fs.unlinkSync(path.join(dir, f)) } catch {}
        }
      }
    } catch {}
  }

  try {
    await ytdlp(args)
    const archivos = fs.readdirSync(dir).filter(f =>
      f.startsWith(prefijo) && !f.endsWith('.titulo') && !f.endsWith('.part') && !f.endsWith('.ytdl')
    )
    if (!archivos.length) {
      limpiar()
      return { ok: false, error: 'No pude descargarlo. Puede que sea muy pesado (más de 50 MB) o no esté disponible.' }
    }
    let titulo = ''
    try { titulo = fs.readFileSync(base + '.titulo', 'utf8').split('\n')[0].trim().slice(0, 200) } catch {}
    try { fs.unlinkSync(base + '.titulo') } catch {}
    return { ok: true, tipo: tipoResultado, url: 'file:' + path.join(dir, archivos[0]), titulo }
  } catch (e) {
    limpiar()
    console.log('Error de yt-dlp:', e.message)
    return { ok: false, error: traducirError(e.message) }
  }
}

async function bajarMedia(url, maxMB = 60) {
  if (url.startsWith('file:')) {
    const ruta = url.slice(5)
    try {
      const buf = fs.readFileSync(ruta)
      if (buf.length > maxMB * 1024 * 1024) throw new Error('El archivo pesa más de ' + maxMB + ' MB')
      return buf
    } finally {
      try { fs.unlinkSync(ruta) } catch {}
    }
  }
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, redirect: 'follow' })
  if (!res.ok) throw new Error('HTTP ' + res.status + ' al bajar el archivo')
  return Buffer.from(await res.arrayBuffer())
}

module.exports = { descargar, bajarMedia }
