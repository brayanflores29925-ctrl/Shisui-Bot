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

function lista(valor) {
  return [...new Set(
    (Array.isArray(valor) ? valor : [valor])
      .map(numero)
      .filter(Boolean)
  )]
}

function coinciden(a, b) {
  return lista(a).some(id => lista(b).includes(id))
}

function invitar(grupo, emisor, objetivo) {
  const emisores = lista(emisor)
  const objetivos = lista(objetivo)

  if (!grupo?.endsWith('@g.us'))
    return { error: 'Usa este comando en un grupo.' }

  if (!emisores.length || !objetivos.length ||
      coinciden(emisores, objetivos))
    return { error: 'Selecciona otra persona.' }

  if (datos[grupo]?.pareja)
    return { error: 'Este grupo ya tiene una pareja de racha.' }

  datos[grupo] = {
    pendiente: {
      emisor: emisores[0],
      objetivo: objetivos[0],
      emisorIds: emisores,
      objetivoIds: objetivos
    },
    pareja: null
  }

  guardar()
  return { ok: true }
}

function aceptar(grupo, usuario) {
  const r = datos[grupo]
  if (!r?.pendiente)
    return { error: 'No hay invitaciones pendientes.' }

  const p = r.pendiente
  const objetivos = p.objetivoIds || [p.objetivo]

  if (!coinciden(objetivos, usuario))
    return { error: 'Esta invitación no es para ti.' }

  const emisores = p.emisorIds || [p.emisor]
  const invitados = p.objetivoIds || [p.objetivo]

  r.pareja = {
    usuarios: [p.emisor, p.objetivo],
    identificadores: {
      [p.emisor]: emisores,
      [p.objetivo]: invitados
    },
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
  if (!p) return null

  const id = p.usuarios.find(base => {
    const conocidos = p.identificadores?.[base] || [base]
    return coinciden(conocidos, usuario)
  })

  if (!id) return null

  const fecha = hoy()
  p.participacion = p.participacion || {}
  p.participacion[fecha] = p.participacion[fecha] || []

  if (!p.participacion[fecha].includes(id))
    p.participacion[fecha].push(id)

  let aumento = false

  if (p.usuarios.every(u => p.participacion[fecha].includes(u))) {
    if (p.ultimoDia !== fecha) {
      const ayer = new Date(Date.now() - 86400000)
        .toLocaleDateString('en-CA', {
          timeZone: 'America/Tegucigalpa'
        })

      p.racha = p.ultimoDia === ayer ? (p.racha || 0) + 1 : 1
      p.mejor = Math.max(p.mejor || 0, p.racha)
      p.ultimoDia = fecha
      aumento = true
    }
  }

  const ayer = new Date(Date.now() - 86400000)
    .toLocaleDateString('en-CA', {
      timeZone: 'America/Tegucigalpa'
    })

  for (const dia of Object.keys(p.participacion)) {
    if (dia !== fecha && dia !== ayer)
      delete p.participacion[dia]
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

  const p = r.pendiente
  if (!coinciden(
    [p.emisorIds || [p.emisor], p.objetivoIds || [p.objetivo]].flat(),
    usuario
  )) return false

  delete datos[grupo]
  guardar()
  return true
}

function desactivar(grupo, usuario) {
  const p = datos[grupo]?.pareja
  if (!p) return false

  const autorizado = p.usuarios.some(base =>
    coinciden(p.identificadores?.[base] || [base], usuario)
  )

  if (!autorizado) return false

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
