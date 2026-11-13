// descargas.js - descargas con yt-dlp (TikTok, Instagram, Facebook, X y YouTube)
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFile } = require('child_process')

const ESPERA_MS = 20000
const ultimoUso = new Map()

function entornoYt() {
  const dir = path.join(process.cwd(), 'tmp-ytdlp')
  try { fs.mkdirSync(dir, { recursive: true }) } catch {}
  return { ...process.env, TMPDIR: dir, TEMP: dir, TMP: dir }
}

function ytdlp(args, timeout = 150000) {
  return new Promise((resolve, reject) => {
    execFile('yt-dlp', args, { timeout, maxBuffer: 10 * 1024 * 1024, env: entornoYt() }, (err, stdout, stderr) => {
      if (err) {
        if (err.code === 'ENOENT') return reject(new Error('yt-dlp no está instalado en este servidor. El dueño puede instalarlo con #herramientas instalar'))
        const linea = String(stderr || err.message || '').split('\n').map(s => s.trim()).filter(Boolean).pop()
        return reject(new Error(linea || err.message))
      }
      resolve(stdout)
    })
  })
}

function traducirError(msg) {
  const m = String(msg || '')
  if (/PYI-\d+|Failed to extract/i.test(m)) return 'El servidor no pudo usar yt-dlp (poco espacio o sin permisos). Avisa al dueño.'
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

function sondear(ruta) {
  return new Promise(resolve => {
    execFile('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name', '-of', 'json', ruta], { timeout: 30000 }, (err, stdout) => {
      if (err) return resolve(null)
      try {
        const s = JSON.parse(stdout).streams || []
        resolve({
          v: (s.find(x => x.codec_type === 'video') || {}).codec_name,
          a: (s.find(x => x.codec_type === 'audio') || {}).codec_name
        })
      } catch {
        resolve(null)
      }
    })
  })
}

function correrFfmpeg(args) {
  return new Promise((resolve, reject) => {
    execFile('ffmpeg', args, { timeout: 180000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(String(stderr || err.message).split('\n').filter(Boolean).slice(-1)[0] || 'ffmpeg falló'))
      resolve()
    })
  })
}

async function compatibilizar(ruta) {
  const salida = ruta.slice(0, ruta.lastIndexOf('.')) + '_wa.mp4'
  const info = await sondear(ruta)
  console.log('Video descargado: video=' + (info && info.v) + ' audio=' + (info && info.a))
  const bien = info && info.v === 'h264' && (!info.a || info.a === 'aac')
  const args = bien
    ? ['-y', '-i', ruta, '-c', 'copy', '-movflags', '+faststart', salida]
    : ['-y', '-i', ruta, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-vf', "scale='min(720,iw)':-2", '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', salida]
  await correrFfmpeg(args)
  try { fs.unlinkSync(ruta) } catch {}
  return salida
}

function formatoDuracion(seg) {
  seg = Math.round(seg)
  const h = Math.floor(seg / 3600)
  const m = Math.floor((seg % 3600) / 60)
  const s = seg % 60
  const dos = n => String(n).padStart(2, '0')
  return h ? h + ':' + dos(m) + ':' + dos(s) : m + ':' + dos(s)
}

function hace(info) {
  let t = null
  if (info.timestamp) t = info.timestamp * 1000
  else if (/^[0-9]{8}$/.test(info.upload_date || '')) {
    t = Date.UTC(Number(info.upload_date.slice(0, 4)), Number(info.upload_date.slice(4, 6)) - 1, Number(info.upload_date.slice(6, 8)))
  }
  if (!t) return null
  const dias = Math.floor((Date.now() - t) / 86400000)
  if (dias < 1) return 'hoy'
  if (dias < 30) return 'hace ' + dias + (dias === 1 ? ' día' : ' días')
  const meses = Math.floor(dias / 30.4)
  if (meses < 12) return 'hace ' + meses + (meses === 1 ? ' mes' : ' meses')
  const anios = Math.floor(dias / 365.25)
  return 'hace ' + anios + (anios === 1 ? ' año' : ' años')
}

async function bajarMiniatura(url) {
  try {
    const control = new AbortController()
    const t = setTimeout(() => control.abort(), 15000)
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: control.signal, redirect: 'follow' })
    clearTimeout(t)
    if (!res.ok) return null
    const tipo = String(res.headers.get('content-type') || '')
    if (!/jpe?g|png/i.test(tipo)) return null
    const buf = Buffer.from(await res.arrayBuffer())
    return buf.length < 3 * 1024 * 1024 ? buf : null
  } catch {
    return null
  }
}

async function informacion(tipo, entrada, usuario) {
  const ahora = Date.now()
  const previo = ultimoUso.get(usuario) || 0
  if (usuario && ahora - previo < ESPERA_MS) {
    const falta = Math.ceil((ESPERA_MS - (ahora - previo)) / 1000)
    return { ok: false, espera: true, error: 'Espera ' + falta + ' segundos antes de pedir otra descarga.' }
  }
  if (usuario) ultimoUso.set(usuario, ahora)
  try {
    const bajo = entrada.toLowerCase()
    const esUrl = bajo.startsWith('http://') || bajo.startsWith('https://')
    const objetivo = esUrl ? entrada : 'ytsearch1:' + entrada
    const salida = await ytdlp([
      '--dump-single-json', '--no-playlist', '--no-warnings', '--skip-download',
      '--js-runtimes', 'node:' + process.execPath,
      '--cache-dir', path.join(process.cwd(), 'tmp-ytdlp', 'cache'),
      objetivo
    ], 90000)
    let datos = JSON.parse(salida)
    if (datos.entries) datos = datos.entries[0]
    if (!datos) return { ok: false }
    const titulo = String(datos.title || 'Sin título').slice(0, 110)
    const canal = datos.channel || datos.uploader || datos.uploader_id || 'Desconocido'
    const palabra = tipo === 'musica' ? 'audio' : (datos.duration ? 'video' : 'archivo')
    const lineas = ['➩ Descargando › ' + titulo, '', '❖ Canal › *' + canal + '*']
    if (datos.duration) lineas.push('⧖ Duración › *' + formatoDuracion(datos.duration) + '*')
    if (typeof datos.view_count === 'number') lineas.push('❀ Vistas › *' + datos.view_count.toLocaleString('en-US') + '*')
    const pub = hace(datos)
    if (pub) lineas.push('☆ Publicado › *' + pub + '*')
    const enlace = datos.webpage_url || datos.original_url || ''
    if (enlace) lineas.push('❐ Enlace › ' + enlace)
    lineas.push('', '⏳ Espera un momento mientras preparo tu ' + palabra + '...')
    const candidatas = (datos.thumbnails || [])
      .filter(x => x.url && (x.url.includes('.jpg') || x.url.includes('.jpeg')))
      .map(x => x.url)
      .reverse()
      .slice(0, 3)
    if (datos.thumbnail) candidatas.push(datos.thumbnail)
    let miniatura = null
    for (const u of candidatas) {
      miniatura = await bajarMiniatura(u)
      if (miniatura) break
    }
    return { ok: true, texto: lineas.join('\n'), miniatura, objetivo: enlace || entrada }
  } catch (e) {
    console.log('Info yt-dlp:', e.message)
    return { ok: false }
  }
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
    '--no-playlist', '--no-warnings', '--no-progress', '--js-runtimes', 'node:' + process.execPath, '--cache-dir', path.join(process.cwd(), 'tmp-ytdlp', 'cache'),
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
    args = [...comunes, '-f', 'bv*[height<=480][vcodec^=avc1]+ba[acodec^=mp4a]/bv*[height<=480][vcodec^=avc1]+ba/b[height<=480][ext=mp4]/bv*[height<=480]+ba/b', '--merge-output-format', 'mp4', objetivo]
    tipoResultado = 'video'
  } else if (tipo === 'pinterest') {
    args = [...comunes, '-f', 'best', entrada]
    tipoResultado = 'video'
  } else {
    args = [...comunes, '-f', 'bv*[vcodec^=avc1]+ba[acodec^=mp4a]/bv*[vcodec^=avc1]+ba/b[ext=mp4]/bv*+ba/b', '--merge-output-format', 'mp4', entrada]
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
    if (tipo === 'pinterest' && archivos[0] && /\.(jpe?g|png|webp|gif)$/i.test(archivos[0])) tipoResultado = 'image'
    if (!archivos.length) {
      limpiar()
      return { ok: false, error: 'No pude descargarlo. Puede que sea muy pesado (más de 50 MB) o no esté disponible.' }
    }
    let titulo = ''
    try { titulo = fs.readFileSync(base + '.titulo', 'utf8').split('\n')[0].trim().slice(0, 200) } catch {}
    try { fs.unlinkSync(base + '.titulo') } catch {}
    let rutaFinal = path.join(dir, archivos[0])
    if (tipoResultado === 'video') {
      try {
        rutaFinal = await compatibilizar(rutaFinal)
      } catch (e) {
        console.log('Compatibilizar:', e.message)
      }
    }
    return { ok: true, tipo: tipoResultado, url: 'file:' + rutaFinal, titulo }
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


async function buscarImagenes(consulta, limite = 3) {
  if (!consulta || /^https?:\/\//i.test(consulta)) {
    throw new Error('Escribe el nombre de la imagen que deseas buscar.')
  }

  const headers = {
    'User-Agent': 'Mozilla/5.0',
    'Accept': 'application/json, text/plain, */*'
  }

  const pagina = await fetch(
    'https://duckduckgo.com/?q=' + encodeURIComponent(consulta) + '&iax=images&ia=images',
    { headers, signal: AbortSignal.timeout(15000) }
  )

  if (!pagina.ok) throw new Error('No pude conectar con el buscador.')
  const html = await pagina.text()
  const token = html.match(/vqd=['"]?([\d-]+)['"]?/i)

  if (!token) throw new Error('El buscador no permitió realizar la búsqueda. Intenta más tarde.')

  const api = new URL('https://duckduckgo.com/i.js')
  api.search = new URLSearchParams({
    l: 'us-en',
    o: 'json',
    q: consulta,
    vqd: token[1],
    f: ',,,',
    p: '1',
    kp: '1'
  })

  const respuesta = await fetch(api, {
    headers,
    signal: AbortSignal.timeout(15000)
  })

  if (!respuesta.ok) throw new Error('El buscador no está disponible.')
  const datos = await respuesta.json()
  const vistos = new Set()

  return (datos.results || [])
    .filter(x => typeof x.image === 'string' && /^https?:\/\//i.test(x.image))
    .filter(x => {
      if (vistos.has(x.image)) return false
      vistos.add(x.image)
      return true
    })
    .slice(0, Math.min(3, Math.max(1, limite)))
    .map(x => ({
      url: x.image,
      titulo: String(x.title || consulta).slice(0, 180)
    }))
}

module.exports = { informacion, descargar, bajarMedia, buscarImagenes }
