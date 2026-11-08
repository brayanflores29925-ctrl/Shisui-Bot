const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFile } = require('child_process')

function ejecutarFfmpeg(args) {
  return new Promise((resolve, reject) => {
    execFile('ffmpeg', args, err => (err ? reject(err) : resolve()))
  })
}

async function aMp3(buffer) {
  const base = path.join(os.tmpdir(), 'mp3_' + Date.now() + '_' + Math.floor(Math.random() * 1e6))
  const entrada = base + '.in'
  const salida = base + '.mp3'
  fs.writeFileSync(entrada, buffer)
  try {
    await ejecutarFfmpeg(['-y', '-i', entrada, '-vn', '-codec:a', 'libmp3lame', '-q:a', '4', salida])
    return fs.readFileSync(salida)
  } finally {
    try { fs.unlinkSync(entrada) } catch {}
    try { fs.unlinkSync(salida) } catch {}
  }
}

async function aVideo(buffer) {
  const base = path.join(os.tmpdir(), 'vid_' + Date.now() + '_' + Math.floor(Math.random() * 1e6))
  const entrada = base + '.in'
  const salida = base + '.mp4'
  fs.writeFileSync(entrada, buffer)
  try {
    try {
      await ejecutarFfmpeg([
        '-y', '-i', entrada,
        '-filter_complex', '[0:a]showwaves=s=480x270:mode=cline:colors=white,format=yuv420p[v]',
        '-map', '[v]', '-map', '0:a',
        '-c:v', 'libx264', '-preset', 'ultrafast',
        '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', salida
      ])
    } catch (e) {
      await ejecutarFfmpeg([
        '-y', '-f', 'lavfi', '-i', 'color=c=black:s=480x270:r=10', '-i', entrada,
        '-shortest', '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'stillimage',
        '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', salida
      ])
    }
    return fs.readFileSync(salida)
  } finally {
    try { fs.unlinkSync(entrada) } catch {}
    try { fs.unlinkSync(salida) } catch {}
  }
}

module.exports = { aMp3, aVideo, ejecutarFfmpeg }
