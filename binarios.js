// binarios.js - prepara yt-dlp y ffmpeg cuando el servidor no los trae
const fs = require('fs')
const path = require('path')
const { execFile } = require('child_process')

const BIN = path.join(__dirname, 'bin')
fs.mkdirSync(BIN, { recursive: true })
process.env.PATH = BIN + path.delimiter + (process.env.PATH || '')

function existe(cmd, args) {
  return new Promise(resolve => {
    execFile(cmd, args || ['--version'], { timeout: 20000 }, err => resolve(!err))
  })
}

async function prepararFfmpeg() {
  if (await existe('ffmpeg', ['-version'])) return
  let origen
  try { origen = require('ffmpeg-static') } catch {}
  if (!origen || !fs.existsSync(origen)) {
    console.log('ffmpeg: no está disponible (falta ffmpeg-static)')
    return
  }
  const destino = path.join(BIN, 'ffmpeg')
  try {
    fs.rmSync(destino, { force: true })
    fs.symlinkSync(origen, destino)
  } catch {
    fs.copyFileSync(origen, destino)
  }
  try { fs.chmodSync(destino, 0o755) } catch {}
  console.log('ffmpeg listo (ffmpeg-static)')
}

async function prepararYtDlp() {
  if (await existe('yt-dlp')) return
  let nombre = 'yt-dlp'
  if (process.platform === 'linux' && process.arch === 'x64') nombre = 'yt-dlp_linux'
  else if (process.platform === 'linux' && process.arch === 'arm64') nombre = 'yt-dlp_linux_aarch64'
  console.log('Descargando yt-dlp (' + nombre + ')...')
  const res = await fetch('https://github.com/yt-dlp/yt-dlp/releases/latest/download/' + nombre, { redirect: 'follow' })
  if (!res.ok) throw new Error('HTTP ' + res.status)
  const buf = Buffer.from(await res.arrayBuffer())
  const destino = path.join(BIN, 'yt-dlp')
  fs.writeFileSync(destino + '.tmp', buf)
  fs.chmodSync(destino + '.tmp', 0o755)
  fs.renameSync(destino + '.tmp', destino)
  console.log('yt-dlp listo')
}

function preparar() {
  prepararFfmpeg().catch(e => console.log('ffmpeg:', e.message))
  prepararYtDlp().catch(e => console.log('yt-dlp:', e.message))
}

module.exports = { preparar }
