// herramientas.js - instala o repara yt-dlp y ffmpeg desde el propio bot
const fs = require('fs')
const path = require('path')
const { execFile } = require('child_process')

const BIN = path.join(process.cwd(), 'bin')
const TMP = path.join(process.cwd(), 'tmp-ytdlp')

function entorno() {
  fs.mkdirSync(BIN, { recursive: true })
  fs.mkdirSync(TMP, { recursive: true })
  if (!(process.env.PATH || '').split(path.delimiter).includes(BIN)) {
    process.env.PATH = BIN + path.delimiter + (process.env.PATH || '')
  }
  return { ...process.env, TMPDIR: TMP, TEMP: TMP, TMP: TMP }
}

function correr(cmd, args, opciones) {
  return new Promise(resolve => {
    execFile(cmd, args, { timeout: 120000, maxBuffer: 10 * 1024 * 1024, env: entorno(), ...(opciones || {}) }, (err, stdout, stderr) => {
      resolve({ ok: !err, salida: String(stdout || '') + String(stderr || '') })
    })
  })
}

async function version(cmd, args) {
  const r = await correr(cmd, args, { timeout: 30000 })
  return r.ok ? r.salida.split('\n')[0].trim() : null
}

function libreMB() {
  try {
    const s = fs.statfsSync('.')
    return Math.round(s.bavail * s.bsize / 1048576)
  } catch {
    return null
  }
}

async function estado() {
  return { ytdlp: await version('yt-dlp', ['--version']), ffmpeg: await version('ffmpeg', ['-version']) }
}

async function instalar() {
  entorno()
  const errores = []
  let e = await estado()
  if (!e.ffmpeg) {
    try { require.resolve('ffmpeg-static') } catch {
      await correr('npm', ['install', 'ffmpeg-static', '--no-save', '--no-audit', '--no-fund'], { timeout: 600000, cwd: process.cwd() })
    }
    try {
      const origen = require('ffmpeg-static')
      if (origen && fs.existsSync(origen)) {
        const destino = path.join(BIN, 'ffmpeg')
        try {
          fs.rmSync(destino, { force: true })
          fs.symlinkSync(origen, destino)
        } catch {
          fs.copyFileSync(origen, destino)
        }
        try { fs.chmodSync(destino, 0o755) } catch {}
      } else {
        errores.push('ffmpeg: no encontré el programa')
      }
    } catch (er) {
      errores.push('ffmpeg: ' + String(er.message).slice(0, 80))
    }
  }
  if (!e.ytdlp) {
    try {
      const python = (await correr('python3', ['-c', 'import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)'], { timeout: 20000 })).ok
      let nombre = 'yt-dlp'
      if (!python && process.platform === 'linux' && process.arch === 'x64') nombre = 'yt-dlp_linux'
      else if (!python && process.platform === 'linux' && process.arch === 'arm64') nombre = 'yt-dlp_linux_aarch64'
      const res = await fetch('https://github.com/yt-dlp/yt-dlp/releases/latest/download/' + nombre, { redirect: 'follow' })
      if (!res.ok) throw new Error('HTTP ' + res.status)
      const buf = Buffer.from(await res.arrayBuffer())
      const destino = path.join(BIN, 'yt-dlp')
      fs.writeFileSync(destino + '.tmp', buf)
      fs.chmodSync(destino + '.tmp', 0o755)
      fs.renameSync(destino + '.tmp', destino)
    } catch (er) {
      errores.push('yt-dlp: ' + String(er.message).slice(0, 80))
    }
  }
  e = await estado()
  return { ytdlp: e.ytdlp, ffmpeg: e.ffmpeg, errores }
}

function desinstalar() {
  for (const d of [BIN, TMP]) {
    try { fs.rmSync(d, { recursive: true, force: true }) } catch {}
  }
}

module.exports = { estado, instalar, desinstalar, libreMB }
