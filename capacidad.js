// capacidad.js - estima cuántos sub bots aguanta el servidor
const fs = require('fs')
const os = require('os')

function leerNumero(ruta) {
  try {
    const t = fs.readFileSync(ruta, 'utf8').trim()
    if (t === 'max') return null
    const n = Number(t)
    return Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}

function memoriaServidor() {
  const mb = b => Math.round(b / 1048576)
  let limite = leerNumero('/sys/fs/cgroup/memory.max')
  let usado = leerNumero('/sys/fs/cgroup/memory.current')
  if (limite === null) {
    limite = leerNumero('/sys/fs/cgroup/memory/memory.limit_in_bytes')
    usado = leerNumero('/sys/fs/cgroup/memory/memory.usage_in_bytes')
  }
  let origen = 'contenedor'
  if (limite === null || limite > os.totalmem() * 2) {
    limite = os.totalmem()
    usado = os.totalmem() - os.freemem()
    origen = 'servidor'
  }
  if (usado === null) usado = process.memoryUsage().rss
  return { limiteMB: mb(limite), usadoMB: mb(usado), origen }
}

function estimar(subsActuales) {
  const mem = memoriaServidor()
  const rssMB = Math.round(process.memoryUsage().rss / 1048576)
  let porSub = subsActuales > 0 ? Math.round((rssMB - 90) / subsActuales) : 60
  porSub = Math.min(120, Math.max(40, porSub))
  const libreMB = Math.max(0, Math.round(mem.limiteMB * 0.85 - mem.usadoMB))
  const extra = Math.max(0, Math.floor(libreMB / porSub))
  return { ...mem, rssMB, porSub, libreMB, extra }
}

function veredicto(subsActuales, nuevoMax) {
  const e = estimar(subsActuales)
  const nuevos = Math.max(0, nuevoMax - subsActuales)
  let estado = 'no'
  if (nuevos <= e.extra * 0.7) estado = 'ok'
  else if (nuevos <= e.extra) estado = 'justo'
  return { ...e, nuevos, estado }
}

module.exports = { estimar, veredicto }
