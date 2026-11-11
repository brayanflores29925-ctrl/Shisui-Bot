// limpieza.js - libera espacio sin tocar código, config, sesiones ni gacha
const fs = require('fs')
const os = require('os')
const path = require('path')

const PREFIJOS = /^(dl_|stk_|cita_|mp3_|vid_|foto_|voz_|chk_|_MEI)/

function libreMB() {
  try {
    const s = fs.statfsSync('.')
    return Math.round(s.bavail * s.bsize / 1048576)
  } catch {
    return null
  }
}

function tamano(ruta) {
  let st
  try { st = fs.lstatSync(ruta) } catch { return 0 }
  if (st.isSymbolicLink()) return 0
  if (!st.isDirectory()) return st.size
  let total = 0
  let lista = []
  try { lista = fs.readdirSync(ruta) } catch {}
  for (const f of lista) total += tamano(path.join(ruta, f))
  return total
}

function resumenCarpetas() {
  return ['node_modules', 'sesion', 'sesiones', 'bin', 'tmp-ytdlp', 'backup-update', 'stickers']
    .map(n => [n, tamano(n)])
    .filter(x => x[1] > 0)
    .sort((a, b) => b[1] - a[1])
}

function borrar(ruta) {
  const t = tamano(ruta)
  try {
    fs.rmSync(ruta, { recursive: true, force: true })
    return t
  } catch {
    return 0
  }
}

function limpiar() {
  const antes = libreMB()
  let liberado = 0
  const fijos = ['tmp-ytdlp', 'backup-update', path.join('node_modules', '.cache'), path.join(os.homedir(), '.npm', '_cacache')]
  for (const r of fijos) {
    if (fs.existsSync(r)) liberado += borrar(r)
  }
  for (const d of [os.tmpdir(), process.cwd()]) {
    let lista = []
    try { lista = fs.readdirSync(d) } catch {}
    for (const f of lista) {
      if (PREFIJOS.test(f) || (d === process.cwd() && /\.nuevo$/i.test(f))) {
        liberado += borrar(path.join(d, f))
      }
    }
  }
  return { antes, despues: libreMB(), liberadoMB: Math.round(liberado / 1048576) }
}

module.exports = { libreMB, resumenCarpetas, limpiar }
