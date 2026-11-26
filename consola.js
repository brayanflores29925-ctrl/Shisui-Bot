// consola.js - guarda las últimas líneas de la consola para verlas con #consola2
const fs = require('fs')
const util = require('util')

const MAX = 300
const ARCHIVO = './consola-last.json'
let lineas = []
let anterior = []
let sucio = false
let instalado = false

const RUIDO = /SessionEntry|privKey|pubKey|_chains|currentRatchet|ephemeralKeyPair/

function ocultar(t) {
  return t
    .replace(/sc_[A-Za-z0-9_-]{16,}/g, 'sc_****')
    .replace(/vf_live_sk_[A-Za-z0-9]+/g, 'vf_****')
    .replace(/(ghp|gho|ghu|ghs|github_pat)_[A-Za-z0-9_]{20,}/g, '$1_****')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer ****')
    .replace(/[A-Fa-f0-9]{40,}/g, '****')
}

function hora() {
  const d = new Date()
  const dos = n => String(n).padStart(2, '0')
  return dos(d.getHours()) + ':' + dos(d.getMinutes()) + ':' + dos(d.getSeconds())
}

function guardarLinea(texto) {
  if (RUIDO.test(texto)) return
  const h = hora()
  for (const l of ocultar(texto).split('\n')) {
    const limpia = l.trim()
    if (!limpia) continue
    lineas.push('[' + h + '] ' + limpia.slice(0, 220))
  }
  if (lineas.length > MAX) lineas = lineas.slice(-MAX)
  sucio = true
}

function instalar() {
  if (instalado) return
  instalado = true
  try {
    anterior = JSON.parse(fs.readFileSync(ARCHIVO, 'utf8'))
  } catch {
    anterior = []
  }
  for (const nivel of ['log', 'info', 'warn', 'error']) {
    const original = console[nivel].bind(console)
    console[nivel] = (...args) => {
      try { guardarLinea(util.format(...args)) } catch {}
      original(...args)
    }
  }
  const volcar = () => {
    if (!sucio) return
    try { fs.writeFileSync(ARCHIVO, JSON.stringify(lineas.slice(-80))) } catch {}
    sucio = false
  }
  setInterval(volcar, 10000).unref()
  process.on('exit', volcar)
  guardarLinea('── Inicio del bot ──')
}

function resumen(args) {
  const a0 = String(args[0] || '').toLowerCase()
  const marca = String.fromCharCode(96).repeat(3)
  let fuente = lineas
  let titulo = 'últimas'
  let n = 12
  if (a0 === 'anterior') {
    fuente = anterior
    titulo = 'antes del último reinicio'
  } else if (a0 === 'errores') {
    fuente = lineas.filter(l => /error|❌|⚠️|fall|ENOSPC|no controlado/i.test(l))
    titulo = 'errores recientes'
  } else if (a0 === 'limpiar') {
    lineas = []
    sucio = true
    return '🧹 Consola limpiada.'
  }
  const num = Number(args.find(x => /^[0-9]+$/.test(String(x))))
  if (num >= 1) n = Math.min(14, num)
  const ultimas = fuente.slice(-n)
  if (!ultimas.length) {
    return '🖥️ No hay líneas para mostrar' + (a0 === 'anterior' ? ' (no hay registro del reinicio anterior).' : '.')
  }
  return (
    '🖥️ *Consola* — ' + titulo + ' (' + ultimas.length + ' líneas)\n\n' +
    marca + '\n' + ultimas.map(l => l.slice(0, 140)).join('\n') + '\n' + marca +
    '\n#consola2 [10-14] · errores · anterior · limpiar'
  )
}

module.exports = { instalar, resumen }
