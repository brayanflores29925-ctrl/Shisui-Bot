// rapido.js - descargas rápidas con yt-dlp: búsqueda ligera, tarjeta y descarga en paralelo
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFile } = require('child_process')

const ESPERA_MS = 15000
const ultimoUso = new Map()

function entorno() {
  const dir = path.join(process.cwd(), 'tmp-ytdlp')
  try { fs.mkdirSync(dir, { recursive: true }) } catch {}
  return { ...process.env, TMPDIR: dir, TEMP: dir, TMP: dir }
}

function correr(cmd, args, timeout) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: timeout || 240000, maxBuffer: 20 * 1024 * 1024, env: entorno() }, (err, stdout, stderr) => {
      if (err) {
        if (err.code === 'ENOENT') return reject(new Error('NOINSTALADO'))
        const linea = String(stderr || err.message || '').split('\n').map(s => s.trim()).filter(Boolean).pop()
        return reject(new Error(linea || err.message))
      }
      resolve(String(stdout || ''))
    })
  })
}

function baseArgs() {
  return [
    '--no-warnings', '--no-progress', '--no-playlist',
    '--js-runtimes', 'node:' + process.execPath,
    '--cache-dir', path.join(process.cwd(), 'tmp-ytdlp', 'cache'),
    '--socket-timeout', '20', '--retries', '3'
  ]
}

function traducir(msg) {
  const m = String(msg || '')
  if (m === 'NOINSTALADO') return 'yt-dlp no está instalado en este servidor. El dueño puede instalarlo con #herramientas instalar'
  if (/private|login|log in|sign in|cookies|members only/i.test(m)) return 'Ese contenido es privado o pide iniciar sesión.'
  if (/Cannot parse data|Unable to extract|Unsupported URL/i.test(m)) return 'No pude leer ese enlace. Prueba con el enlace directo del video, o puede que esté privado.'
  if (/max-filesize|larger than/i.test(m)) return 'El archivo pesa más de 50 MB.'
  if (/429|Too Many Requests/i.test(m)) return 'Hay demasiadas solicitudes. Intenta más tarde.'
  if (/PYI-[0-9]+|Failed to extract|No space left|ENOSPC/i.test(m)) return 'El servidor no pudo usar yt-dlp (poco espacio o sin permisos). Avisa al dueño.'
  return m.replace(/^ERROR:\s*/, '').slice(0, 150)
}

function formatoDuracion(seg) {
  seg = Math.round(seg)
  const h = Math.floor(seg / 3600)
  const m = Math.floor((seg % 3600) / 60)
  const s = seg % 60
  const dos = n => String(n).padStart(2, '0')
  return h ? h + ':' + dos(m) + ':' + dos(s) : m + ':' + dos(s)
}

function hace(d) {
  let t = null
  if (d.timestamp) t = d.timestamp * 1000
  else if (/^[0-9]{8}$/.test(d.upload_date || '')) {
    t = Date.UTC(Number(d.upload_date.slice(0, 4)), Number(d.upload_date.slice(4, 6)) - 1, Number(d.upload_date.slice(6, 8)))
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

function esperar(ms) {
  return new Promise(r => setTimeout(r, ms))
}

async function bajarMiniatura(url) {
  let t
  try {
    const control = new AbortController()
    t = setTimeout(() => control.abort(), 15000)
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'image/jpeg,image/png,image/webp,*/*' },
      signal: control.signal,
      redirect: 'follow'
    })
    if (!res.ok) return null
    const tipo = String(res.headers.get('content-type') || '').toLowerCase()
    if (!/^image\/(jpeg|jpg|png|webp)(;|$)/i.test(tipo)) return null
    const buf = Buffer.from(await res.arrayBuffer())
    return buf.length > 0 && buf.length < 3 * 1024 * 1024 ? buf : null
  } catch {
    return null
  } finally {
    if (t) clearTimeout(t)
  }
}

function miniaturasDe(d) {
  const urls = (d.thumbnails || [])
    .filter(x => x.url && /^https?:\/\//i.test(x.url))
    .map(x => x.url)
    .reverse()
    .slice(0, 5)
  if (d.thumbnail && /^https?:\/\//i.test(d.thumbnail)) urls.push(d.thumbnail)
  return [...new Set(urls)]
}

function armarTarjeta(d, tipo) {
  const titulo = String(d.title || 'Sin título').slice(0, 110)
  const canal = d.channel || d.uploader || d.uploader_id || 'Desconocido'
  const palabra = tipo === 'musica' ? 'audio' : (d.duration ? 'video' : 'archivo')
  const lineas = ['➩ Descargando › ' + titulo, '', '❖ Canal › *' + canal + '*']
  if (d.duration) lineas.push('⧖ Duración › *' + formatoDuracion(d.duration) + '*')
  if (typeof d.view_count === 'number') lineas.push('❀ Vistas › *' + d.view_count.toLocaleString('en-US') + '*')
  const pub = hace(d)
  if (pub) lineas.push('☆ Publicado › *' + pub + '*')
  const enlace = d.webpage_url || d.original_url || (String(d.url || '').startsWith('http') ? d.url : '')
  if (enlace) lineas.push('❐ Enlace › ' + enlace)
  lineas.push('', '⏳ Espera un momento mientras preparo tu ' + palabra + '...')
  return lineas.join('\n')
}

async function compatibilizar(ruta) {
  const salida = ruta.slice(0, ruta.lastIndexOf('.')) + '_wa.mp4'
  let info = null
  try {
    const j = JSON.parse(await correr('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name', '-of', 'json', ruta], 30000))
    const s = j.streams || []
    info = {
      v: (s.find(x => x.codec_type === 'video') || {}).codec_name,
      a: (s.find(x => x.codec_type === 'audio') || {}).codec_name
    }
  } catch {}
  console.log('Video descargado: video=' + (info && info.v) + ' audio=' + (info && info.a))
  const bien = info && info.v === 'h264' && (!info.a || info.a === 'aac')
  const args = bien
    ? ['-y', '-i', ruta, '-c', 'copy', '-movflags', '+faststart', salida]
    : ['-y', '-i', ruta, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-vf', "scale='min(720,iw)':-2", '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', salida]
  await correr('ffmpeg', args, 180000)
  try { fs.unlinkSync(ruta) } catch {}
  return salida
}

async function procesar(op) {
  const { tipo, entrada, usuario, tarjeta } = op
  const ahora = Date.now()
  const previo = ultimoUso.get(usuario) || 0
  if (usuario && ahora - previo < ESPERA_MS) {
    const falta = Math.ceil((ESPERA_MS - (ahora - previo)) / 1000)
    return { ok: false, espera: true, error: 'Espera ' + falta + ' segundos antes de pedir otra descarga.' }
  }
  if (usuario) ultimoUso.set(usuario, ahora)

  const bajo = entrada.toLowerCase()
  const esUrl = bajo.startsWith('http://') || bajo.startsWith('https://')
  const dir = os.tmpdir()
  const prefijo = 'dl_' + Date.now() + '_' + Math.floor(Math.random() * 1e6)
  const base = path.join(dir, prefijo)
  const limpiar = () => {
    try {
      for (const f of fs.readdirSync(dir)) {
        if (f.startsWith(prefijo)) {
          try { fs.unlinkSync(path.join(dir, f)) } catch {}
        }
      }
    } catch {}
  }
  let cancelado = false
  let tarjetaEnviada = false
  let avisoEnviado = false
  let titulo = ''
  let temporizador = null
  const enviarTarjeta = async datos => {
    if (!tarjeta || tarjetaEnviada || cancelado || !datos) return
    tarjetaEnviada = true
    titulo = String(datos.title || '').slice(0, 200)
    let miniatura = null
    for (const u of miniaturasDe(datos)) {
      miniatura = await bajarMiniatura(u)
      if (miniatura) break
    }
    await tarjeta(armarTarjeta(datos, tipo), miniatura)
  }

  try {
    let objetivo = entrada
    let datosBusqueda = null
    if (!esUrl) {
      const salida = await correr('yt-dlp', [...baseArgs(), '--flat-playlist', '--dump-single-json', 'ytsearch1:' + entrada], 60000)
      const j = JSON.parse(salida)
      const e = j.entries && j.entries[0]
      if (!e) return { ok: false, error: 'No encontré resultados para esa búsqueda.' }
      objetivo = String(e.url || '').startsWith('http') ? e.url : 'https://www.youtube.com/watch?v=' + e.id
      datosBusqueda = e
    }

    const args = [...baseArgs(), '--max-filesize', '50M', '--concurrent-fragments', '4', '-o', base + '.%(ext)s']
    if (tipo === 'musica') {
      args.push('-f', 'bestaudio[ext=m4a]/bestaudio')
    } else if (tipo === 'video') {
      args.push('-f', 'bv*[height<=480][vcodec^=avc1]+ba[acodec^=mp4a]/bv*[height<=480][vcodec^=avc1]+ba/b[height<=480][vcodec^=h264]/b[height<=480][vcodec^=avc1]/b[height<=480][ext=mp4]/bv*[height<=480]+ba/b', '--merge-output-format', 'mp4')
    } else {
      args.push('-f', 'bv*[vcodec^=avc1]+ba[acodec^=mp4a]/bv*[vcodec^=avc1]+ba/b[vcodec^=h264]/b[vcodec^=avc1]/b[ext=mp4]/bv*+ba/b', '--merge-output-format', 'mp4')
    }
    args.push(objetivo)

    const descarga = correr('yt-dlp', args, 240000)
    descarga.catch(() => {})

    let promesaInfo = null
    if (datosBusqueda) {
      await enviarTarjeta(datosBusqueda)
    } else {
      promesaInfo = (async () => {
        try {
          const sal = await correr('yt-dlp', [...baseArgs(), '--dump-single-json', '--skip-download', entrada], 90000)
          let datos = JSON.parse(sal)
          if (datos.entries) datos = datos.entries[0]
          await enviarTarjeta(datos)
        } catch {}
      })()
      temporizador = setTimeout(() => {
        if (!tarjetaEnviada && !avisoEnviado && !cancelado && tarjeta) {
          avisoEnviado = true
          tarjeta('⏳ Descargando, espera un momento...', null).catch(() => {})
        }
      }, 6000)
    }

    await descarga
    if (temporizador) clearTimeout(temporizador)
    if (promesaInfo) await Promise.race([promesaInfo, esperar(3000)])

    const archivos = fs.readdirSync(dir).filter(f => f.startsWith(prefijo) && !f.endsWith('.part') && !f.endsWith('.ytdl'))
    if (!archivos.length) {
      limpiar()
      return { ok: false, error: 'No pude descargarlo. Puede que sea muy pesado (más de 50 MB) o no esté disponible.' }
    }
    let ruta = path.join(dir, archivos[0])
    const ext = path.extname(ruta).slice(1).toLowerCase()
    if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
      return { ok: true, tipo: 'image', ruta, titulo }
    }
    if (tipo === 'musica') {
      if (['m4a', 'aac', 'mp4'].includes(ext)) return { ok: true, tipo: 'audio', ruta, mimetype: 'audio/mp4', titulo }
      if (ext === 'mp3') return { ok: true, tipo: 'audio', ruta, mimetype: 'audio/mpeg', titulo }
      const salidaAudio = base + '_a.m4a'
      await correr('ffmpeg', ['-y', '-i', ruta, '-vn', '-c:a', 'aac', '-b:a', '128k', salidaAudio], 120000)
      try { fs.unlinkSync(ruta) } catch {}
      return { ok: true, tipo: 'audio', ruta: salidaAudio, mimetype: 'audio/mp4', titulo }
    }
    try {
      ruta = await compatibilizar(ruta)
    } catch (e) {
      console.log('Compatibilizar:', e.message)
    }
    return { ok: true, tipo: 'video', ruta, titulo }
  } catch (e) {
    cancelado = true
    if (temporizador) clearTimeout(temporizador)
    limpiar()
    console.log('Error de descarga:', e.message)
    return { ok: false, error: traducir(e.message) }
  }
}

module.exports = { procesar }
