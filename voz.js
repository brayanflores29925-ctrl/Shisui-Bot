// voz.js - texto a voz con el sintetizador de Google Translate (sin clave)
// Estilos: "anime" (voz aguda), "jp" (japonés)
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFile } = require('child_process')

const UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36'
const TONO_ANIME = 1.45
const FILTRO_ANIME = 'aresample=44100,asetrate=44100*' + TONO_ANIME + ',aresample=44100,atempo=' + (1.1 / TONO_ANIME).toFixed(3)

function partir(texto, max = 180) {
  const palabras = texto.replace(/\s+/g, ' ').trim().split(' ')
  const partes = []
  let actual = ''
  for (const p of palabras) {
    if ((actual + ' ' + p).trim().length > max) {
      if (actual) partes.push(actual)
      actual = p.slice(0, max)
    } else {
      actual = (actual + ' ' + p).trim()
    }
  }
  if (actual) partes.push(actual)
  return partes
}

async function pedirParte(texto, idioma) {
  const url =
    'https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=' + idioma +
    '&q=' + encodeURIComponent(texto)
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error('HTTP ' + res.status)
  return Buffer.from(await res.arrayBuffer())
}

function convertir(buffer, estilo, formato) {
  return new Promise((resolve, reject) => {
    const base = path.join(os.tmpdir(), 'voz_' + Date.now() + '_' + Math.floor(Math.random() * 1e6))
    const entrada = base + '_in.mp3'
    const salida = base + (formato === 'opus' ? '_out.ogg' : '_out.mp3')
    fs.writeFileSync(entrada, buffer)
    const args = ['-y', '-i', entrada]
    if (estilo === 'anime') args.push('-af', FILTRO_ANIME)
    if (formato === 'opus') args.push('-c:a', 'libopus', '-b:a', '32k', '-application', 'voip')
    else args.push('-c:a', 'libmp3lame', '-q:a', '4')
    args.push(salida)
    execFile('ffmpeg', args, (err, stdout, stderr) => {
      try {
        if (err) {
          const detalle = String(stderr || err.message).split('\n').filter(Boolean).slice(-2).join(' ')
          return reject(new Error(detalle.slice(0, 200)))
        }
        resolve(fs.readFileSync(salida))
      } catch (e) {
        reject(e)
      } finally {
        try { fs.unlinkSync(entrada) } catch {}
        try { fs.unlinkSync(salida) } catch {}
      }
    })
  })
}

async function textoAVoz(texto, apikey) {
  let idioma = 'es'
  let estilo = null
  texto = String(texto || '').trim()
  while (true) {
    const mm = texto.match(/^(anime|jp|japon[eé]s)\b\s*/i)
    if (!mm) break
    if (mm[1].toLowerCase() === 'anime') estilo = 'anime'
    else idioma = 'ja'
    texto = texto.slice(mm[0].length).trim()
  }
  if (!texto) {
    return { ok: false, error: 'Escribe el texto después. Ejemplo: #voz anime hola a todos' }
  }
  try {
    const buffers = []
    for (const parte of partir(texto)) {
      buffers.push(await pedirParte(parte, idioma))
    }
    const mp3 = Buffer.concat(buffers)
    try {
      const ogg = await convertir(mp3, estilo, 'opus')
      return { ok: true, buffer: ogg, mimetype: 'audio/ogg; codecs=opus' }
    } catch (e) {
      console.log('Voz: falló opus:', e.message)
    }
    try {
      const salida = await convertir(mp3, estilo, 'mp3')
      return { ok: true, buffer: salida, mimetype: 'audio/mpeg' }
    } catch (e) {
      console.log('Voz: falló mp3:', e.message)
      if (estilo) {
        return { ok: false, error: 'No pude aplicar el efecto de voz (ffmpeg falló).' }
      }
      return { ok: true, buffer: mp3, mimetype: 'audio/mpeg' }
    }
  } catch (e) {
    console.log('Error en voz:', e.message)
    return { ok: false, error: 'No pude generar la voz (' + e.message + '). Intenta de nuevo.' }
  }
}

module.exports = { textoAVoz }
