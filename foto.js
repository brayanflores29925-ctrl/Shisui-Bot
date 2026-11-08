const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFile } = require('child_process')

async function aFotoCuadrada(buffer) {
  const base = path.join(os.tmpdir(), 'foto_' + Date.now() + '_' + Math.floor(Math.random() * 1e6))
  const entrada = base + '.img'
  const salida = base + '.jpg'
  fs.writeFileSync(entrada, buffer)
  try {
    await new Promise((resolve, reject) => {
      execFile(
        'ffmpeg',
        ['-y', '-i', entrada, '-vf', "crop='min(iw,ih)':'min(iw,ih)',scale=640:640", '-frames:v', '1', '-q:v', '3', salida],
        err => (err ? reject(err) : resolve())
      )
    })
    return fs.readFileSync(salida)
  } finally {
    try { fs.unlinkSync(entrada) } catch {}
    try { fs.unlinkSync(salida) } catch {}
  }
}

module.exports = { aFotoCuadrada }
