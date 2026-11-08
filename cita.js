const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFile } = require('child_process')

const FUENTES = [
  '/system/fonts/Roboto-Regular.ttf',
  '/system/fonts/NotoSans-Regular.ttf',
  '/system/fonts/DroidSans.ttf'
]

function envolver(texto, ancho, maxLineas) {
  const palabras = texto.replace(/\s+/g, ' ').trim().split(' ')
  const lineas = []
  let actual = ''
  for (const p of palabras) {
    if ((actual + ' ' + p).trim().length > ancho) {
      if (actual) lineas.push(actual)
      actual = p
      while (actual.length > ancho) {
        lineas.push(actual.slice(0, ancho))
        actual = actual.slice(ancho)
      }
    } else {
      actual = (actual + ' ' + p).trim()
    }
  }
  if (actual) lineas.push(actual)
  if (lineas.length > maxLineas) {
    lineas.length = maxLineas
    lineas[maxLineas - 1] = lineas[maxLineas - 1].slice(0, ancho - 1) + '…'
  }
  return lineas.join('\n')
}

function crearCita({ nombre, texto, avatar }) {
  return new Promise((resolve, reject) => {
    const fuente = FUENTES.find(f => fs.existsSync(f))
    if (!fuente) return reject(new Error('No encontré una fuente en el teléfono'))
    const base = path.join(os.tmpdir(), 'cita_' + Date.now() + '_' + Math.floor(Math.random() * 1e6))
    const archivos = [base + '_n.txt', base + '_t.txt', base + '_a.img', base + '.webp']
    const limpiar = s => s.replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\uFE0F\u200D]/gu, '')
    fs.writeFileSync(archivos[0], limpiar(nombre).slice(0, 24) || 'Usuario')
    fs.writeFileSync(archivos[1], envolver(limpiar(texto), 26, 8) || ' ')
    const args = ['-y', '-f', 'lavfi', '-i', 'color=c=0x202c33:s=512x512:d=1']
    let filtro
    if (avatar) {
      fs.writeFileSync(archivos[2], avatar)
      args.push('-i', archivos[2])
      filtro = '[1:v]scale=96:96[av];[0:v][av]overlay=24:24[bg];[bg]'
    } else {
      filtro = '[0:v]'
    }
    filtro +=
      'drawtext=fontfile=' + fuente + ':textfile=' + archivos[0] + ':expansion=none:fontcolor=0x53bdeb:fontsize=32:x=136:y=44,' +
      'drawtext=fontfile=' + fuente + ':textfile=' + archivos[1] + ':expansion=none:fontcolor=white:fontsize=30:x=24:y=150:line_spacing=10'
    args.push('-filter_complex', filtro, '-frames:v', '1', '-c:v', 'libwebp', '-lossless', '0', '-quality', '85', archivos[3])
    execFile('ffmpeg', args, err => {
      try {
        if (err) return reject(err)
        resolve(fs.readFileSync(archivos[3]))
      } catch (e) {
        reject(e)
      } finally {
        for (const f of archivos) {
          try { fs.unlinkSync(f) } catch {}
        }
      }
    })
  })
}

module.exports = { crearCita }
