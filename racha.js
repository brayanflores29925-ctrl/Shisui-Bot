const fs = require('fs')
const ARCHIVO = './rachas.json'

function cargar() {
  try {
    return JSON.parse(fs.readFileSync(ARCHIVO, 'utf8'))
  } catch {
    return {}
  }
}

let datos = cargar()

function guardar() {
  fs.writeFileSync(ARCHIVO, JSON.stringify(datos, null, 2))
}

function hoy() {
  return new Date().toLocaleDateString('en-CA', {
    timeZone: 'America/Tegucigalpa'
  })
}

function numero(jid) {
  return String(jid || '').split('@')[0].split(':')[0].replace(/\D/g, '')
}

function invitar(grupo, emisor, objetivo) {
  if (!grupo.endsWith('@g.us')) return { error: 'Usa este comando en un grupo.' }
  if (!emisor || !objetivo || emisor === objetivo) return { error: 'Selecciona otra persona.' }

  if (datos[grupo]?.pareja) return { error: 'Este grupo ya tiene una pareja de racha.' }

  datos[grupo] = {
    pendiente: { emisor, objetivo },
    pareja: null
  }
  guardar()
  return { ok: true }
}

function aceptar(grupo, usuario) {
  const r = datos[grupo]
  if (!r?.pendiente) return { error: 'No hay invitaciones pendientes.' }
  if (r.pendiente.objetivo !== usuario) return { error: 'Esta invitación no es para ti.' }

  r.pareja = {
    usuarios: [r.pendiente.emisor, r.pendiente.objetivo],
    racha: 0,
    mejor: 0,
    ultimoDia: null,
    participacion: {}
  }
  r.pendiente = null
  guardar()
  return { ok: true, racha: 0 }
}

function registrarMensaje(grupo, usuario) {
  const p = datos[grupo]?.pareja
  if (!p || !p.usuarios.includes(usuario)) return null

  const fecha = hoy()
  p.participacion[fecha] = p.participacion[fecha] || []

  if (!p.participacion[fecha].includes(usuario)) {
    p.participacion[fecha].push(usuario)
  }

  let aumento = false

  if (p.usuarios.every(u => p.participacion[fecha].includes(u))) {
    if (p.ultimoDia !== fecha) {
      const ayer = new Date(Date.now() - 86400000)
        .toLocaleDateString('en-CA', { timeZone: 'America/Tegucigalpa' })

      p.racha = p.ultimoDia === ayer ? p.racha + 1 : 1
      p.mejor = Math.max(p.mejor || 0, p.racha)
      p.ultimoDia = fecha
      aumento = true
    }
  }

  for (const dia of Object.keys(p.participacion)) {
    if (dia !== fecha && dia !== new Date(Date.now() - 86400000)
      .toLocaleDateString('en-CA', { timeZone: 'America/Tegucigalpa' })) {
      delete p.participacion[dia]
    }
  }

  guardar()
  return {
    racha: p.racha,
    mejor: p.mejor,
    aumento,
    participantes: p.participacion[fecha].length
  }
}

function obtener(grupo) {
  return datos[grupo]?.pareja || null
}

function rechazar(grupo, usuario) {
  const r = datos[grupo]
  if (!r?.pendiente) return false
  if (![r.pendiente.emisor, r.pendiente.objetivo].includes(usuario)) return false
  delete datos[grupo]
  guardar()
  return true
}

function desactivar(grupo, usuario) {
  const p = datos[grupo]?.pareja
  if (!p || !p.usuarios.includes(usuario)) return false
  delete datos[grupo]
  guardar()
  return true
}

module.exports = {
  invitar,
  aceptar,
  registrarMensaje,
  obtener,
  rechazar,
  desactivar,
  numero
}
