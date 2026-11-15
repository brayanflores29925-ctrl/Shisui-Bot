// admin.js - comandos extra de administración de grupos
const fs = require('fs')

const ZONA_POR_DEFECTO = 'America/Argentina/Buenos_Aires'
const COMANDOS_ADMIN = ['horario', 'nombregrupo', 'descripcion', 'admins', 'fantasmas']
const ultimoAdmins = new Map()
const ultimoIntento = new Map()
let timer = null

function leerConfig() {
  try { return JSON.parse(fs.readFileSync('./config.json', 'utf8')) } catch { return {} }
}
function guardarConfig(cfg) {
  fs.writeFileSync('./config.json', JSON.stringify(cfg, null, 2))
}
function horaActual(zona) {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: zona, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date())
  return p.find(x => x.type === 'hour').value + ':' + p.find(x => x.type === 'minute').value
}
function aMin(t) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}
function validarHora(t) {
  const r = /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/.exec(String(t))
  return r ? r[1].padStart(2, '0') + ':' + r[2] : null
}
function debeEstarCerrado(h, ahoraMin) {
  const c = aMin(h.cerrar)
  const a = aMin(h.abrir)
  if (c === a) return false
  return c < a ? ahoraMin >= c && ahoraMin < a : ahoraMin >= c || ahoraMin < a
}
function digitos(j) {
  return String(j || '').split('@')[0].split(':')[0].replace(/\D/g, '')
}

async function ejecutar(sock, m, comando, ctx) {
  const jid = m.key.remoteJid
  if (!jid.endsWith('@g.us')) return { texto: 'Este comando solo funciona en grupos.' }
  if (comando !== 'admins' && !ctx.esAdmin) return { texto: '⛔ Solo los admins del grupo pueden usar este comando.' }
  const cfg = leerConfig()
  const zona = cfg.zona || ZONA_POR_DEFECTO

  switch (comando) {
    case 'horario': {
      cfg.grupos = cfg.grupos || {}
      const g = (cfg.grupos[jid] = cfg.grupos[jid] || {})
      const args = ctx.args
      if (!args.length) {
        return {
          texto: g.horario
            ? '🕐 *Horario automático*\n\n🔒 Cierra: ' + g.horario.cerrar + '\n🔓 Abre: ' + g.horario.abrir +
              '\n🌎 Zona: ' + zona + ' (ahora son las ' + horaActual(zona) + ')\n\nPara quitarlo: #horario off'
            : '🕐 Este grupo no tiene horario automático.\n\nUso:\n#horario 23:00 07:00\n(cierra a las 23:00 y abre a las 07:00)\n#horario off'
        }
      }
      if (String(args[0]).toLowerCase() === 'off') {
        delete g.horario
        delete g.horarioAplicado
        guardarConfig(cfg)
        return { texto: '✅ Horario automático desactivado.' }
      }
      const horas = args.map(x => validarHora(x)).filter(Boolean)
      if (horas.length !== 2 || horas[0] === horas[1]) {
        return { texto: 'Uso: #horario 23:00 07:00\nLa primera hora es cuando cierra y la segunda cuando abre.' }
      }
      g.horario = { cerrar: horas[0], abrir: horas[1] }
      g.horarioAplicado = null
      guardarConfig(cfg)
      return {
        texto: '✅ Horario guardado.\n\n🔒 Cierra a las ' + horas[0] + '\n🔓 Abre a las ' + horas[1] +
          '\n🌎 Zona: ' + zona + ' (ahora son las ' + horaActual(zona) + ')\n\nEl bot debe ser admin del grupo.'
      }
    }
    case 'nombregrupo': {
      const nuevo = ctx.cuerpo.trim()
      if (!nuevo) return { texto: 'Uso: #nombregrupo <nuevo nombre>' }
      if (nuevo.length > 100) return { texto: '⚠️ El nombre es muy largo (máximo 100 caracteres).' }
      try {
        await sock.groupUpdateSubject(jid, nuevo)
        return { texto: '✅ Nombre del grupo cambiado.' }
      } catch {
        return { texto: '⚠️ No pude cambiarlo. Necesito ser admin del grupo.' }
      }
    }
    case 'descripcion': {
      const nuevo = ctx.cuerpo.trim()
      if (!nuevo) {
        const meta = await sock.groupMetadata(jid)
        return { texto: '📝 *Descripción actual*\n\n' + (meta.desc || 'Este grupo no tiene descripción.') + '\n\nPara cambiarla: #descripcion <texto>' }
      }
      if (nuevo.length > 1000) return { texto: '⚠️ La descripción es muy larga (máximo 1000 caracteres).' }
      try {
        await sock.groupUpdateDescription(jid, nuevo)
        return { texto: '✅ Descripción del grupo cambiada.' }
      } catch {
        return { texto: '⚠️ No pude cambiarla. Necesito ser admin del grupo.' }
      }
    }
    case 'admins': {
      const ahora = Date.now()
      if (ultimoAdmins.get(jid) && ahora - ultimoAdmins.get(jid) < 60000) {
        return { texto: '⏳ Espera un minuto antes de volver a llamar a los admins.' }
      }
      ultimoAdmins.set(jid, ahora)
      const meta = await sock.groupMetadata(jid)
      const adm = meta.participants.filter(p => p.admin)
      if (!adm.length) return { texto: 'No encontré admins en este grupo.' }
      const motivo = ctx.cuerpo.trim()
      return {
        texto: '🛡️ *Llamando a los admins*' + (motivo ? '\n📝 ' + motivo : '') + '\n\n' + adm.map(p => '@' + digitos(p.id)).join(' '),
        mentions: adm.map(p => p.id)
      }
    }
    case 'fantasmas': {
      const act = ctx.actividad || {}
      const meta = await sock.groupMetadata(jid)
      const fantasmas = meta.participants.filter(p => {
        const ids = [p.id, p.lid, p.phoneNumber].filter(Boolean).map(digitos)
        return !ids.some(i => act[i] && act[i].n > 0)
      })
      if (!fantasmas.length) return { texto: '👻 No hay fantasmas: todos han escrito desde que empecé a contar.' }
      const lista = fantasmas.slice(0, 30)
      return {
        texto: '👻 *Fantasmas* (' + fantasmas.length + ' de ' + meta.participants.length + ')\nNo han escrito desde que empecé a contar la actividad.\n\n' +
          lista.map(p => '@' + digitos(p.id)).join(' ') +
          (fantasmas.length > 30 ? '\n\n... y ' + (fantasmas.length - 30) + ' más' : ''),
        mentions: lista.map(p => p.id)
      }
    }
    default:
      return { texto: '' }
  }
}

function programarHorarios(vivos) {
  if (timer) return
  timer = setInterval(async () => {
    try {
      const cfg = leerConfig()
      const zona = cfg.zona || ZONA_POR_DEFECTO
      const ahoraMin = aMin(horaActual(zona))
      let cambio = false
      for (const [jid, g] of Object.entries(cfg.grupos || {})) {
        if (!g.horario) continue
        const debe = debeEstarCerrado(g.horario, ahoraMin)
        if (g.horarioAplicado === null || g.horarioAplicado === undefined) {
          if (!debe) {
            g.horarioAplicado = false
            cambio = true
            continue
          }
        } else if (g.horarioAplicado === debe) {
          continue
        }
        if (Date.now() - (ultimoIntento.get(jid) || 0) < 5 * 60 * 1000) continue
        let hecho = null
        for (const s of vivos) {
          try {
            await s.groupSettingUpdate(jid, debe ? 'announcement' : 'not_announcement')
            hecho = s
            break
          } catch {}
        }
        if (!hecho) {
          ultimoIntento.set(jid, Date.now())
          continue
        }
        g.horarioAplicado = debe
        cambio = true
        try {
          await hecho.sendMessage(jid, {
            text: debe
              ? '🔒 Grupo cerrado por horario. Se abre a las ' + g.horario.abrir + '.'
              : '🔓 Grupo abierto por horario. Se cierra a las ' + g.horario.cerrar + '.'
          })
        } catch {}
      }
      if (cambio) guardarConfig(cfg)
    } catch (e) {
      console.log('Horario:', e.message)
    }
  }, 60 * 1000)
}

module.exports = { ejecutar, programarHorarios, COMANDOS_ADMIN }
