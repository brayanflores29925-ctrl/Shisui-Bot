// binarios.js - prepara yt-dlp y ffmpeg cuando el servidor no los trae
const fs = require('fs')
const path = require('path')
const { execFile } = require('child_process')

const BIN = path.join(__dirname, 'bin')
const TMP = path.join(process.cwd(), 'tmp-ytdlp')
fs.mkdirSync(BIN, { recursive: true })
fs.mkdirSync(TMP, { recursive: true })
process.env.PATH = BIN + path.delimiter + (process.env.PATH || '')

function existe(cmd, args) {
  return new Promise(resolve => {
    execFile(
      cmd,
      args || ['--version'],
      { timeout: 60000, env: { ...process.env, TMPDIR: TMP, TEMP: TMP, TMP: TMP } },
      err => resolve(!err)
    )
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
  const python = await existe('python3', ['-c', 'import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)'])
  let nombre = 'yt-dlp'
  if (!python) {
    if (process.platform === 'linux' && process.arch === 'x64') nombre = 'yt-dlp_linux'
    else if (process.platform === 'linux' && process.arch === 'arm64') nombre = 'yt-dlp_linux_aarch64'
  }
  console.log('Descargando yt-dlp (' + nombre + (python ? ', con python3' : '') + ')...')
  const res = await fetch('https://github.com/yt-dlp/yt-dlp/releases/latest/download/' + nombre, { redirect: 'follow' })
  if (!res.ok) throw new Error('HTTP ' + res.status)
  const buf = Buffer.from(await res.arrayBuffer())
  const destino = path.join(BIN, 'yt-dlp')
  fs.writeFileSync(destino + '.tmp', buf)
  fs.chmodSync(destino + '.tmp', 0o755)
  fs.renameSync(destino + '.tmp', destino)
  if (await existe('yt-dlp')) console.log('yt-dlp listo')
  else console.log('yt-dlp se descargó pero no arranca (¿poco espacio o sin permisos?)')
}

function preparar() {
  if ((process.env.PREFIX || '').includes('com.termux')) return
  let activo = false
  try { activo = JSON.parse(fs.readFileSync('./config.json', 'utf8')).herramientas === true } catch {}
  if (!activo) {
    console.log('Herramientas (yt-dlp/ffmpeg): desactivadas en este servidor')
    return
  }
  prepararFfmpeg().catch(e => console.log('ffmpeg:', e.message))
  prepararYtDlp().catch(e => console.log('yt-dlp:', e.message))
}

module.exports = { preparar }
