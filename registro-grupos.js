const fs = require('fs')
const path = require('path')

const ARCHIVO = path.join(__dirname, 'data', 'grupos-registro.json')
const DIA = 86400000
const ZONA = 'America/Tegucigalpa'

function leer() {
  try { return JSON.parse(fs.readFileSync(ARCHIVO, 'utf8')) }
  catch { return {} }
}

function guardar(datos) {
  fs.mkdirSync(path.dirname(ARCHIVO), { recursive: true })
  fs.writeFileSync(ARCHIVO, JSON.stringify(datos, null, 2))
}

function fecha(ms) {
  const d = new Date(ms)
  return {
    fecha: d.toLocaleDateString('es-HN', { timeZone: ZONA }),
    hora: d.toLocaleTimeString('es-HN', {
      timeZone: ZONA, hour12: false
    })
  }
}

async function registrarGrupo(sock, jid, argumento) {
  if (!jid.endsWith('@g.us'))
    throw new Error('Este comando solamente funciona dentro de un grupo.')

  const match = String(argumento || '').match(/^(\d+)(H|D|M)$/i)
  if (!match || Number(match[1]) < 1)
    throw new Error('Uso: #registrargrupo 1H, 7D o 1M')

  const cantidad = Number(match[1])
  const unidad = match[2].toUpperCase()
  const duracion = cantidad * (
    unidad === 'H' ? 3600000 :
    unidad === 'D' ? DIA : 30 * DIA
  )

  if (!Number.isSafeInteger(duracion))
    throw new Error('La duración indicada es demasiado grande.')

  const ahora = Date.now()
  const vencimiento = ahora + duracion
  const f = fecha(vencimiento)

  const datos = leer()
  datos[jid] = {
    creado: ahora,
    vence: vencimiento,
    plan: `${cantidad}${unidad}`,
    avisado: false
  }
  guardar(datos)

  await sock.sendMessage(jid, {
    text: `╭━━〔 👑 PLAN ACTIVADO 〕━━╮

✅ El dueño ha activado un plan para este grupo.

📦 Plan: ${cantidad}${unidad}
⏳ Duración: ${cantidad}${unidad}
📅 Fecha de vencimiento: ${f.fecha}
🕒 Hora de vencimiento: ${f.hora}

🔔 Se avisará a los administradores 3 días antes del vencimiento.

💜 ¡Gracias por utilizar Shisui Bot!

╰━━━━━━━━━━━━━━━━━━╯`
  })
}

async function revisarRegistros(sock) {
  const datos = leer()
  const ahora = Date.now()
  let cambios = false

  for (const [jid, registro] of Object.entries(datos)) {
    try {
      const restante = registro.vence - ahora
      const f = fecha(registro.vence)

      if (restante <= 0) {
        await sock.sendMessage(jid, {
          text: `╭━━〔 🚪 PLAN VENCIDO 〕━━╮

❌ Tu plan ha vencido.

No se registró una renovación antes de la fecha límite.

🤖 Shisui Bot abandonará este grupo automáticamente porque el plan no ha sido renovado.

Gracias por utilizar nuestros servicios. 💜

╰━━━━━━━━━━━━━━━━━━╯`
        })

        await sock.groupLeave(jid)
        delete datos[jid]
        cambios = true
        continue
      }

      if (
        restante <= 3 * DIA &&
        registro.vence - registro.creado > 3 * DIA &&
        !registro.avisado
      ) {
        const meta = await sock.groupMetadata(jid)
        const admins = meta.participants
          .filter(p => p.admin)
          .map(p => p.id)

        await sock.sendMessage(jid, {
          text: `╭━━〔 ⚠️ AVISO DE VENCIMIENTO 〕━━╮

El plan de este grupo está próximo a vencer.

⏳ Tiempo restante: 3 días o menos.
📅 Fecha de vencimiento: ${f.fecha}
🕒 Hora de vencimiento: ${f.hora}

👑 Administradores: renueven el plan antes del vencimiento para evitar que Shisui Bot abandone automáticamente el grupo.

╰━━━━━━━━━━━━━━━━━━╯`,
          mentions: admins
        })

        registro.avisado = true
        cambios = true
      }
    } catch (e) {
      console.log('Error registro de grupo:', jid, e.message)
    }
  }

  if (cambios) guardar(datos)
}

module.exports = { registrarGrupo, revisarRegistros }
