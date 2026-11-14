const fs = require('fs')
require('dotenv').config()
const Groq = require('groq-sdk')
const groq = process.env.GROQ_API_KEY ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null
for (const nivel of ['info', 'warn']) {
  const original = console[nivel]
  console[nivel] = (...a) => {
    if (typeof a[0] === 'string' && /^(Closing|Opening|Removing|Migrating)/.test(a[0])) return
    original.apply(console, a)
  }
}
const { execFile } = require('child_process')
const os = require('os')
const path = require('path')
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  downloadMediaMessage,
  Browsers
} = require('@whiskeysockets/baileys')
const pino = require('pino')
const readline = require('readline')
const { generarMenu } = require('./menu')
const herramientas = require('./herramientas')
const { ejecutar: navidadEjecutar } = require('./navidad')
const limpieza = require('./limpieza')
const { ejecutar: gachaEjecutar, COMANDOS_GACHA, EMOJIS_GACHA } = require('./gacha')
require('./binarios').preparar()
const { actualizarDesdeGithub, revertirActualizacion } = require('./actualizar')
const { aFotoCuadrada } = require('./foto')
const { aMp3, aVideo } = require('./convertir')
const QRCode = require('qrcode')
const { conMetadatos } = require('./sticker-meta')
const { crearCita } = require('./cita')
const { textoAVoz } = require('./voz')
const { informacion, descargar, bajarMedia, buscarImagenes } = require('./descargas')
const { registrarGrupo, revisarRegistros } = require('./registro-grupos')
const racha = require('./racha')

async function consultarGroq(pregunta) {
  if (!groq) throw new Error('Falta configurar GROQ_API_KEY')
  const respuesta = await groq.chat.completions.create({
    model: 'openai/gpt-oss-20b',
    messages: [
      { role: 'system', content: 'Eres Levi Bot, un asistente de inteligencia artificial útil. Responde en español claro y directamente.' },
      { role: 'user', content: pregunta }
    ],
    max_completion_tokens: 1024,
    reasoning_effort: 'low',
    include_reasoning: false
  })
  return respuesta.choices?.[0]?.message?.content?.trim() || 'No pude generar una respuesta.'
}

const PREFIJOS = ['!', '#', '.', '/']
const DUENOS = ['50494874330', '50495939120', '50493482934']
process.on('unhandledRejection', e => console.log('Error no controlado:', e && e.message))
const COMANDOS = new Set([...fs.readFileSync(__filename, 'utf8').matchAll(/case '([a-z0-9_]+)'/g)].map(x => x[1]).concat(COMANDOS_GACHA))
const EMOJIS = {
  musica: '🎵', m: '🎵', play: '🎵',
  video: '🎬', v: '🎬',
  tiktok: '📱', tt: '📱', instagram: '📸', ig: '📸', facebook: '📘', fb: '📘', x: '🐦',
  voz: '🎤', sticker: '🎨', s: '🎨', fake: '💬', fq: '💬',
  ping: '🏓', menu: '📜', reglas: '📜', link: '🔗', pfp: '🖼️', perfil: '🖼️',
  consejo: '💡', party: '🎉', tag: '📣', aviso: '📢', kick: '👢', ban: '👢',
  fix: '🔧', status: '📊', bot: '🤖'
}
const MAX_SUBBOTS = 5
const subSockets = {}
const subEstado = {}
const codeReciente = {}

async function quitarSubBot(num) {
  const sub = subSockets[num]
  delete subSockets[num]
  delete subEstado[num]
  const cfg = leerConfig()
  cfg.subbots = (cfg.subbots || []).filter(n => n !== num)
  guardarConfig(cfg)
  try { await sub?.logout() } catch {}
  try { sub?.end(undefined) } catch {}
  try { fs.rmSync('./sesiones/sub-' + num, { recursive: true, force: true }) } catch {}
}

function iniciarSub(num, onCodigo) {
  const cfg = leerConfig()
  if (!(cfg.subbots || []).includes(num)) cfg.subbots = (cfg.subbots || []).concat(num)
  guardarConfig(cfg)
  let entregado = false
  const alCodigo = (codigo, error) => {
    if (entregado) return
    entregado = true
    if (!codigo) quitarSubBot(num)
    if (onCodigo) onCodigo(codigo, error)
  }
  setTimeout(() => {
    if (!subEstado[num]?.vinculado) quitarSubBot(num)
  }, 5 * 60 * 1000)
  iniciar({ carpeta: './sesiones/sub-' + num, esSub: true, numeroSub: num, onCodigo: alCodigo })
}
const ARCHIVO_ACTIVIDAD = './actividad.json'
let actividad = {}
try { actividad = JSON.parse(fs.readFileSync(ARCHIVO_ACTIVIDAD, 'utf8')) } catch {}
let actividadSucia = false
function guardarActividad() {
  if (!actividadSucia) return
  try { fs.writeFileSync(ARCHIVO_ACTIVIDAD, JSON.stringify(actividad)) } catch {}
  actividadSucia = false
}
setInterval(guardarActividad, 30000)
process.on('SIGINT', () => {
  guardarActividad()
  process.exit(0)
})
const mensajesRecientes = {}
const partyReciente = {}
const nombres = {}
const DUENO_JID = '50494874330@s.whatsapp.net'
const reportesRecientes = {}
const ARCHIVO_CONFIG = './config.json'
let numero = null

function leerConfig() {
  try { return JSON.parse(fs.readFileSync(ARCHIVO_CONFIG, 'utf8')) } catch { return {} }
}
function guardarConfig(cfg) {
  fs.writeFileSync(ARCHIVO_CONFIG, JSON.stringify(cfg, null, 2))
}

function sinTildes(t) {
  return t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function nsfwActivo(jid) {
  return !!((leerConfig().nsfw || {})[jid])
}

function menuActual(nsfw) {
  const cfg = leerConfig()
  if (!cfg.menu) return generarMenu(nsfw)
  const zona = 'America/Tegucigalpa'
  const ahora = new Date()
  return cfg.menu
    .replace(/{fecha}/g, ahora.toLocaleDateString('es-HN', { timeZone: zona }))
    .replace(/{hora}/g, ahora.toLocaleTimeString('es-HN', { timeZone: zona, hour12: false }))
}

function esDuenoPrincipal(m) {
  const candidatos = [m.key.participant, m.key.participantAlt, m.key.remoteJid, m.key.remoteJidAlt].filter(Boolean)
  return candidatos.some(j => DUENOS.includes(j.split('@')[0].split(':')[0]))
}

function esDueno(m) {
  const candidatos = [
    m.key.participant, m.key.participantAlt,
    m.key.remoteJid, m.key.remoteJidAlt
  ].filter(j => typeof j === 'string')

  const autorizados = new Set(
    DUENOS.map(n => String(n).replace(/\D/g, ''))
  )

  return candidatos.some(j =>
    autorizados.has(
      j.split('@')[0].split(':')[0].replace(/\D/g, '')
    )
  )
}

function esBaneado(m) {
  const lista = leerConfig().baneados || []
  const candidatos = [
    m.key.participant, m.key.participantAlt,
    m.key.remoteJid, m.key.remoteJidAlt
  ].filter(Boolean)
  return candidatos.some(j => lista.includes(j.split('@')[0].split(':')[0]))
}

function imagenASticker(buffer) {
  return new Promise((resolve, reject) => {
    const base = path.join(os.tmpdir(), 'stk_' + Date.now() + '_' + Math.floor(Math.random() * 1e6))
    const entrada = base + '.img'
    const salida = base + '.webp'
    fs.writeFileSync(entrada, buffer)
    const filtro = 'scale=512:512:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000'
    execFile('ffmpeg', ['-y', '-i', entrada, '-vf', filtro, '-c:v', 'libwebp', '-lossless', '0', '-quality', '80', '-frames:v', '1', salida], err => {
      try {
        if (err) return reject(err)
        resolve(fs.readFileSync(salida))
      } catch (e) {
        reject(e)
      } finally {
        try { fs.unlinkSync(entrada) } catch {}
        try { fs.unlinkSync(salida) } catch {}
      }
    })
  })
}

let fixEnCurso = false

function correr(cmd, args, opciones = {}) {
  return new Promise(resolve => {
    require('child_process').execFile(
      cmd,
      args,
      {
        timeout: 600000,
        maxBuffer: 20 * 1024 * 1024,
        env: { ...process.env, DEBIAN_FRONTEND: 'noninteractive', TMPDIR: require('path').join(process.cwd(), 'tmp-ytdlp') },
        ...opciones
      },
      (err, stdout, stderr) => resolve({ ok: !err, salida: String(stdout || '') + String(stderr || '') })
    )
  })
}

let limpiezaTimer = null
let ultimoAvisoEspacio = 0
function programarLimpieza(sock) {
  if (limpiezaTimer) return
  const revisar = async () => {
    try {
      const libre = limpieza.libreMB()
      if (libre === null || libre >= 150) return
      const r = limpieza.limpiar()
      console.log('Limpieza automática: ' + r.antes + ' MB → ' + r.despues + ' MB')
      if (r.despues !== null && r.despues < 100 && Date.now() - ultimoAvisoEspacio > 6 * 3600 * 1000 && typeof DUENO_JID !== 'undefined') {
        ultimoAvisoEspacio = Date.now()
        await sock.sendMessage(DUENO_JID, { text: '⚠️ Queda poco espacio en el servidor (' + r.despues + ' MB) aunque ya limpié. Revisa con #espacio.' })
      }
    } catch (e) {
      console.log('Limpieza automática:', e.message)
    }
  }
  setTimeout(revisar, 60000)
  limpiezaTimer = setInterval(revisar, 30 * 60 * 1000)
}

function preguntar(texto) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise(res => rl.question(texto, r => { rl.close(); res(r) }))
}

async function esAdmin(sock, m) {
  if (esDueno(m)) return true
  const grupo = m.key.remoteJid
  if (!grupo.endsWith('@g.us')) return false
  const meta = await sock.groupMetadata(grupo)
  const quien = [m.key.participant, m.key.participantAlt].filter(Boolean)
  return meta.participants.some(p =>
    p.admin && quien.some(q => q === p.id || q === p.lid || q === p.phoneNumber)
  )
}

async function iniciar(opciones = {}) {
  const { carpeta = 'sesion', esSub = false, numeroSub = null, onCodigo = null } = opciones
  const { state, saveCreds } = await useMultiFileAuthState(carpeta)
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    browser: Browsers.ubuntu('Chrome')
  })

  if (esSub) subSockets[numeroSub] = sock

  sock.ev.on('creds.update', saveCreds)

  if (!sock.authState.creds.registered) {
    if (esSub) {
      setTimeout(async () => {
        try {
          const codigo = await sock.requestPairingCode(numeroSub)
          if (onCodigo) onCodigo(codigo, null)
        } catch (e) {
          console.log('Error al pedir el código (sub bot):', e.message)
          if (onCodigo) onCodigo(null, e.message)
        }
      }, 3000)
    } else {
      if (!numero) {
        numero = (await preguntar('Número del bot con código de país, sin + ni espacios (ej: 5491112345678): ')).replace(/\D/g, '')
      }
      setTimeout(async () => {
        try {
          const codigo = await sock.requestPairingCode(numero)
          console.log('\n🔑 Tu código de vinculación: ' + (codigo.match(/.{1,4}/g) || [codigo]).join('-') + '\n')
        } catch (e) {
          console.log('Error al pedir el código:', e.message)
        }
      }, 3000)
    }
  }

  sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
    if (connection === 'open') {
      if (esSub) subEstado[numeroSub] = { vinculado: true }
      console.log(esSub ? 'Sub bot conectado ✅ ' + numeroSub : 'Bot conectado ✅')
      if (!esSub) {
        programarLimpieza(sock)
        revisarRegistros(sock).catch(e => console.log('Registro:', e.message))
        if (!sock.__registroInterval) {
          sock.__registroInterval = setInterval(() => {
            revisarRegistros(sock).catch(e => console.log('Registro:', e.message))
          }, 60000)
        }
      }
    }
    if (connection === 'close') {
      if (sock.__registroInterval) clearInterval(sock.__registroInterval)
      const code = lastDisconnect?.error?.output?.statusCode
      if (esSub) {
        if (!(leerConfig().subbots || []).includes(numeroSub)) return
        if (code === DisconnectReason.loggedOut || !sock.authState.creds.registered) {
          quitarSubBot(numeroSub)
          return
        }
        iniciar(opciones)
        return
      }
      if (code !== DisconnectReason.loggedOut) iniciar()
      else console.log('Sesión cerrada. Borra la carpeta "sesion" y vuelve a iniciar.')
    }
  })

  sock.ev.on('group-participants.update', async ({ id, participants, action }) => {
    try {
      if (action !== 'add') return
      const cfg = leerConfig()
      const g = (cfg.grupos || {})[id] || {}
      const permitidos = cfg.prefijosPermitidos || []
      if (!g.antifake || !permitidos.length) return
      for (const p of participants) {
        const jidP = typeof p === 'string' ? p : p.id
        const numero = typeof p === 'string' ? p : (p.phoneNumber || p.id)
        if (numero.endsWith('@lid')) continue
        const digitos = numero.split('@')[0].split(':')[0]
        if (DUENOS.includes(digitos)) continue
        if (!permitidos.some(pref => digitos.startsWith(pref))) {
          await sock.groupParticipantsUpdate(id, [jidP], 'remove')
        }
      }
    } catch (e) {
      console.log('Error antifake:', e.message)
    }
  })

  sock.ev.on('group-participants.update', async ({ id, participants, action }) => {
    try {
      const cfg = leerConfig()
      const g = (cfg.grupos || {})[id] || {}
      let plantilla
      if (action === 'add' && g.bienvenida) {
        plantilla = cfg.textoBienvenida || 'Bienvenido {usuario} a {grupo} 👋'
      } else if (action === 'remove' && g.despedida) {
        plantilla = cfg.textoDespedida || 'Adiós {usuario}, te esperamos pronto 👋'
      } else {
        return
      }
      const meta = await sock.groupMetadata(id)
      for (const p of participants) {
        const jidP = typeof p === 'string' ? p : p.id
        const texto = plantilla
          .replace(/{usuario}/g, '@' + jidP.split('@')[0].split(':')[0])
          .replace(/{grupo}/g, meta.subject)
        await sock.sendMessage(id, { text: texto, mentions: [jidP] })
      }
    } catch (e) {
      console.log('Error en bienvenida/despedida:', e.message)
    }
  })

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const m = messages[0]
    if (!m?.message) return
    if (process.env.DEBUG_MSG) console.log('[msg]', m.key.remoteJid, 'fromMe=' + !!m.key.fromMe, 'part=' + (m.key.participant || '-'), Object.keys(m.message).join(','))
    m.__sub = esSub
    if (m.key.remoteJid.endsWith('@g.us') && !m.key.fromMe) {
      const idAct = m.key.participantAlt || m.key.participant
      if (idAct) {
        const claveAct = idAct.split('@')[0].split(':')[0]
        const gAct = (actividad[m.key.remoteJid] = actividad[m.key.remoteJid] || {})
        const uAct = (gAct[claveAct] = gAct[claveAct] || { jid: idAct, n: 0 })
        uAct.n++
        uAct.jid = idAct
        actividadSucia = true
      }
    }
    if (m.key.remoteJid.endsWith('@g.us') && !m.key.fromMe) {
      const listaReg = (mensajesRecientes[m.key.remoteJid] = mensajesRecientes[m.key.remoteJid] || [])
      listaReg.push({
        key: m.key,
        ids: [m.key.participant, m.key.participantAlt]
          .filter(Boolean)
          .map(j => j.split('@')[0].split(':')[0])
      })
      if (listaReg.length > 300) listaReg.shift()
    }
    if (m.pushName) nombres[m.key.participant || m.key.remoteJid] = m.pushName

    const texto =
      m.message.conversation ||
      m.message.extendedTextMessage?.text ||
      m.message.imageMessage?.caption ||
      m.message.videoMessage?.caption ||
      ''

    if (m.key.remoteJid.endsWith('@g.us') && !m.key.fromMe) {
      const gCfg = (leerConfig().grupos || {})[m.key.remoteJid] || {}
      if (gCfg.antilink && /chat\.whatsapp\.com\/[A-Za-z0-9]+/i.test(texto) && !(await esAdmin(sock, m))) {
        try {
          await sock.sendMessage(m.key.remoteJid, { delete: m.key })
          await sock.groupParticipantsUpdate(m.key.remoteJid, [m.key.participant], 'remove')
        } catch (e) {
          console.log('Antilink:', e.message)
        }
        return
      }
    }

    if (m.key.remoteJid.endsWith('@g.us') && !m.key.fromMe) {
      const listaMute = (leerConfig().muteados || {})[m.key.remoteJid] || []
      if (listaMute.length) {
        const idsMute = [m.key.participant, m.key.participantAlt]
          .filter(Boolean)
          .map(j => j.split('@')[0].split(':')[0])
        if (idsMute.some(n => listaMute.includes(n))) {
          try {
            await sock.sendMessage(m.key.remoteJid, { delete: m.key })
          } catch {}
          return
        }
      }
    }

    // Sistema de rachas estilo TikTok
    if (m.key.remoteJid.endsWith('@g.us') && !m.key.fromMe) {
      const participanteRacha = m.key.participantAlt || m.key.participant
      if (participanteRacha) {
        racha.registrarMensaje(m.key.remoteJid, racha.numero(participanteRacha))
      }
    }

    // Acepta prefijos separados del comando por cualquier cantidad de espacios
    const textoLimpio = texto.trim()
    const soloMenu = sinTildes(textoLimpio) === 'menu'
    const coincidePrefijo = textoLimpio.match(/^([!#./])\s*(\S[\s\S]*)$/)
    if (!soloMenu && !coincidePrefijo) return

    const cuerpo = soloMenu ? textoLimpio : coincidePrefijo[2].trim()
    const [cmd, ...args] = cuerpo.split(/\s+/)
    const comando = sinTildes(cmd)
    const jid = m.key.remoteJid
    let marcaFinal = null
    const reaccionar = e => sock.sendMessage(jid, { react: { text: e, key: m.key } }).catch(() => {})
    const responder = async t => {
      const s = String(t)
      if (/^❌ Espera/.test(s) || (s.startsWith('⏳') && !/Descargando|Generando|Convirtiendo|Creando|Actualizando/.test(s))) marcaFinal = '⏳'
      else if (s.startsWith('⛔')) marcaFinal = '🚫'
      else if (s.startsWith('❌') || s.startsWith('⚠️')) marcaFinal = '❌'
      return sock.sendMessage(jid, { text: t }, { quoted: m })
    }
    if (jid.endsWith('@g.us') && ((leerConfig().grupos || {})[jid] || {}).modoadmin && !(await esAdmin(sock, m))) return
    if (leerConfig().apagado && !esDueno(m)) return
    if (esBaneado(m) && !esDueno(m)) return

    const comandosSoloDueno = new Set([
      'setowner', 'delowner',
      'activarbot', 'desactivarbot',
      'setnombre', 'setbienvenida', 'setdespedida',
      'setperfil', 'setban', 'setred', 'key',
      'setprotect', 'setnsfw', 'setmenu', 'miid', 'registrargrupo'
    ])

    if (comandosSoloDueno.has(comando) && !esDueno(m)) {
      await responder('⛔ Solo el dueño autorizado puede usar este comando.')
      return
    }

    const conocido = COMANDOS.has(comando)
    if (conocido) await reaccionar('⏳')

    switch (comando) {
      case 'racha': {
        if (!jid.endsWith('@g.us')) {
          await responder('⛔ La racha se configura dentro de un grupo.')
          break
        }
        const ctx = m.message.extendedTextMessage?.contextInfo || {}
        const objetivo = ctx.mentionedJid?.[0] || ''
        const emisor = racha.numero(m.key.participantAlt || m.key.participant)
        const destino = racha.numero(objetivo)

        if (!destino) {
          await responder('💜 Etiqueta a la persona con quien quieres comenzar una racha.\nEjemplo: .racha @persona')
          break
        }

        const resultado = racha.invitar(jid, emisor, destino)
        if (resultado.error) await responder('⚠️ ' + resultado.error)
        else await responder('🔥 ¡Invitación de racha enviada!\n\n❤️ @' + destino + ', tienes una invitación para crear una racha de amistad.\n\nEscribe .aceptarracha para comenzar.')
        if (!resultado.error) {
          await sock.sendMessage(jid, { text: '🔥 Invitación de racha', mentions: [objetivo] }, { quoted: m })
        }
        break
      }

      case 'aceptarracha': {
        if (!jid.endsWith('@g.us')) {
          await responder('⛔ Usa este comando en un grupo.')
          break
        }
        const usuario = racha.numero(m.key.participantAlt || m.key.participant)
        const resultado = racha.aceptar(jid, usuario)
        if (resultado.error) await responder('⚠️ ' + resultado.error)
        else await responder('🔥 ¡RACHA ACTIVADA!\n\n💜 Ya tienen su racha de amistad.\n📅 Racha actual: 0 días.\n\n¡Ambos deben participar cada día para mantenerla!')
        break
      }

      case 'miracha': {
        const pareja = racha.obtener(jid)
        if (!pareja) {
          await responder('💔 No hay ninguna racha activa en este grupo.\nUsa .racha @persona para invitar a alguien.')
          break
        }
        const menciones = pareja.usuarios.map(n => '@' + n).join(' ❤️ ')
        await sock.sendMessage(jid, {
          text: '🔥 *RACHA DE AMISTAD* 🔥\n\n' +
            menciones +
            '\n\n🔥 Racha actual: *' + pareja.racha + ' días*' +
            '\n🏆 Récord: *' + pareja.mejor + ' días*' +
            '\n📅 Último día completado: ' + (pareja.ultimoDia || 'Todavía ninguno') +
            '\n\n💜 ¡Sigan participando cada día!',
          mentions: pareja.usuarios.map(n => n + '@s.whatsapp.net')
        }, { quoted: m })
        break
      }

      case 'rechazarracha': {
        const usuario = racha.numero(m.key.participantAlt || m.key.participant)
        if (racha.rechazar(jid, usuario)) {
          await responder('❌ Invitación de racha rechazada.')
        } else {
          await responder('⚠️ No tienes una invitación pendiente para rechazar.')
        }
        break
      }

      case 'desactivarracha': {
        const usuario = racha.numero(m.key.participantAlt || m.key.participant)
        if (racha.desactivar(jid, usuario)) {
          await responder('💔 La racha ha sido desactivada.')
        } else {
          await responder('⚠️ No tienes una racha activa en este grupo.')
        }
        break
      }

      case 'registrargrupo': {
        try {
          await registrarGrupo(sock, jid, args[0])
        } catch (e) {
          await responder('❌ ' + e.message)
        }
        break
      }

      case 'ia':
    case 'chatgpt':
    case 'gpt': {
      const pregunta = args.join(' ').trim()
      if (!pregunta) {
        await responder('🤖 Escribe tu pregunta. Ejemplo: #ia ¿Qué es la inteligencia artificial?')
        break
      }
      try {
        const respuesta = await consultarGroq(pregunta)
        await responder('🤖 *LEVI AI*\\n\\n' + respuesta)
      } catch (e) {
        console.error('Error Groq:', e.message)
        await responder('❌ No pude consultar la inteligencia artificial. Inténtalo más tarde.')
      }
      break
    }

    case 'info': {
      const info = `╭━━〔 🤖 SHISUI BOT 〕━━╮
┃ ✨ ¡BIENVENIDO!
╰━━━━━━━━━━━━━━━━━━╯

Soy Shisui Bot, tu asistente de WhatsApp.

╭━━〔 📥 DESCARGAS 〕
┃ 🎵 Música en MP3
┃ 🎬 Videos en MP4
┃ 🔎 Búsqueda de contenido
┃ 🔗 Descargas mediante enlaces compatibles
╰━━━━━━━━━━━━━━━━━━╯

╭━━〔 🖼️ STICKERS E IMÁGENES 〕
┃ Creación de stickers
┃ Conversión de imágenes
┃ Herramientas multimedia
╰━━━━━━━━━━━━━━━━━━╯

╭━━〔 🤖 INTELIGENCIA ARTIFICIAL 〕
┃ Preguntas y respuestas
┃ Consultas con IA
┃ Asistencia inteligente
╰━━━━━━━━━━━━━━━━━━╯

╭━━〔 🛠️ HERRAMIENTAS 〕
┃ Utilidades y funciones especiales
┃ Comandos interactivos
┃ Juegos y entretenimiento
╰━━━━━━━━━━━━━━━━━━╯

╭━━〔 👥 ADMINISTRACIÓN 〕
┃ Herramientas para grupos
┃ Bienvenidas y moderación
┃ Funciones administrativas
╰━━━━━━━━━━━━━━━━━━╯

╭━━〔 📌 ¿CÓMO SE USA? 〕
┃ Escribe #menu para ver los comandos.
┃ Elige la función que necesitas.
┃ Sigue las instrucciones del bot.
╰━━━━━━━━━━━━━━━━━━╯

╭━━〔 🤖 SISTEMA DE SUBBOTS 〕
┃ ⚠️ Límite máximo: 5 subbots.
┃ No se permiten más de 5 conectados.
╰━━━━━━━━━━━━━━━━━━╯

💡 Escribe #menu para descubrir todas las funciones.

💜 SHISUI BOT — TU ASISTENTE DE WHATSAPP.`;
      await responder(info)
      break
    }

    case 'menu': {
        const quien = m.key.participant || m.key.remoteJid
        const tag = '@' + quien.split('@')[0].split(':')[0]
        const saludo = `Hola ${tag}, soy ${leerConfig().nombre || 'Shisui Bot'} 🤖`
        if (fs.existsSync('./foto.jpg')) {
          await sock.sendMessage(jid, { image: fs.readFileSync('./foto.jpg'), caption: saludo + '\n\n' + menuActual(nsfwActivo(jid)), mentions: [quien] }, { quoted: m })
        } else {
          await sock.sendMessage(jid, { text: saludo + '\n\n' + menuActual(nsfwActivo(jid)), mentions: [quien] }, { quoted: m })
        }
        break
      }

      case 'p':
    case 'ping': {
        const t0 = Date.now()
        const enviado = await sock.sendMessage(jid, { text: '🏓 Calculando...' }, { quoted: m })
        const ms = Date.now() - t0
        const seg = Math.floor(process.uptime())
        const activo = Math.floor(seg / 3600) + 'h ' + Math.floor((seg % 3600) / 60) + 'm ' + (seg % 60) + 's'
        await sock.sendMessage(jid, {
          text: '🏓 Pong!\n⚡ Velocidad: ' + ms + ' ms\n⏱️ Activo: ' + activo,
          edit: enviado.key
        })
        break
      }

      case 'setowner': {
        if (!esDuenoPrincipal(m)) {
          await responder('⛔ Solo el dueño principal puede dar o quitar dueños.')
          break
        }
        const mencionados = m.message.extendedTextMessage?.contextInfo?.mentionedJid || []
        const citado = m.message.extendedTextMessage?.contextInfo?.participant
        let nuevoDueno = mencionados[0] || citado || args[0] || ''
        nuevoDueno = nuevoDueno.split('@')[0].split(':')[0].replace(/\D/g, '')
        if (!nuevoDueno) {
          await responder('Uso:\n#setowner @persona\n#setowner 5491112345678\nO responde a un mensaje de la persona con #setowner')
          break
        }
        const cfgDuenos = leerConfig()
        cfgDuenos.duenos = cfgDuenos.duenos || []
        if (DUENOS.includes(nuevoDueno) || cfgDuenos.duenos.includes(nuevoDueno)) {
          await responder('ℹ️ Ese número ya es dueño del bot.')
          break
        }
        cfgDuenos.duenos.push(nuevoDueno)
        guardarConfig(cfgDuenos)
        await responder('✅ Nuevo dueño agregado: ' + nuevoDueno)
        break
      }
      case 'delowner': {
        if (!esDuenoPrincipal(m)) {
          await responder('⛔ Solo el dueño principal puede dar o quitar dueños.')
          break
        }
        const mencionadosDel = m.message.extendedTextMessage?.contextInfo?.mentionedJid || []
        const citadoDel = m.message.extendedTextMessage?.contextInfo?.participant
        let quitar = mencionadosDel[0] || citadoDel || args[0] || ''
        quitar = quitar.split('@')[0].split(':')[0].replace(/\D/g, '')
        if (!quitar) {
          await responder('Uso:\n#delowner @persona\n#delowner 5491112345678\nO responde a un mensaje de la persona con #delowner')
          break
        }
        if (DUENOS.includes(quitar)) {
          await responder('⛔ No se puede quitar al dueño principal.')
          break
        }
        const cfgDel = leerConfig()
        cfgDel.duenos = cfgDel.duenos || []
        if (!cfgDel.duenos.includes(quitar)) {
          await responder('ℹ️ Ese número no está en la lista de dueños.')
          break
        }
        cfgDel.duenos = cfgDel.duenos.filter(n => n !== quitar)
        guardarConfig(cfgDel)
        await responder('✅ Dueño eliminado: ' + quitar)
        break
      }
      case 'activarbot':
      case 'desactivarbot': {
        if (!esDueno(m)) {
          await responder('⛔ Solo el dueño del bot puede usar este comando.')
          break
        }
        const cfgBot = leerConfig()
        if (comando === 'activarbot') {
          delete cfgBot.apagado
          guardarConfig(cfgBot)
          await responder('✅ Bot activado. Ya responde a todos.')
        } else {
          cfgBot.apagado = true
          guardarConfig(cfgBot)
          await responder('⛔ Bot desactivado. Solo responderá a los dueños. Usa #activarbot para encenderlo.')
        }
        break
      }
      case 'setnombre': {
        if (!esDueno(m)) {
          await responder('⛔ Solo el dueño del bot puede usar este comando.')
          break
        }
        const nombreNuevo = cuerpo.slice(cmd.length).trim()
        const cfgNombre = leerConfig()
        if (!nombreNuevo) {
          await responder('Uso:\n#setnombre <nuevo nombre>\n#setnombre reset (volver a Shisui Bot)')
        } else if (nombreNuevo.toLowerCase() === 'reset') {
          delete cfgNombre.nombre
          guardarConfig(cfgNombre)
          await responder('✅ Nombre restaurado: Shisui Bot')
        } else {
          cfgNombre.nombre = nombreNuevo
          guardarConfig(cfgNombre)
          await responder('✅ Nombre del bot cambiado a: ' + nombreNuevo)
        }
        break
      }
      case 'setbienvenida':
      case 'setdespedida': {
        if (!esDueno(m)) {
          await responder('⛔ Solo el dueño del bot puede usar este comando.')
          break
        }
        const clave = comando === 'setbienvenida' ? 'textoBienvenida' : 'textoDespedida'
        const nombreCmd = comando === 'setbienvenida' ? 'bienvenida' : 'despedida'
        const textoNuevo = cuerpo.slice(cmd.length).trim()
        const cfgTxt = leerConfig()
        if (!textoNuevo) {
          await responder('Uso:\n#' + comando + ' <texto>\n#' + comando + ' reset\n\nPuedes usar {usuario} (menciona a la persona) y {grupo} (nombre del grupo).')
        } else if (textoNuevo.toLowerCase() === 'reset') {
          delete cfgTxt[clave]
          guardarConfig(cfgTxt)
          await responder('✅ Texto de ' + nombreCmd + ' restaurado.')
        } else {
          cfgTxt[clave] = textoNuevo
          guardarConfig(cfgTxt)
          await responder('✅ Texto de ' + nombreCmd + ' actualizado. Actívalo en el grupo con #' + nombreCmd + ' on')
        }
        break
      }

      case 'bienvenida':
      case 'despedida': {
        if (!jid.endsWith('@g.us')) {
          await responder('Este comando solo funciona en grupos.')
          break
        }
        if (!(await esAdmin(sock, m))) {
          await responder('⛔ Solo los admins del grupo pueden usar este comando.')
          break
        }
        const opcion = (args[0] || '').toLowerCase()
        if (opcion !== 'on' && opcion !== 'off') {
          await responder('Uso:\n#' + comando + ' on\n#' + comando + ' off')
          break
        }
        const cfgGrupo = leerConfig()
        cfgGrupo.grupos = cfgGrupo.grupos || {}
        cfgGrupo.grupos[jid] = cfgGrupo.grupos[jid] || {}
        cfgGrupo.grupos[jid][comando] = opcion === 'on'
        guardarConfig(cfgGrupo)
        await responder('✅ ' + comando.charAt(0).toUpperCase() + comando.slice(1) + (opcion === 'on' ? ' activada' : ' desactivada') + ' en este grupo.')
        break
      }

      case 'setperfil': {
        if (!esDueno(m)) {
          await responder('⛔ Solo el dueño del bot puede usar este comando.')
          break
        }
        const ctx = m.message.extendedTextMessage?.contextInfo
        let msgImg = null
        if (m.message.imageMessage) {
          msgImg = m
        } else if (ctx?.quotedMessage?.imageMessage) {
          msgImg = {
            key: { remoteJid: jid, id: ctx.stanzaId, participant: ctx.participant },
            message: ctx.quotedMessage
          }
        }
        if (!msgImg) {
          await responder('Uso: envía una foto con el texto #setperfil, o responde a una foto con #setperfil.')
          break
        }
        try {
          const buffer = await downloadMediaMessage(
            msgImg, 'buffer', {},
            { logger: pino({ level: 'silent' }), reuploadRequest: sock.updateMediaMessage }
          )
          fs.writeFileSync('./foto.jpg', buffer)
          await responder('✅ Foto del menú actualizada. Pruébala con #menu')
        } catch (e) {
          console.log('Error en setperfil:', e.message)
          await responder('❌ No pude descargar la foto. Intenta de nuevo.')
        }
        break
      }

      case 'setban': {
        if (!esDueno(m)) {
          await responder('⛔ Solo el dueño del bot puede usar este comando.')
          break
        }
        const ctxBan = m.message.extendedTextMessage?.contextInfo
        const cfgBan = leerConfig()
        cfgBan.baneados = cfgBan.baneados || []
        const sub = (args[0] || '').toLowerCase()
        if (sub === 'lista') {
          await responder(cfgBan.baneados.length ? '🚫 Baneados:\n' + cfgBan.baneados.map(n => '• ' + n).join('\n') : 'No hay usuarios baneados.')
          break
        }
        const quitarBan = sub === 'quitar'
        const resto = quitarBan ? args.slice(1) : args
        let objetivo = (ctxBan?.mentionedJid || [])[0] || ctxBan?.participant || resto[0] || ''
        objetivo = objetivo.split('@')[0].split(':')[0].replace(/\D/g, '')
        if (!objetivo) {
          await responder('Uso:\n#setban @persona\n#setban 5491112345678\n#setban quitar @persona\n#setban lista\nO responde a un mensaje de la persona con #setban')
          break
        }
        if (quitarBan) {
          if (!cfgBan.baneados.includes(objetivo)) {
            await responder('ℹ️ Ese número no está baneado.')
            break
          }
          cfgBan.baneados = cfgBan.baneados.filter(n => n !== objetivo)
          guardarConfig(cfgBan)
          await responder('✅ Usuario desbaneado: ' + objetivo)
          break
        }
        if (DUENOS.includes(objetivo) || (cfgBan.duenos || []).includes(objetivo)) {
          await responder('⛔ No puedes banear a un dueño.')
          break
        }
        if (cfgBan.baneados.includes(objetivo)) {
          await responder('ℹ️ Ese número ya está baneado.')
        } else {
          cfgBan.baneados.push(objetivo)
          guardarConfig(cfgBan)
          await responder('🚫 Usuario baneado: ' + objetivo + '. El bot lo ignorará.')
        }
        break
      }

      case 'setred': {
        if (!esDueno(m)) {
          await responder('⛔ Solo el dueño del bot puede usar este comando.')
          break
        }
        const enlaceNuevo = cuerpo.slice(cmd.length).trim()
        const cfgRed = leerConfig()
        if (!enlaceNuevo) {
          await responder('Uso:\n#setred <enlace del canal>\n#setred reset (volver al canal original)')
        } else if (enlaceNuevo.toLowerCase() === 'reset') {
          delete cfgRed.red
          guardarConfig(cfgRed)
          await responder('✅ Enlace restaurado al original.')
        } else if (!/^https?:\/\//i.test(enlaceNuevo)) {
          await responder('⚠️ El enlace debe empezar con https://')
        } else {
          cfgRed.red = enlaceNuevo
          guardarConfig(cfgRed)
          await responder('✅ Enlace actualizado. Pruébalo con #menu')
        }
        break
      }

      case 'key': {
        if (!esDueno(m)) {
          await responder('⛔ Solo el dueño del bot puede usar este comando.')
          break
        }
        const ocultar = k => (k.length > 8 ? k.slice(0, 4) + '••••' : '••••')
        const claveNueva = cuerpo.slice(cmd.length).trim()
        const cfgKey = leerConfig()
        if (!claveNueva) {
          await responder(
            cfgKey.apikey
              ? '🔑 Hay una API key guardada: ' + ocultar(cfgKey.apikey)
              : 'No hay API key guardada.\n\nUso:\n#key <tu api key>\n#key reset (borrarla)'
          )
        } else if (claveNueva.toLowerCase() === 'reset') {
          delete cfgKey.apikey
          guardarConfig(cfgKey)
          await responder('✅ API key borrada.')
        } else {
          cfgKey.apikey = claveNueva
          guardarConfig(cfgKey)
          await responder('✅ API key guardada: ' + ocultar(claveNueva))
        }
        break
      }

      case 'setprotect': {
        if (!esDueno(m)) {
          await responder('⛔ Solo el dueño del bot puede usar este comando.')
          break
        }
        if (!jid.endsWith('@g.us')) {
          await responder('Este comando solo funciona en grupos.')
          break
        }
        const cfgPro = leerConfig()
        cfgPro.grupos = cfgPro.grupos || {}
        const gPro = cfgPro.grupos[jid] = cfgPro.grupos[jid] || {}
        const a0 = (args[0] || '').toLowerCase()
        const a1 = (args[1] || '').toLowerCase()
        const estado = x => (x ? '✅ activado' : '❌ desactivado')
        if (a0 === 'prefijos') {
          const lista = args.slice(1).map(p => p.replace(/\D/g, '')).filter(Boolean)
          if (!lista.length) {
            await responder('Uso: #setprotect prefijos 54 504\n(prefijos de país permitidos, sin +)')
            break
          }
          cfgPro.prefijosPermitidos = lista
          guardarConfig(cfgPro)
          await responder('✅ Prefijos permitidos: +' + lista.join(', +'))
          break
        }
        if (a0 === 'on' || a0 === 'off') {
          gPro.protect = a0 === 'on'
          guardarConfig(cfgPro)
          try {
            await sock.groupSettingUpdate(jid, gPro.protect ? 'locked' : 'unlocked')
            await responder(gPro.protect
              ? '🛡️ Protección activada: solo los admins pueden cambiar nombre, foto y descripción.'
              : '🛡️ Protección desactivada: todos pueden editar la info del grupo.')
          } catch (e) {
            await responder('⚠️ Quedó guardado, pero necesito ser admin del grupo para bloquear los cambios.')
          }
          break
        }
        if ((a0 === 'antilink' || a0 === 'antifake') && (a1 === 'on' || a1 === 'off')) {
          gPro[a0] = a1 === 'on'
          guardarConfig(cfgPro)
          let extra = ''
          if (a0 === 'antifake' && a1 === 'on' && !(cfgPro.prefijosPermitidos || []).length) {
            extra = '\n⚠️ Aún no hay prefijos permitidos. Usa: #setprotect prefijos 54 504'
          }
          await responder('✅ ' + a0 + (a1 === 'on' ? ' activado' : ' desactivado') + ' en este grupo.' + extra)
          break
        }
        await responder(
          '🛡️ Protección del grupo\n\n' +
          'Protección: ' + estado(gPro.protect) + '\n' +
          'Antilink: ' + estado(gPro.antilink) + '\n' +
          'Antifake: ' + estado(gPro.antifake) + '\n' +
          'Prefijos permitidos: ' + ((cfgPro.prefijosPermitidos || []).join(', ') || 'ninguno') + '\n\n' +
          'Uso:\n#setprotect on / off\n#setprotect antilink on / off\n#setprotect antifake on / off\n#setprotect prefijos 54 504'
        )
        break
      }

      case 'setnsfw': {
        if (!esDueno(m)) {
          await responder('⛔ Solo el dueño del bot puede usar este comando.')
          break
        }
        const cfgNsfw = leerConfig()
        cfgNsfw.nsfw = cfgNsfw.nsfw || {}
        const op = (args[0] || '').toLowerCase()
        if (op !== 'on' && op !== 'off') {
          await responder(
            '🔞 Contenido +18 en este chat: ' + (cfgNsfw.nsfw[jid] ? '✅ activado' : '❌ desactivado') +
            '\n\nUso:\n#setnsfw on\n#setnsfw off'
          )
          break
        }
        cfgNsfw.nsfw[jid] = op === 'on'
        guardarConfig(cfgNsfw)
        await responder(op === 'on' ? '🔞 Contenido +18 activado en este chat.' : '✅ Contenido +18 desactivado en este chat.')
        break
      }

      case 'miid': {
        const ids = {
          participant: m.key.participant || null,
          participantAlt: m.key.participantAlt || null,
          remoteJid: m.key.remoteJid,
          remoteJidAlt: m.key.remoteJidAlt || null,
          fromMe: !!m.key.fromMe,
          esDueno: esDueno(m)
        }
        await responder('🆔 Tus datos:\n' + JSON.stringify(ids, null, 2))
        break
      }

      case 'link': {
        if (!jid.endsWith('@g.us')) {
          await responder('Este comando solo funciona en grupos.')
          break
        }
        if (!(await esAdmin(sock, m))) {
          await responder('⛔ Solo los admins del grupo pueden usar este comando.')
          break
        }
        try {
          const codigo = await sock.groupInviteCode(jid)
          const metaLink = await sock.groupMetadata(jid)
          await responder('🔗 Enlace de ' + metaLink.subject + ':\nhttps://chat.whatsapp.com/' + codigo)
        } catch (e) {
          await responder('⚠️ Necesito ser admin del grupo para obtener el enlace.')
        }
        break
      }

      case 'reglas': {
        const cfgReg = leerConfig()
        cfgReg.reglas = cfgReg.reglas || {}
        const textoReglas = cuerpo.slice(cmd.length).trim()
        if (!textoReglas) {
          await responder(
            cfgReg.reglas[jid]
              ? '📜 Reglas:\n\n' + cfgReg.reglas[jid]
              : '📜 Este chat aún no tiene reglas.\nUn admin puede ponerlas con: #reglas <texto>'
          )
          break
        }
        if (!(await esAdmin(sock, m))) {
          await responder('⛔ Solo los admins pueden cambiar las reglas.')
          break
        }
        if (textoReglas.toLowerCase() === 'reset') {
          delete cfgReg.reglas[jid]
          guardarConfig(cfgReg)
          await responder('✅ Reglas borradas.')
        } else {
          cfgReg.reglas[jid] = textoReglas
          guardarConfig(cfgReg)
          await responder('✅ Reglas guardadas. Cualquiera puede verlas con #reglas')
        }
        break
      }

      case 'musica':
      case 'm':
      case 'play':
      case 'video':
      case 'v':
      case 'tiktok':
      case 'tt':
      case 'facebook':
      case 'fb':
      case 'x':
      case 'instagram':
      case 'ig':
      case 'pinterest': {
        const tipos = {
          musica: 'musica', m: 'musica', play: 'musica', video: 'video', v: 'video',
          tiktok: 'tiktok', tt: 'tiktok', facebook: 'facebook', fb: 'facebook',
          x: 'x', instagram: 'instagram', ig: 'instagram', pinterest: 'pinterest'
        }
        const tipo = tipos[comando]
        const entrada = cuerpo.slice(cmd.length).trim()
        const ejemplos = {
          musica: '#musica nombre de la canción',
          video: '#video nombre del video',
          tiktok: '#tiktok <enlace>',
          facebook: '#facebook <enlace>',
          x: '#x <enlace>',
          instagram: '#instagram <enlace>', pinterest: '#pinterest <enlace>'
        }
        if (!entrada) {
          await responder('Uso: ' + ejemplos[tipo])
          break
        }
        if (tipo === 'pinterest' && !/^https?:\/\//i.test(entrada)) {
          await responder('🔎 Buscando 3 imágenes de: ' + entrada)
          try {
            const resultados = await buscarImagenes(entrada, 3)
            if (!resultados.length) {
              await responder('❌ No encontré imágenes. Prueba con otro nombre.')
              break
            }

            let enviadas = 0
            for (const imagen of resultados) {
              try {
                const buffer = await bajarMedia(imagen.url, 10)
                await sock.sendMessage(jid, {
                  image: buffer,
                  caption: '🖼️ ' + imagen.titulo + '\n🔎 Búsqueda: ' + entrada
                }, { quoted: m })
                enviadas++
              } catch (e) {
                console.log('Error enviando imagen Pinterest:', e.message)
              }
            }

            if (!enviadas) await responder('❌ No pude enviar las imágenes encontradas.')
          } catch (e) {
            console.log('Error buscando imágenes:', e.message)
            await responder('❌ ' + String(e.message || 'Error al buscar imágenes.').slice(0, 150))
          }
          break
        }

        const validar = {
          tiktok: /tiktok\.com/i,
          facebook: /(facebook\.com|fb\.watch)/i,
          x: /(x\.com|twitter\.com)/i,
          instagram: /instagram\.com/i, pinterest: /(pinterest\.com|pin\.it)/i
        }
        if (validar[tipo] && !validar[tipo].test(entrada)) {
          await responder('⚠️ Envía un enlace válido de ' + tipo + '.\nUso: ' + ejemplos[tipo])
          break
        }
        const claveApi = leerConfig().apikey || 'local'
        if (!claveApi) {
          await responder('⚠️ Falta la API key. El dueño debe guardarla con #key <clave>')
          break
        }
        let objetivoDl = entrada
        const inf = await informacion(tipo, entrada, m.key.participant || m.key.remoteJid)
        if (inf.espera) {
          await responder('❌ ' + inf.error)
          break
        }
        if (inf.ok) {
          objetivoDl = inf.objetivo
          if (inf.miniatura) {
            await sock.sendMessage(jid, { image: inf.miniatura, caption: inf.texto }, { quoted: m })
          } else {
            await sock.sendMessage(jid, { text: inf.texto }, { quoted: m })
          }
        } else {
          await responder('⏳ Descargando, espera un momento...')
        }
        try {
          const r = await descargar(tipo, objetivoDl, claveApi, null)
          if (!r.ok) {
            await responder('❌ ' + (r.error || 'No pude descargarlo.'))
            break
          }
          if (r.tipo === 'audio') {
            await sock.sendMessage(jid, { audio: await bajarMedia(r.url), mimetype: 'audio/mpeg' }, { quoted: m })
          } else if (r.tipo === 'image') {
            await sock.sendMessage(jid, { image: await bajarMedia(r.url), caption: r.titulo || '' }, { quoted: m })
          } else {
            await sock.sendMessage(jid, { video: await bajarMedia(r.url), mimetype: 'video/mp4', caption: r.titulo || '' }, { quoted: m })
          }
        } catch (e) {
          console.log('Error de descarga:', e.message)
          await responder('❌ Error al descargar: ' + String(e.message || '').slice(0, 120))
        }
        break
      }

      case 'sticker':
      case 's': {
        const ctxS = m.message.extendedTextMessage?.contextInfo
        let msgFoto = null
        if (m.message.imageMessage) {
          msgFoto = m
        } else if (ctxS?.quotedMessage?.imageMessage) {
          msgFoto = {
            key: { remoteJid: jid, id: ctxS.stanzaId, participant: ctxS.participant },
            message: ctxS.quotedMessage
          }
        }
        if (!msgFoto) {
          await responder('Uso: responde a una foto con #sticker, o envía una foto con el texto #sticker.')
          break
        }
        try {
          const bufferFoto = await downloadMediaMessage(
            msgFoto, 'buffer', {},
            { logger: pino({ level: 'silent' }), reuploadRequest: sock.updateMediaMessage }
          )
          const webp = await imagenASticker(bufferFoto)
          await sock.sendMessage(jid, { sticker: await conMetadatos(webp) }, { quoted: m })
        } catch (e) {
          console.log('Error en sticker:', e.message)
          await responder('❌ No pude crear el sticker.')
        }
        break
      }

      case 'random':
      case 'stik': {
        fs.mkdirSync('./stickers', { recursive: true })
        const opS = (args[0] || '').toLowerCase()
        const archivos = () => fs.readdirSync('./stickers').filter(f => f.endsWith('.webp'))
        if (opS === 'agregar') {
          if (!esDueno(m)) {
            await responder('⛔ Solo el dueño del bot puede agregar stickers.')
            break
          }
          const ctxR = m.message.extendedTextMessage?.contextInfo
          if (!ctxR?.quotedMessage?.stickerMessage) {
            await responder('Responde a un sticker con: #random agregar')
            break
          }
          try {
            const msgSt = {
              key: { remoteJid: jid, id: ctxR.stanzaId, participant: ctxR.participant },
              message: ctxR.quotedMessage
            }
            const bufSt = await downloadMediaMessage(
              msgSt, 'buffer', {},
              { logger: pino({ level: 'silent' }), reuploadRequest: sock.updateMediaMessage }
            )
            fs.writeFileSync('./stickers/' + Date.now() + '.webp', bufSt)
            await responder('✅ Sticker agregado. Total en la colección: ' + archivos().length)
          } catch (e) {
            console.log('Error al agregar sticker:', e.message)
            await responder('❌ No pude guardar el sticker.')
          }
          break
        }
        if (opS === 'total') {
          await responder('🎴 Stickers en la colección: ' + archivos().length)
          break
        }
        const lista = archivos()
        if (!lista.length) {
          await responder('La colección está vacía. El dueño puede agregar stickers respondiendo a uno con #random agregar')
          break
        }
        const elegido = lista[Math.floor(Math.random() * lista.length)]
        await sock.sendMessage(jid, { sticker: fs.readFileSync('./stickers/' + elegido) }, { quoted: m })
        break
      }

      case 'reporte':
      case 'r': {
        const textoRep = cuerpo.slice(cmd.length).trim()
        if (!textoRep) {
          await responder('Uso: #reporte <describe el problema o sugerencia>')
          break
        }
        const ahoraRep = Date.now()
        const quienRep = m.key.participant || m.key.remoteJid
        if (reportesRecientes[quienRep] && ahoraRep - reportesRecientes[quienRep] < 60000) {
          await responder('⏳ Espera un minuto antes de enviar otro reporte.')
          break
        }
        reportesRecientes[quienRep] = ahoraRep
        const idsRep = [m.key.participantAlt, m.key.remoteJidAlt, m.key.participant, m.key.remoteJid].filter(Boolean)
        const jidTel = idsRep.find(j => j.endsWith('@s.whatsapp.net')) || idsRep[0]
        const numRep = jidTel.split('@')[0].split(':')[0]
        let chatRep = 'Privado'
        if (jid.endsWith('@g.us')) {
          try {
            chatRep = (await sock.groupMetadata(jid)).subject
          } catch {
            chatRep = 'Grupo'
          }
        }
        try {
          await sock.sendMessage(DUENO_JID, {
            text: '📩 Nuevo reporte\n\n👤 De: ' + (m.pushName || 'Sin nombre') + ' (+' + numRep + ')\n💬 Chat: ' + chatRep + '\n\n📝 ' + textoRep
          })
          await responder('✅ Reporte enviado al dueño. ¡Gracias!')
        } catch (e) {
          console.log('Error al enviar reporte:', e.message)
          await responder('❌ No pude enviar el reporte. Intenta más tarde.')
        }
        break
      }

      case 'piti': {
        const opP = (args[0] || '').toLowerCase()
        const cfgPiti = leerConfig()
        if (opP === 'agregar') {
          if (!esDueno(m)) {
            await responder('⛔ Solo el dueño del bot puede cambiar el audio.')
            break
          }
          const ctxP = m.message.extendedTextMessage?.contextInfo
          const audioQ = ctxP?.quotedMessage?.audioMessage
          if (!audioQ) {
            await responder('Responde a un audio o nota de voz con: #piti agregar')
            break
          }
          try {
            const msgAu = {
              key: { remoteJid: jid, id: ctxP.stanzaId, participant: ctxP.participant },
              message: ctxP.quotedMessage
            }
            const bufAu = await downloadMediaMessage(
              msgAu, 'buffer', {},
              { logger: pino({ level: 'silent' }), reuploadRequest: sock.updateMediaMessage }
            )
            fs.writeFileSync('./piti.audio', bufAu)
            cfgPiti.piti = { mimetype: audioQ.mimetype || 'audio/ogg; codecs=opus', ptt: !!audioQ.ptt }
            guardarConfig(cfgPiti)
            await responder('✅ Audio de #piti guardado.')
          } catch (e) {
            console.log('Error al guardar audio piti:', e.message)
            await responder('❌ No pude guardar el audio.')
          }
          break
        }
        if (!cfgPiti.piti || !fs.existsSync('./piti.audio')) {
          await responder('Aún no hay audio. El dueño puede ponerlo respondiendo a un audio con #piti agregar')
          break
        }
        await sock.sendMessage(
          jid,
          { audio: fs.readFileSync('./piti.audio'), mimetype: cfgPiti.piti.mimetype, ptt: cfgPiti.piti.ptt },
          { quoted: m }
        )
        break
      }

      case 'pfp':
      case 'perfil': {
        const ctxF = m.message.extendedTextMessage?.contextInfo
        let objetivoF = (ctxF?.mentionedJid || [])[0] || ctxF?.participant || ''
        if (!objetivoF && args[0]) {
          const dig = args[0].replace(/\D/g, '')
          if (dig) objetivoF = dig + '@s.whatsapp.net'
        }
        const usoDefault = !objetivoF
        if (usoDefault) objetivoF = m.key.participant || m.key.remoteJid
        const candidatosF = [objetivoF]
        if (usoDefault) candidatosF.push(m.key.participantAlt, m.key.remoteJidAlt)
        let urlFoto = null
        for (const c of candidatosF.filter(Boolean)) {
          try {
            urlFoto = await sock.profilePictureUrl(c, 'image')
            objetivoF = c
            break
          } catch {}
        }
        if (!urlFoto) {
          await responder('⚠️ No pude obtener la foto. Puede que no tenga o que la tenga oculta.')
          break
        }
        await sock.sendMessage(
          jid,
          {
            image: { url: urlFoto },
            caption: '🖼️ Foto de perfil de @' + objetivoF.split('@')[0].split(':')[0],
            mentions: [objetivoF]
          },
          { quoted: m }
        )
        break
      }

      case 'fotogrupo':
      case 'gpfp': {
        if (!jid.endsWith('@g.us')) {
          await responder('Este comando solo funciona en grupos.')
          break
        }
        try {
          const urlGrupo = await sock.profilePictureUrl(jid, 'image')
          const metaFG = await sock.groupMetadata(jid)
          await sock.sendMessage(
            jid,
            { image: { url: urlGrupo }, caption: '🖼️ Foto del grupo ' + metaFG.subject },
            { quoted: m }
          )
        } catch (e) {
          await responder('⚠️ Este grupo no tiene foto o no pude obtenerla.')
        }
        break
      }

      case 'consejo': {
        const base = [
          'Bebe agua, tu cuerpo te lo agradecerá. 💧',
          'Duerme bien: casi todo se ve mejor después de descansar. 😴',
          'Haz hoy una cosa pequeña que tu yo del futuro agradezca.',
          'No compares tu capítulo 1 con el capítulo 20 de otra persona.',
          'Pide ayuda cuando la necesites; no hace falta poder con todo solo.',
          'Respira hondo antes de responder cuando estés molesto.',
          'Haz copias de seguridad de lo importante. 💾',
          'Aprende algo nuevo cada día, aunque sea pequeño. 📚',
          'Ser constante gana a ser perfecto.',
          'Cuida tus contraseñas y no las compartas con nadie. 🔐',
          'Revisa dos veces antes de enviar un mensaje importante.',
          'Camina un rato, te despeja la cabeza. 🚶',
          'Agradece algo hoy, por pequeño que sea. 🙏',
          'Escucha más de lo que hablas.',
          'Si algo sale mal, aprende y sigue: los errores también enseñan.'
        ]
        const cfgCons = leerConfig()
        const extras = cfgCons.consejos || []
        const opC = (args[0] || '').toLowerCase()
        if (opC === 'agregar') {
          if (!esDueno(m)) {
            await responder('⛔ Solo el dueño del bot puede agregar consejos.')
            break
          }
          const nuevoC = cuerpo.slice(cmd.length).trim().slice('agregar'.length).trim()
          if (!nuevoC) {
            await responder('Uso: #consejo agregar <texto del consejo>')
            break
          }
          cfgCons.consejos = extras.concat(nuevoC)
          guardarConfig(cfgCons)
          await responder('✅ Consejo agregado. Total: ' + (base.length + cfgCons.consejos.length))
          break
        }
        const todosC = base.concat(extras)
        const elegidoC = todosC[Math.floor(Math.random() * todosC.length)]
        await responder('💡 Consejo:\n\n' + elegidoC)
        break
      }

      case 'voz': {
        const ctxV = m.message.extendedTextMessage?.contextInfo
        const citadoV = ctxV?.quotedMessage?.conversation || ctxV?.quotedMessage?.extendedTextMessage?.text || ''
        const textoV = cuerpo.slice(cmd.length).trim() || citadoV
        if (!textoV) {
          await responder('Uso: #voz <texto>\nO responde a un mensaje de texto con #voz')
          break
        }
        if (textoV.length > 300) {
          await responder('⚠️ El texto es muy largo. Máximo 300 caracteres.')
          break
        }
        try {
          const rV = await textoAVoz(textoV, leerConfig().apikey)
          if (!rV.ok) {
            await responder('❌ ' + (rV.error || 'No pude generar el audio.'))
            break
          }
          await sock.sendMessage(
            jid,
            { audio: rV.buffer ? rV.buffer : { url: rV.url }, mimetype: rV.mimetype || 'audio/mpeg', ptt: true },
            { quoted: m }
          )
        } catch (e) {
          console.log('Error en voz:', e.message)
          await responder('❌ Error al generar la voz.')
        }
        break
      }

      case 'fake':
      case 'fq': {
        const ctxQ = m.message.extendedTextMessage?.contextInfo
        const citadoQ = ctxQ?.quotedMessage
        let textoQ = ''
        let autorQ = null
        if (citadoQ) {
          textoQ = citadoQ.conversation || citadoQ.extendedTextMessage?.text || citadoQ.imageMessage?.caption || ''
          autorQ = ctxQ.participant || m.key.remoteJid
        } else {
          textoQ = cuerpo.slice(cmd.length).trim()
          autorQ = m.key.participant || m.key.remoteJid
        }
        if (!textoQ) {
          await responder('Uso:\nResponde a un mensaje con #fq\nO escribe: #fq <tu texto>')
          break
        }
        if (textoQ.length > 200) {
          await responder('⚠️ El texto es muy largo. Máximo 200 caracteres.')
          break
        }
        const esPropio = !citadoQ
        const candidatosQ = [autorQ]
        if (esPropio) candidatosQ.push(m.key.participantAlt, m.key.remoteJidAlt)
        const numQ = autorQ.split('@')[0].split(':')[0]
        const nombreQ = esPropio ? (m.pushName || '+' + numQ) : (nombres[autorQ] || '+' + numQ)
        let avatarQ = null
        for (const c of candidatosQ.filter(Boolean)) {
          try {
            const urlQ = await sock.profilePictureUrl(c, 'image')
            const resQ = await fetch(urlQ)
            avatarQ = Buffer.from(await resQ.arrayBuffer())
            break
          } catch {}
        }
        try {
          const webpQ = await crearCita({ nombre: nombreQ, texto: textoQ, avatar: avatarQ })
          await sock.sendMessage(jid, { sticker: await conMetadatos(webpQ) }, { quoted: m })
        } catch (e) {
          console.log('Error en fq:', e.message)
          await responder('❌ No pude crear el sticker de cita.')
        }
        break
      }

      case 'party': {
        if (!jid.endsWith('@g.us')) {
          await responder('Este comando solo funciona en grupos.')
          break
        }
        if (!(await esAdmin(sock, m))) {
          await responder('⛔ Solo los admins del grupo pueden usar este comando.')
          break
        }
        const ahoraP = Date.now()
        if (partyReciente[jid] && ahoraP - partyReciente[jid] < 300000) {
          await responder('⏳ Espera unos minutos antes de volver a usar #party.')
          break
        }
        partyReciente[jid] = ahoraP
        try {
          const metaP = await sock.groupMetadata(jid)
          const idsP = metaP.participants.map(p => p.id)
          const mensajeP = cuerpo.slice(cmd.length).trim() || '¡Hay fiesta en el grupo!'
          const listaP = idsP.map(id => '@' + id.split('@')[0].split(':')[0]).join(' ')
          await sock.sendMessage(jid, {
            text: '🎉🥳 *FIESTA* 🥳🎉\n\n' + mensajeP + '\n\n' + listaP,
            mentions: idsP
          })
        } catch (e) {
          console.log('Error en party:', e.message)
          await responder('❌ No pude mencionar a todos.')
        }
        break
      }

      case 'packname':
      case 'stickername': {
        if (!esDueno(m)) {
          await responder('⛔ Solo el dueño del bot puede usar este comando.')
          break
        }
        const entradaPk = cuerpo.slice(cmd.length).trim()
        const cfgPk = leerConfig()
        if (!entradaPk) {
          await responder(
            '🎴 Stickers actuales:\nPaquete: ' + (cfgPk.packname || cfgPk.nombre || 'Shisui Bot') +
            '\nAutor: ' + (cfgPk.packauthor || 'Shisui Bot') +
            '\n\nUso:\n#packname Nombre del paquete | Autor\n#packname reset'
          )
        } else if (entradaPk.toLowerCase() === 'reset') {
          delete cfgPk.packname
          delete cfgPk.packauthor
          guardarConfig(cfgPk)
          await responder('✅ Paquete y autor restaurados.')
        } else {
          const [pk, au] = entradaPk.split('|').map(s => s.trim())
          cfgPk.packname = pk
          if (au) cfgPk.packauthor = au
          guardarConfig(cfgPk)
          await responder('✅ Paquete: ' + (pk || '(por defecto)') + (au ? '\nAutor: ' + au : ''))
        }
        break
      }

      case 'toqr': {
        const ctxT = m.message.extendedTextMessage?.contextInfo
        const citadoT = ctxT?.quotedMessage?.conversation || ctxT?.quotedMessage?.extendedTextMessage?.text || ''
        const textoT = cuerpo.slice(cmd.length).trim() || citadoT
        if (!textoT) {
          await responder('Uso: #toqr <texto o enlace>\nO responde a un mensaje de texto con #toqr')
          break
        }
        if (textoT.length > 500) {
          await responder('⚠️ El texto es muy largo. Máximo 500 caracteres.')
          break
        }
        try {
          const pngQR = await QRCode.toBuffer(textoT, { width: 512, margin: 2 })
          await sock.sendMessage(jid, { image: pngQR, caption: '🔳 Código QR listo' }, { quoted: m })
        } catch (e) {
          console.log('Error en toqr:', e.message)
          await responder('❌ No pude crear el código QR.')
        }
        break
      }

      case 'tomp3': {
        const ctxM = m.message.extendedTextMessage?.contextInfo
        let msgMedia = null
        if (m.message.videoMessage) {
          msgMedia = m
        } else if (ctxM?.quotedMessage?.videoMessage || ctxM?.quotedMessage?.audioMessage) {
          msgMedia = {
            key: { remoteJid: jid, id: ctxM.stanzaId, participant: ctxM.participant },
            message: ctxM.quotedMessage
          }
        }
        if (!msgMedia) {
          await responder('Uso: responde a un video o nota de voz con #tomp3, o envía un video con #tomp3 como pie de foto.')
          break
        }
        try {
          const bufMedia = await downloadMediaMessage(
            msgMedia, 'buffer', {},
            { logger: pino({ level: 'silent' }), reuploadRequest: sock.updateMediaMessage }
          )
          if (bufMedia.length > 30 * 1024 * 1024) {
            await responder('⚠️ El archivo es muy pesado. Máximo 30 MB.')
            break
          }
          await responder('⏳ Convirtiendo a MP3...')
          const mp3 = await aMp3(bufMedia)
          await sock.sendMessage(jid, { audio: mp3, mimetype: 'audio/mpeg' }, { quoted: m })
        } catch (e) {
          console.log('Error en tomp3:', e.message)
          await responder('❌ No pude convertirlo a MP3.')
        }
        break
      }

      case 'tovideo':
      case 'a2v': {
        const ctxA = m.message.extendedTextMessage?.contextInfo
        if (!ctxA?.quotedMessage?.audioMessage) {
          await responder('Uso: responde a un audio o nota de voz con #tovideo')
          break
        }
        try {
          const msgAud = {
            key: { remoteJid: jid, id: ctxA.stanzaId, participant: ctxA.participant },
            message: ctxA.quotedMessage
          }
          const bufAud = await downloadMediaMessage(
            msgAud, 'buffer', {},
            { logger: pino({ level: 'silent' }), reuploadRequest: sock.updateMediaMessage }
          )
          if (bufAud.length > 20 * 1024 * 1024) {
            await responder('⚠️ El audio es muy pesado. Máximo 20 MB.')
            break
          }
          await responder('⏳ Creando el video...')
          const mp4 = await aVideo(bufAud)
          await sock.sendMessage(jid, { video: mp4, mimetype: 'video/mp4' }, { quoted: m })
        } catch (e) {
          console.log('Error en tovideo:', e.message)
          await responder('❌ No pude crear el video.')
        }
        break
      }

      case 'cerrar':
      case 'abrir': {
        if (!jid.endsWith('@g.us')) {
          await responder('Este comando solo funciona en grupos.')
          break
        }
        if (!(await esAdmin(sock, m))) {
          await responder('⛔ Solo los admins del grupo pueden usar este comando.')
          break
        }
        try {
          await sock.groupSettingUpdate(jid, comando === 'cerrar' ? 'announcement' : 'not_announcement')
          await responder(
            comando === 'cerrar'
              ? '🔒 Grupo cerrado: solo los admins pueden escribir.'
              : '🔓 Grupo abierto: todos pueden escribir.'
          )
        } catch (e) {
          await responder('⚠️ Necesito ser admin del grupo para hacer esto.')
        }
        break
      }

      case 'status': {
        if (!(await esAdmin(sock, m))) {
          await responder('⛔ Solo los admins pueden usar este comando.')
          break
        }
        const cfgSt = leerConfig()
        const memSt = process.memoryUsage()
        const aMB = n => (n / 1024 / 1024).toFixed(1) + ' MB'
        const segSt = Math.floor(process.uptime())
        const activoSt = Math.floor(segSt / 3600) + 'h ' + Math.floor((segSt % 3600) / 60) + 'm ' + (segSt % 60) + 's'
        let gruposSt = '?'
        try {
          gruposSt = Object.keys(await sock.groupFetchAllParticipating()).length
        } catch {}
        await responder(
          '📊 Estado del bot\n\n' +
          '🤖 Nombre: ' + (cfgSt.nombre || 'Shisui Bot') + '\n' +
          '📦 Versión: 1.5.0\n' +
          '🟢 Estado: ' + (cfgSt.apagado ? 'desactivado' : 'activo') + '\n' +
          '⏱️ Activo: ' + activoSt + '\n' +
          '🧠 Memoria: ' + aMB(memSt.rss) + '\n' +
          '👥 Grupos: ' + gruposSt + '\n' +
          '🚫 Baneados: ' + (cfgSt.baneados || []).length + '\n' +
          '🟩 Node: ' + process.version
        )
        break
      }

      case 'setpfp': {
        if (!jid.endsWith('@g.us')) {
          await responder('Este comando solo funciona en grupos.')
          break
        }
        if (!(await esAdmin(sock, m))) {
          await responder('⛔ Solo los admins del grupo pueden usar este comando.')
          break
        }
        const ctxG = m.message.extendedTextMessage?.contextInfo
        let msgG = null
        if (m.message.imageMessage) {
          msgG = m
        } else if (ctxG?.quotedMessage?.imageMessage) {
          msgG = {
            key: { remoteJid: jid, id: ctxG.stanzaId, participant: ctxG.participant },
            message: ctxG.quotedMessage
          }
        }
        if (!msgG) {
          await responder('Uso: responde a una foto con #setpfp, o envía una foto con #setpfp como pie de foto.')
          break
        }
        try {
          const bufG = await downloadMediaMessage(
            msgG, 'buffer', {},
            { logger: pino({ level: 'silent' }), reuploadRequest: sock.updateMediaMessage }
          )
          const jpgG = await aFotoCuadrada(bufG)
          await sock.query({
            tag: 'iq',
            attrs: { to: '@s.whatsapp.net', type: 'set', xmlns: 'w:profile:picture', target: jid },
            content: [{ tag: 'picture', attrs: { type: 'image' }, content: jpgG }]
          })
          await responder('✅ Foto del grupo actualizada.')
        } catch (e) {
          console.log('Error en setpfp:', e.message)
          await responder('⚠️ No pude cambiar la foto. Necesito ser admin del grupo.')
        }
        break
      }

      case 'mutear':
      case 'mute':
      case 'desmutear':
      case 'unmute': {
        if (!jid.endsWith('@g.us')) {
          await responder('Este comando solo funciona en grupos.')
          break
        }
        if (!(await esAdmin(sock, m))) {
          await responder('⛔ Solo los admins del grupo pueden usar este comando.')
          break
        }
        const quitarMute = comando === 'desmutear' || comando === 'unmute'
        const ctxMu = m.message.extendedTextMessage?.contextInfo
        let objMu = (ctxMu?.mentionedJid || [])[0] || ctxMu?.participant || args[0] || ''
        objMu = objMu.split('@')[0].split(':')[0].replace(/\D/g, '')
        if (!objMu) {
          await responder('Uso:\n#mutear @persona\n#desmutear @persona\nO responde a un mensaje de la persona con el comando.')
          break
        }
        const cfgMu = leerConfig()
        cfgMu.muteados = cfgMu.muteados || {}
        const listaMu = cfgMu.muteados[jid] || []
        if (quitarMute) {
          if (!listaMu.includes(objMu)) {
            await responder('ℹ️ Esa persona no está muteada.')
            break
          }
          cfgMu.muteados[jid] = listaMu.filter(n => n !== objMu)
          guardarConfig(cfgMu)
          await responder('🔊 Usuario desmuteado: ' + objMu)
          break
        }
        if (DUENOS.includes(objMu) || (cfgMu.duenos || []).includes(objMu)) {
          await responder('⛔ No puedes mutear a un dueño del bot.')
          break
        }
        try {
          const metaMu = await sock.groupMetadata(jid)
          const esAdm = metaMu.participants.some(p =>
            p.admin && [p.id, p.lid, p.phoneNumber].filter(Boolean).some(x => x.split('@')[0].split(':')[0] === objMu)
          )
          if (esAdm) {
            await responder('⛔ No puedes mutear a un admin.')
            break
          }
        } catch {}
        if (listaMu.includes(objMu)) {
          await responder('ℹ️ Esa persona ya está muteada.')
        } else {
          cfgMu.muteados[jid] = listaMu.concat(objMu)
          guardarConfig(cfgMu)
          await responder('🔇 Usuario muteado: ' + objMu + '. El bot borrará sus mensajes en este grupo.')
        }
        break
      }

      case 'del':
      case 'borrar': {
        if (!jid.endsWith('@g.us')) {
          await responder('Este comando solo funciona en grupos.')
          break
        }
        if (!(await esAdmin(sock, m))) {
          await responder('⛔ Solo los admins del grupo pueden usar este comando.')
          break
        }
        const ctxD = m.message.extendedTextMessage?.contextInfo
        let objD = (ctxD?.mentionedJid || [])[0] || ctxD?.participant || args[0] || ''
        objD = objD.split('@')[0].split(':')[0].replace(/\D/g, '')
        if (!objD) {
          await responder('Uso:\n#borrar @persona\n#borrar 5491112345678\nO responde a un mensaje de la persona con #borrar\n\nBorra hasta 40 de sus mensajes recientes.')
          break
        }
        if (DUENOS.includes(objD) || (leerConfig().duenos || []).includes(objD)) {
          await responder('⛔ No puedes borrar mensajes de un dueño del bot.')
          break
        }
        const listaD = (mensajesRecientes[jid] || []).filter(x => x.ids.includes(objD))
        const extrasD = []
        if (ctxD?.stanzaId && ctxD.participant && !listaD.some(x => x.key.id === ctxD.stanzaId)) {
          extrasD.push({
            key: { remoteJid: jid, id: ctxD.stanzaId, participant: ctxD.participant, fromMe: false },
            ids: [objD]
          })
        }
        const aBorrar = extrasD.concat(listaD.slice(-(40 - extrasD.length)))
        if (!aBorrar.length) {
          await responder('ℹ️ No tengo mensajes recientes de esa persona. Solo puedo borrar los que vi desde que me encendí.')
          break
        }
        let borrados = 0
        for (const x of aBorrar) {
          try {
            await sock.sendMessage(jid, { delete: x.key })
            borrados++
          } catch {}
          await new Promise(r => setTimeout(r, 300))
        }
        mensajesRecientes[jid] = (mensajesRecientes[jid] || []).filter(x => !aBorrar.includes(x))
        await responder('🗑️ Borré ' + borrados + ' mensaje' + (borrados === 1 ? '' : 's') + ' de ' + objD + '.')
        break
      }

      case 'botlist': {
        if (!jid.endsWith('@g.us')) {
          await responder('Este comando solo funciona en grupos.')
          break
        }
        if (!(await esAdmin(sock, m))) {
          await responder('⛔ Solo los admins del grupo pueden usar este comando.')
          break
        }
        const subB = (args[0] || '').toLowerCase()
        const cfgBl = leerConfig()
        cfgBl.botsGrupo = cfgBl.botsGrupo || {}
        const listaBl = cfgBl.botsGrupo[jid] || []
        const digB = j => j.split('@')[0].split(':')[0]
        if (subB === 'agregar' || subB === 'quitar') {
          const ctxBl = m.message.extendedTextMessage?.contextInfo
          let objBl = (ctxBl?.mentionedJid || [])[0] || ctxBl?.participant || ''
          if (!objBl && args[1]) {
            const dB = args[1].replace(/\D/g, '')
            if (dB) objBl = dB + '@s.whatsapp.net'
          }
          if (!objBl) {
            await responder('Uso:\n#botlist agregar @bot\n#botlist quitar @bot\nO responde a un mensaje del bot con el comando.')
            break
          }
          const yaEsta = listaBl.some(j => digB(j) === digB(objBl))
          if (subB === 'agregar') {
            if (yaEsta) {
              await responder('ℹ️ Ese bot ya está en la lista.')
              break
            }
            cfgBl.botsGrupo[jid] = listaBl.concat(objBl)
            guardarConfig(cfgBl)
            await responder('✅ Bot agregado a la lista de este grupo.')
          } else {
            if (!yaEsta) {
              await responder('ℹ️ Ese bot no está en la lista.')
              break
            }
            cfgBl.botsGrupo[jid] = listaBl.filter(j => digB(j) !== digB(objBl))
            guardarConfig(cfgBl)
            await responder('✅ Bot quitado de la lista.')
          }
          break
        }
        if (!listaBl.length) {
          await responder('🤖 No hay bots en la lista de este grupo.\n\nAgrega uno con:\n#botlist agregar @bot')
          break
        }
        await sock.sendMessage(
          jid,
          {
            text: '🤖 Bots en este grupo (' + listaBl.length + '):\n\n' + listaBl.map((j, i) => (i + 1) + '. @' + digB(j)).join('\n'),
            mentions: listaBl
          },
          { quoted: m }
        )
        break
      }

      case 'bot': {
        if (!(await esAdmin(sock, m))) {
          await responder('⛔ Solo los admins pueden usar este comando.')
          break
        }
        const cfgBt = leerConfig()
        const segBt = Math.floor(process.uptime())
        const activoBt = Math.floor(segBt / 3600) + 'h ' + Math.floor((segBt % 3600) / 60) + 'm ' + (segBt % 60) + 's'
        await responder(
          '🤖 ' + (cfgBt.nombre || 'Shisui Bot') + ' está ' +
          (cfgBt.apagado ? 'desactivado ❌ (solo responde a los dueños)' : 'activo ✅') +
          (jid.endsWith('@g.us') ? ' en este grupo.' : '.') +
          '\n⏱️ Activo: ' + activoBt
        )
        break
      }

      case 'antilink': {
        if (!jid.endsWith('@g.us')) {
          await responder('Este comando solo funciona en grupos.')
          break
        }
        if (!(await esAdmin(sock, m))) {
          await responder('⛔ Solo los admins del grupo pueden usar este comando.')
          break
        }
        const opAl = (args[0] || '').toLowerCase()
        const cfgAl = leerConfig()
        cfgAl.grupos = cfgAl.grupos || {}
        const gAl = cfgAl.grupos[jid] = cfgAl.grupos[jid] || {}
        if (opAl !== 'on' && opAl !== 'off') {
          await responder(
            '🔗 Antilink: ' + (gAl.antilink ? '✅ activado' : '❌ desactivado') +
            '\n\nUso:\n#antilink on\n#antilink off\n\nBorra los links de grupos de WhatsApp y saca a quien los envíe, si no es admin. El bot debe ser admin.'
          )
          break
        }
        gAl.antilink = opAl === 'on'
        guardarConfig(cfgAl)
        await responder(gAl.antilink ? '✅ Antilink activado en este grupo.' : '✅ Antilink desactivado en este grupo.')
        break
      }

      case 'promote':
      case 'demote': {
        if (!jid.endsWith('@g.us')) {
          await responder('Este comando solo funciona en grupos.')
          break
        }
        if (!(await esAdmin(sock, m))) {
          await responder('⛔ Solo los admins del grupo pueden usar este comando.')
          break
        }
        const ctxPr = m.message.extendedTextMessage?.contextInfo
        let objPr = (ctxPr?.mentionedJid || [])[0] || ctxPr?.participant || ''
        if (!objPr && args[0]) {
          const dPr = args[0].replace(/\D/g, '')
          if (dPr) objPr = dPr + '@s.whatsapp.net'
        }
        if (!objPr) {
          await responder('Uso:\n#' + comando + ' @persona\n#' + comando + ' 5491112345678\nO responde a un mensaje de la persona con #' + comando)
          break
        }
        const digPr = objPr.split('@')[0].split(':')[0]
        if (comando === 'demote' && (DUENOS.includes(digPr) || (leerConfig().duenos || []).includes(digPr))) {
          await responder('⛔ No puedes quitar el admin a un dueño del bot.')
          break
        }
        try {
          await sock.groupParticipantsUpdate(jid, [objPr], comando)
          await sock.sendMessage(
            jid,
            {
              text: comando === 'promote'
                ? '👑 @' + digPr + ' ahora es admin del grupo.'
                : '⬇️ @' + digPr + ' ya no es admin del grupo.',
              mentions: [objPr]
            },
            { quoted: m }
          )
        } catch (e) {
          console.log('Error en promote/demote:', e.message)
          await responder('⚠️ No pude hacerlo. Necesito ser admin del grupo.')
        }
        break
      }

      case 'cambiarenlace':
      case 'cambiarlink': {
        if (!jid.endsWith('@g.us')) {
          await responder('Este comando solo funciona en grupos.')
          break
        }
        if (!(await esAdmin(sock, m))) {
          await responder('⛔ Solo los admins del grupo pueden usar este comando.')
          break
        }
        try {
          const nuevoCodigo = await sock.groupRevokeInvite(jid)
          await responder('🔗 Enlace restablecido. El anterior ya no sirve.\n\nNuevo enlace:\nhttps://chat.whatsapp.com/' + nuevoCodigo)
        } catch (e) {
          console.log('Error en cambiarenlace:', e.message)
          await responder('⚠️ Necesito ser admin del grupo para cambiar el enlace.')
        }
        break
      }

      case 'tag': {
        if (!jid.endsWith('@g.us')) {
          await responder('Este comando solo funciona en grupos.')
          break
        }
        if (!(await esAdmin(sock, m))) {
          await responder('⛔ Solo los admins del grupo pueden usar este comando.')
          break
        }
        const ctxTg = m.message.extendedTextMessage?.contextInfo
        const citadoTg = ctxTg?.quotedMessage?.conversation || ctxTg?.quotedMessage?.extendedTextMessage?.text || ''
        const textoTg = cuerpo.slice(cmd.length).trim() || citadoTg
        if (!textoTg) {
          await responder('Uso: #tag <mensaje>\nO responde a un mensaje de texto con #tag.\n\nNotifica a todos sin mostrar la lista de nombres.')
          break
        }
        try {
          const metaTg = await sock.groupMetadata(jid)
          await sock.sendMessage(jid, { text: textoTg, mentions: metaTg.participants.map(p => p.id) })
        } catch (e) {
          console.log('Error en tag:', e.message)
          await responder('❌ No pude enviar el mensaje.')
        }
        break
      }

      case 'topactive':
      case 'topactivos': {
        if (!jid.endsWith('@g.us')) {
          await responder('Este comando solo funciona en grupos.')
          break
        }
        if (!(await esAdmin(sock, m))) {
          await responder('⛔ Solo los admins del grupo pueden usar este comando.')
          break
        }
        const datosAct = actividad[jid] || {}
        const topAct = Object.values(datosAct).sort((x, y) => y.n - x.n).slice(0, 10)
        if (!topAct.length) {
          await responder('📊 Todavía no tengo datos de actividad en este grupo. Empiezo a contar desde que me enciendo.')
          break
        }
        const medallas = ['🥇', '🥈', '🥉']
        const lineasAct = topAct.map((u, i) =>
          (medallas[i] || (i + 1) + '.') + ' @' + u.jid.split('@')[0].split(':')[0] +
          ' — ' + u.n + ' mensaje' + (u.n === 1 ? '' : 's')
        )
        await sock.sendMessage(
          jid,
          { text: '🏆 Miembros más activos\n\n' + lineasAct.join('\n'), mentions: topAct.map(u => u.jid) },
          { quoted: m }
        )
        break
      }

      case 'modoadmin': {
        if (!jid.endsWith('@g.us')) {
          await responder('Este comando solo funciona en grupos.')
          break
        }
        if (!(await esAdmin(sock, m))) {
          await responder('⛔ Solo los admins del grupo pueden usar este comando.')
          break
        }
        const opMa = (args[0] || '').toLowerCase()
        const cfgMa = leerConfig()
        cfgMa.grupos = cfgMa.grupos || {}
        const gMa = cfgMa.grupos[jid] = cfgMa.grupos[jid] || {}
        if (opMa !== 'on' && opMa !== 'off') {
          await responder(
            '🛡️ Modo admin: ' + (gMa.modoadmin ? '✅ activado' : '❌ desactivado') +
            '\n\nUso:\n#modoadmin on\n#modoadmin off\n\nActivado, el bot solo responde a los admins de este grupo.'
          )
          break
        }
        gMa.modoadmin = opMa === 'on'
        guardarConfig(cfgMa)
        await responder(
          gMa.modoadmin
            ? '🛡️ Modo admin activado: el bot solo responderá a los admins de este grupo.'
            : '✅ Modo admin desactivado: el bot responde a todos.'
        )
        break
      }

      case 'ban':
      case 'kick': {
        if (!jid.endsWith('@g.us')) {
          await responder('Este comando solo funciona en grupos.')
          break
        }
        if (!(await esAdmin(sock, m))) {
          await responder('⛔ Solo los admins del grupo pueden usar este comando.')
          break
        }
        const ctxKi = m.message.extendedTextMessage?.contextInfo
        let objKi = (ctxKi?.mentionedJid || [])[0] || ctxKi?.participant || ''
        if (!objKi && args[0]) {
          const dKi = args[0].replace(/\D/g, '')
          if (dKi) objKi = dKi + '@s.whatsapp.net'
        }
        if (!objKi) {
          await responder('Uso:\n#' + comando + ' @persona\n#' + comando + ' 5491112345678\nO responde a un mensaje de la persona con #' + comando)
          break
        }
        const digKi = objKi.split('@')[0].split(':')[0]
        if (DUENOS.includes(digKi) || (leerConfig().duenos || []).includes(digKi)) {
          await responder('⛔ No puedes sacar a un dueño del bot.')
          break
        }
        const yoKi = [sock.user?.id, sock.user?.lid].filter(Boolean).map(j => j.split('@')[0].split(':')[0])
        if (yoKi.includes(digKi)) {
          await responder('😅 No puedo sacarme a mí mismo.')
          break
        }
        try {
          const metaKi = await sock.groupMetadata(jid)
          const esAdminObjetivo = metaKi.participants.some(p =>
            p.admin && [p.id, p.lid, p.phoneNumber].filter(Boolean).some(x => x.split('@')[0].split(':')[0] === digKi)
          )
          if (esAdminObjetivo) {
            await responder('⛔ No puedes sacar a un admin. Primero quítale el admin con #demote.')
            break
          }
          await sock.groupParticipantsUpdate(jid, [objKi], 'remove')
          await sock.sendMessage(
            jid,
            { text: '👢 @' + digKi + ' fue eliminado del grupo.', mentions: [objKi] },
            { quoted: m }
          )
        } catch (e) {
          console.log('Error en kick:', e.message)
          await responder('⚠️ No pude sacarlo. Necesito ser admin del grupo.')
        }
        break
      }

      case 'advertencia':
      case 'adv': {
        if (!jid.endsWith('@g.us')) {
          await responder('Este comando solo funciona en grupos.')
          break
        }
        if (!(await esAdmin(sock, m))) {
          await responder('⛔ Solo los admins del grupo pueden usar este comando.')
          break
        }
        const quitarAd = (args[0] || '').toLowerCase() === 'quitar'
        const restoAd = quitarAd ? args.slice(1) : args
        const ctxAd = m.message.extendedTextMessage?.contextInfo
        let objAd = (ctxAd?.mentionedJid || [])[0] || ctxAd?.participant || ''
        if (!objAd) {
          const posible = restoAd.find(a => a.replace(/\D/g, '').length >= 8)
          if (posible) objAd = posible.replace(/\D/g, '') + '@s.whatsapp.net'
        }
        if (!objAd) {
          await responder('Uso:\n#adv @persona motivo\n#adv quitar @persona\nO responde a un mensaje de la persona con #adv\n\nA las 3 advertencias la saco del grupo.')
          break
        }
        const digAd = objAd.split('@')[0].split(':')[0]
        if (DUENOS.includes(digAd) || (leerConfig().duenos || []).includes(digAd)) {
          await responder('⛔ No puedes advertir a un dueño del bot.')
          break
        }
        const yoAd = [sock.user?.id, sock.user?.lid].filter(Boolean).map(j => j.split('@')[0].split(':')[0])
        if (yoAd.includes(digAd)) {
          await responder('😅 No puedo advertirme a mí mismo.')
          break
        }
        try {
          const metaAd = await sock.groupMetadata(jid)
          const esAdminAd = metaAd.participants.some(p =>
            p.admin && [p.id, p.lid, p.phoneNumber].filter(Boolean).some(x => x.split('@')[0].split(':')[0] === digAd)
          )
          if (esAdminAd) {
            await responder('⛔ No puedes advertir a un admin.')
            break
          }
        } catch {}
        const LIMITE_ADV = 3
        const cfgAd = leerConfig()
        cfgAd.advertencias = cfgAd.advertencias || {}
        const gAd = cfgAd.advertencias[jid] = cfgAd.advertencias[jid] || {}
        if (quitarAd) {
          if (!gAd[digAd]) {
            await responder('ℹ️ Esa persona no tiene advertencias.')
            break
          }
          gAd[digAd]--
          if (gAd[digAd] <= 0) delete gAd[digAd]
          guardarConfig(cfgAd)
          await sock.sendMessage(
            jid,
            { text: '✅ Se quitó una advertencia a @' + digAd + '. Ahora tiene ' + (gAd[digAd] || 0) + '/' + LIMITE_ADV + '.', mentions: [objAd] },
            { quoted: m }
          )
          break
        }
        const motivo = restoAd.filter(a => !a.startsWith('@') && !/^\d{8,}$/.test(a)).join(' ')
        gAd[digAd] = (gAd[digAd] || 0) + 1
        if (gAd[digAd] >= LIMITE_ADV) {
          delete gAd[digAd]
          guardarConfig(cfgAd)
          try {
            await sock.groupParticipantsUpdate(jid, [objAd], 'remove')
            await sock.sendMessage(
              jid,
              { text: '🚫 @' + digAd + ' llegó a ' + LIMITE_ADV + ' advertencias y fue eliminado del grupo.', mentions: [objAd] },
              { quoted: m }
            )
          } catch (e) {
            await responder('⚠️ Llegó al límite de advertencias, pero no pude sacarlo. Necesito ser admin del grupo.')
          }
        } else {
          guardarConfig(cfgAd)
          await sock.sendMessage(
            jid,
            {
              text: '⚠️ Advertencia para @' + digAd + ' (' + gAd[digAd] + '/' + LIMITE_ADV + ')' + (motivo ? '\nMotivo: ' + motivo : ''),
              mentions: [objAd]
            },
            { quoted: m }
          )
        }
        break
      }

      case 'aviso': {
        if (!jid.endsWith('@g.us')) {
          await responder('Este comando solo funciona en grupos.')
          break
        }
        if (!(await esAdmin(sock, m))) {
          await responder('⛔ Solo los admins del grupo pueden usar este comando.')
          break
        }
        const ctxAv = m.message.extendedTextMessage?.contextInfo
        const citadoAv = ctxAv?.quotedMessage?.conversation || ctxAv?.quotedMessage?.extendedTextMessage?.text || ''
        const textoAv = cuerpo.slice(cmd.length).trim() || citadoAv
        if (!textoAv) {
          await responder('Uso: #aviso <mensaje>\nO responde a un mensaje de texto con #aviso.\n\nPublica un aviso 📢 y notifica a todos.')
          break
        }
        try {
          const metaAv = await sock.groupMetadata(jid)
          const idsAv = metaAv.participants.map(p => p.id)
          const autorAv = m.key.participant || m.key.participantAlt || null
          let textoFinal = '📢 *AVISO* 📢\n\n' + textoAv
          if (autorAv) {
            textoFinal += '\n\n✍️ Publicado por @' + autorAv.split('@')[0].split(':')[0]
            if (!idsAv.includes(autorAv)) idsAv.push(autorAv)
          }
          await sock.sendMessage(jid, { text: textoFinal, mentions: idsAv })
        } catch (e) {
          console.log('Error en aviso:', e.message)
          await responder('❌ No pude publicar el aviso.')
        }
        break
      }

      case 'aprobartodo': {
        if (!jid.endsWith('@g.us')) {
          await responder('Este comando solo funciona en grupos.')
          break
        }
        if (!(await esAdmin(sock, m))) {
          await responder('⛔ Solo los admins del grupo pueden usar este comando.')
          break
        }
        try {
          const pendientes = await sock.groupRequestParticipantsList(jid)
          if (!pendientes || !pendientes.length) {
            await responder('ℹ️ No hay solicitudes pendientes.')
            break
          }
          const jidsPend = pendientes.map(p => p.jid || p.phone_number || p.id).filter(Boolean)
          let aprobados = 0
          for (let i = 0; i < jidsPend.length; i += 50) {
            const lote = jidsPend.slice(i, i + 50)
            const res = await sock.groupRequestParticipantsUpdate(jid, lote, 'approve')
            aprobados += Array.isArray(res) && res.length
              ? res.filter(r => !r.status || String(r.status) === '200').length
              : lote.length
          }
          await responder('✅ Aprobé ' + aprobados + ' solicitud' + (aprobados === 1 ? '' : 'es') + ' de ingreso.')
        } catch (e) {
          console.log('Error en aprobartodo:', e.message)
          await responder('⚠️ No pude aprobar las solicitudes. Necesito ser admin del grupo y que el grupo tenga activada la aprobación de nuevos participantes.')
        }
        break
      }

      case 'verdad':
      case 'reto':
      case 'yonunca':
      case 'piropo': {
        if (!nsfwActivo(jid)) {
          await responder('🔞 El contenido +18 está desactivado en este chat. Un dueño puede activarlo con #setnsfw on')
          break
        }
        const bancoPlus = {
          verdad: [
            '¿Cuál fue tu cita más incómoda?',
            '¿Cuál es tu mayor secreto que nunca le contaste a nadie de este grupo?',
            '¿Alguna vez enviaste un mensaje a la persona equivocada? ¿Qué decía?',
            '¿Cuál es la cosa más loca que hiciste por amor?',
            '¿Te ha gustado alguien que no debías?',
            '¿Cuál fue tu peor ruptura y qué aprendiste?',
            '¿Qué es lo más atrevido que has escrito en un chat?',
            '¿Qué es lo primero que notas de una persona que te gusta?',
            '¿Alguna vez fingiste estar ocupado para no salir con alguien?',
            '¿Cuál fue tu primer amor y qué pasó?',
            '¿Has tenido un amor platónico? ¿Se lo dijiste?',
            '¿Cuál es tu mayor miedo en una relación?'
          ],
          reto: [
            'Manda un audio cantando el coro de tu canción favorita.',
            'Cambia tu foto de perfil por una foto graciosa durante una hora.',
            'Escribe un piropo cursi al último contacto con el que hablaste.',
            'Manda un sticker que describa tu estado de ánimo, sin decir nada más.',
            'Cuenta tu anécdota más vergonzosa en una nota de voz.',
            'Imita a un animal en una nota de voz.',
            'Escribe un poema de 4 líneas para la persona que elija el grupo.',
            'Pasa los próximos 10 mensajes sin usar ningún emoji.',
            'Manda un audio diciendo un trabalenguas sin equivocarte.',
            'Cuenta un chiste malo y espera a que el grupo califique.',
            'Escribe tu mensaje de amor más dramático, estilo telenovela.',
            'Habla como robot durante tus próximos 5 mensajes.'
          ],
          yonunca: [
            'Yo nunca me he quedado dormido en una cita.',
            'Yo nunca he stalkeado a mi ex en redes sociales.',
            'Yo nunca he mandado un mensaje de madrugada y me he arrepentido.',
            'Yo nunca he fingido que me gustaba un regalo.',
            'Yo nunca he borrado un chat para que nadie lo vea.',
            'Yo nunca he escrito buenos días a alguien solo para tener tema de conversación.',
            'Yo nunca he usado una frase para ligar que salió mal.',
            'Yo nunca he llorado viendo una película romántica.',
            'Yo nunca me he enamorado de alguien por chat.',
            'Yo nunca he revisado el celular de mi pareja.',
            'Yo nunca he dejado en visto a alguien que me gustaba.',
            'Yo nunca he cancelado una cita a último momento.'
          ],
          piropo: [
            'Si fueras un celular, serías de última generación.',
            'Me encantaría ser tu WiFi para estar siempre conectado contigo.',
            '¿Estás hecho de cobre y teluro? Porque estás muy Cu-Te.',
            'Eres el motivo por el que mi batería nunca se descarga de sonreír.',
            'Si la belleza fuera un delito, tendrías cadena perpetua.',
            '¿Tienes un mapa? Porque me perdí en tus ojos.',
            'Con tu sonrisa no necesito café para despertar.',
            'Si fueras una canción, estarías en repetir.',
            'Eres mi notificación favorita.',
            'Quisiera ser tu cargador: para estar siempre a tu lado cuando más me necesitas.'
          ]
        }
        const titulosPlus = {
          verdad: '🔞 *VERDAD*',
          reto: '🔞 *RETO*',
          yonunca: '🔞 *YO NUNCA*',
          piropo: '🔞 *PIROPO*'
        }
        const frasesPlus = bancoPlus[comando]
        const frasePlus = frasesPlus[Math.floor(Math.random() * frasesPlus.length)]
        const quienPlus = m.key.participant || m.key.remoteJid
        await sock.sendMessage(
          jid,
          {
            text: titulosPlus[comando] + '\n\n@' + quienPlus.split('@')[0].split(':')[0] + '\n' + frasePlus,
            mentions: [quienPlus]
          },
          { quoted: m }
        )
        break
      }

      case 'code': {
        const solicitante = m.key.participant || m.key.remoteJid
        const ahoraCode = Date.now()
        if (codeReciente[solicitante] && ahoraCode - codeReciente[solicitante] < 120000) {
          await responder('⏳ Espera 2 minutos antes de pedir otro código.')
          break
        }
        const idsTel = [m.key.participantAlt, m.key.remoteJidAlt, m.key.participant, m.key.remoteJid].filter(Boolean)
        const jidTelCode = idsTel.find(j => j.endsWith('@s.whatsapp.net'))
        const telPropio = jidTelCode ? jidTelCode.split('@')[0].split(':')[0] : null
        const telArg = (args[0] || '').replace(/\D/g, '')
        if (telPropio && telArg && telArg !== telPropio && !esDueno(m)) {
          await responder('⛔ Solo puedes vincular tu propio número.')
          break
        }
        const telCode = telArg || telPropio
        if (!telCode) {
          await responder('Escribe tu número con código de país, sin +. Ejemplo:\n#code 5491112345678')
          break
        }
        if (telCode.length < 10 || telCode.length > 15) {
          await responder('⚠️ Ese número no parece válido. Escríbelo con código de país y sin +.')
          break
        }
        const subsAct = leerConfig().subbots || []
        if (subsAct.includes(telCode)) {
          await responder('ℹ️ Ese número ya está vinculado o tiene un código pendiente. Para desvincularlo escribe #delcode ' + telCode)
          break
        }
        if (subsAct.length >= MAX_SUBBOTS) {
          await responder('⚠️ Ya no hay cupos para más sub bots por ahora.')
          break
        }
        codeReciente[solicitante] = ahoraCode
        const destinoCode = jid
        if (jid.endsWith('@g.us')) {
          await responder('⏳ Generando tu código...')
        } else {
          await responder('⏳ Generando tu código...')
        }
        iniciarSub(telCode, async codigo => {
          try {
            if (!codigo) {
              await sock.sendMessage(destinoCode, { text: '❌ No pude generar el código. Intenta de nuevo más tarde.' })
              return
            }
            const bonito = (codigo.match(/.{1,4}/g) || [codigo]).join('-')
            await sock.sendMessage(destinoCode, {
              mentions: [solicitante],
              text:
                (jid.endsWith('@g.us') ? '@' + solicitante.split('@')[0].split(':')[0] + '\n\n' : '') + '🔑 *Tu código de vinculación:*\n\n' + bonito +
                '\n\n1. Abre WhatsApp en ese número.\n2. Ve a Dispositivos vinculados → Vincular un dispositivo → Vincular con el número de teléfono.\n3. Pega el código que te mando en el siguiente mensaje.\n\n⏳ El código dura pocos minutos.\n\nℹ️ Al vincular, este bot podrá leer y responder mensajes de tu cuenta para funcionar. Puedes desvincularlo cuando quieras desde Dispositivos vinculados, o con #delcode.'
            })
            const marca = String.fromCharCode(96).repeat(3)
            await sock.sendMessage(destinoCode, { text: marca + codigo.replace(/-/g, '') + marca + '\n☝️ Mantén presionado el código y toca *Copiar*.' }, { quoted: m })
          } catch (e) {
            console.log('Error al enviar el código:', e.message)
          }
        })
        break
      }

      case 'delcode': {
        const idsTel2 = [m.key.participantAlt, m.key.remoteJidAlt, m.key.participant, m.key.remoteJid].filter(Boolean)
        const jidTel2 = idsTel2.find(j => j.endsWith('@s.whatsapp.net'))
        const telPropio2 = jidTel2 ? jidTel2.split('@')[0].split(':')[0] : null
        const telArg2 = (args[0] || '').replace(/\D/g, '')
        const objetivoDel = telArg2 || telPropio2
        if (!objetivoDel) {
          await responder('Uso: #delcode (quita tu sub bot) o #delcode 5491112345678 (solo dueños).')
          break
        }
        if (objetivoDel !== telPropio2 && !esDueno(m)) {
          await responder('⛔ Solo puedes quitar tu propio sub bot.')
          break
        }
        if (!(leerConfig().subbots || []).includes(objetivoDel)) {
          await responder('ℹ️ Ese número no es un sub bot.')
          break
        }
        await quitarSubBot(objetivoDel)
        await responder('✅ Sub bot desvinculado.')
        break
      }

      case 'subs': {
        if (!esDueno(m)) {
          await responder('⛔ Solo el dueño del bot puede usar este comando.')
          break
        }
        const listaSubs = leerConfig().subbots || []
        await responder(
          listaSubs.length
            ? '🤖 Sub bots (' + listaSubs.length + '/' + MAX_SUBBOTS + '):\n' +
              listaSubs.map(n => '• ' + n + (subEstado[n]?.vinculado ? ' ✅' : ' ⏳')).join('\n')
            : 'No hay sub bots vinculados.'
        )
        break
      }

      case 'fix':
      case 'actualizar': {
        if (!esDueno(m)) {
          await responder('⛔ Solo el dueño del bot puede usar este comando.')
          break
        }
        if (fixEnCurso) {
          await responder('⏳ Ya hay una actualización en curso.')
          break
        }
        fixEnCurso = true
        try {
          const cfgFx = leerConfig()
          const puedeReiniciar = !!(process.env.BOT_LOOP || cfgFx.reinicioAuto)
          const terminar = async (lineas, reiniciar) => {
            if (reiniciar && puedeReiniciar) {
              lineas.push('', '♻️ Reiniciando el bot...')
              await responder(lineas.join('\n'))
              setTimeout(() => process.exit(42), 2000)
            } else if (reiniciar) {
              lineas.push('', 'ℹ️ Reinicia el bot para aplicar los cambios.')
              await responder(lineas.join('\n'))
            } else {
              await responder(lineas.join('\n'))
            }
          }
          if ((args[0] || '').toLowerCase() === 'revertir') {
            const rv = revertirActualizacion()
            if (!rv.ok) {
              await responder('❌ ' + rv.error)
              break
            }
            await terminar(['↩️ Volví a la versión anterior de: ' + rv.restaurados.join(', ')], true)
            break
          }
          await responder('🔧 Actualizando todo, esto puede tardar unos minutos...')
          try { limpieza.limpiar() } catch {}
          const lineas = ['✅ Actualización terminada', '']
          let reiniciar = false
          if (cfgFx.updateRepo) {
            const up = await actualizarDesdeGithub(cfgFx)
            if (!up.ok) {
              lineas.push('⚠️ Código: ' + up.error)
            } else if (!up.cambiados.length) {
              lineas.push('✅ Código: ya estaba al día')
            } else {
              reiniciar = true
              lineas.push('✅ Código actualizado: ' + up.cambiados.join(', '))
              if (up.npm) lineas.push((up.npm.ok ? '✅' : '⚠️') + ' Librerías nuevas instaladas')
            }
          } else {
            lineas.push('ℹ️ Código: GitHub sin configurar (usa #setupdate)')
          }
          const esTermux = (process.env.PREFIX || '').includes('com.termux')
          if (esTermux) {
            const v1 = (await correr('yt-dlp', ['--version'])).salida.trim()
            const pk = await correr('pkg', ['install', '-y', 'yt-dlp', 'ffmpeg'])
            const v2 = (await correr('yt-dlp', ['--version'])).salida.trim()
            lineas.push((pk.ok ? '✅' : '⚠️') + ' Herramientas (yt-dlp, ffmpeg): ' + (v1 === v2 ? 'ya estaban al día (' + v2 + ')' : v1 + ' → ' + v2))
          } else {
            if (cfgFx.herramientas) {
              const yu = await correr('yt-dlp', ['-U'])
              lineas.push((yu.ok ? '✅' : '⚠️') + ' yt-dlp: ' + (/up to date|up-to-date/i.test(yu.salida) ? 'ya estaba al día' : (yu.ok ? 'actualizado' : 'no pude actualizarlo')))
            } else {
              lineas.push('ℹ️ Herramientas: desactivadas en este servidor')
            }
          }
          for (const f of ['package.json', 'package-lock.json']) {
            try { fs.copyFileSync(f, f.replace('.json', '.backup.json')) } catch {}
          }
          const nm = await correr('npm', ['update', '--no-audit', '--no-fund'], { cwd: process.cwd() })
          const nmCambio = /\b(added|changed|removed) \d+ packages?/.test(nm.salida)
          lineas.push((nm.ok ? '✅' : '⚠️') + ' Librerías del bot (npm)' + (nm.ok ? (nmCambio ? ' actualizadas' : ': ya estaban al día') : ': hubo un error'))
          if (nm.ok && nmCambio) reiniciar = true
          let borrados = 0
          try {
            const tmp = require('os').tmpdir()
            for (const f of fs.readdirSync(tmp)) {
              if (/^(dl_|stk_|cita_|mp3_|vid_|foto_|voz_)/.test(f)) {
                try {
                  fs.unlinkSync(require('path').join(tmp, f))
                  borrados++
                } catch {}
              }
            }
          } catch {}
          lineas.push('🧹 Archivos temporales borrados: ' + borrados)
          try {
            const sp = fs.statfsSync('.')
            lineas.push('💾 Espacio libre: ' + Math.round(sp.bavail * sp.bsize / 1048576) + ' MB')
          } catch {}
          await terminar(lineas, reiniciar)
        } catch (e) {
          console.log('Error en fix:', e.message)
          await responder('❌ Error al actualizar: ' + String(e.message || '').slice(0, 120))
        } finally {
          fixEnCurso = false
        }
        break
      }

      case 'setupdate': {
        if (!esDueno(m)) {
          await responder('⛔ Solo el dueño del bot puede usar este comando.')
          break
        }
        const cfgUp = leerConfig()
        const a0 = (args[0] || '').toLowerCase()
        const ocultarT = t => (t ? t.slice(0, 4) + '••••' : 'sin token')
        if (!a0) {
          await responder(
            '🔄 Actualización desde GitHub\n\n' +
            'Repositorio: ' + (cfgUp.updateRepo ? cfgUp.updateRepo + '@' + (cfgUp.updateRama || 'main') : 'sin configurar') + '\n' +
            'Token: ' + ocultarT(cfgUp.updateToken) + '\n' +
            'Reinicio automático: ' + (cfgUp.reinicioAuto ? 'sí' : 'no') + '\n\n' +
            'Uso:\n#setupdate usuario/repositorio\n#setupdate usuario/repositorio@rama\n#setupdate token <token>\n#setupdate reinicio on|off\n#setupdate reset'
          )
          break
        }
        if (a0 === 'reset') {
          delete cfgUp.updateRepo
          delete cfgUp.updateRama
          delete cfgUp.updateToken
          delete cfgUp.reinicioAuto
          guardarConfig(cfgUp)
          await responder('✅ Configuración de GitHub borrada.')
          break
        }
        if (a0 === 'token') {
          const tk = (args[1] || '').trim()
          if (!tk) {
            await responder('Uso: #setupdate token <token>\nPara borrarlo: #setupdate token reset')
            break
          }
          if (tk.toLowerCase() === 'reset') {
            delete cfgUp.updateToken
            guardarConfig(cfgUp)
            await responder('✅ Token borrado.')
          } else {
            cfgUp.updateToken = tk
            guardarConfig(cfgUp)
            await responder('✅ Token guardado: ' + ocultarT(tk) + '\n⚠️ Borra tu mensaje del chat.')
          }
          break
        }
        if (a0 === 'herramientas') {
          const v = (args[1] || '').toLowerCase()
          if (v !== 'on' && v !== 'off') {
            await responder('Uso: #setupdate herramientas on|off\nActivado, el bot descarga yt-dlp y ffmpeg (unos 120 MB). Solo para servidores con espacio.')
            break
          }
          cfgUp.herramientas = v === 'on'
          guardarConfig(cfgUp)
          await responder('✅ Herramientas: ' + (v === 'on' ? 'activadas (se descargan al reiniciar)' : 'desactivadas'))
          break
        }
        if (a0 === 'reinicio') {
          const v = (args[1] || '').toLowerCase()
          if (v !== 'on' && v !== 'off') {
            await responder('Uso: #setupdate reinicio on|off')
            break
          }
          cfgUp.reinicioAuto = v === 'on'
          guardarConfig(cfgUp)
          await responder('✅ Reinicio automático: ' + (v === 'on' ? 'activado' : 'desactivado'))
          break
        }
        const mt = String(args[0]).match(/^([\w.-]+\/[\w.-]+)(?:@([\w./-]+))?$/)
        if (!mt) {
          await responder('⚠️ Escribe el repositorio así: usuario/repositorio')
          break
        }
        cfgUp.updateRepo = mt[1]
        cfgUp.updateRama = mt[2] || 'main'
        guardarConfig(cfgUp)
        await responder('✅ Repositorio guardado: ' + mt[1] + '@' + (mt[2] || 'main') + '\nAhora escribe #fix para bajar el código.')
        break
      }

      case 'owners': {
        if (!esDueno(m)) {
          await responder('⛔ Solo los dueños del bot pueden usar este comando.')
          break
        }
        const principales = DUENOS.filter(n => n.length <= 13).map(n => '+' + n)
        const extrasOw = leerConfig().duenos || []
        await responder(
          '👑 *Dueños del bot*\n\n' +
          'Principal: ' + principales.join(', ') + '\n' +
          'Agregados (' + extrasOw.length + '):\n' +
          (extrasOw.length ? extrasOw.map(n => '• +' + n).join('\n') : '• ninguno')
        )
        break
      }


      case 'limpiar':
      case 'espacio': {
        if (!esDueno(m)) {
          await responder('⛔ Solo el dueño del bot puede usar este comando.')
          break
        }
        if (comando === 'espacio') {
          const libre = limpieza.libreMB()
          const carpetas = limpieza.resumenCarpetas().slice(0, 6)
          await responder(
            '💾 *Espacio del servidor*\n\nLibre: ' + (libre === null ? 'no disponible' : libre + ' MB') +
            (carpetas.length ? '\n\nCarpetas del bot:\n' + carpetas.map(x => '• ' + x[0] + ': ' + Math.round(x[1] / 1048576) + ' MB').join('\n') : '')
          )
          break
        }
        const r = limpieza.limpiar()
        await responder(
          '🧹 *Limpieza hecha*\n\nLiberé: ' + r.liberadoMB + ' MB' +
          (r.antes !== null ? '\n💾 Espacio libre: ' + r.antes + ' MB → ' + r.despues + ' MB' : '') +
          '\n\nNo se tocó el código, config.json, las sesiones ni gacha.json.'
        )
        if ((args[0] || '').toLowerCase() === 'reiniciar') {
          if (process.env.BOT_LOOP || leerConfig().reinicioAuto) {
            await responder('♻️ Reiniciando el bot...')
            setTimeout(() => process.exit(42), 2000)
          } else {
            await responder('ℹ️ Reinicia el bot desde el panel para terminar.')
          }
        }
        break
      }

      case 'navidad':
      case 'nochebuena':
      case 'anonuevo':
      case 'felicitar':
      case 'arbol': {
        const ctxNa = m.message.extendedTextMessage?.contextInfo
        const rNa = navidadEjecutar(comando, {
          mentions: ctxNa?.mentionedJid || [],
          citado: ctxNa?.participant || null,
          jid: m.key.participant || m.key.remoteJid
        })
        if (rNa.texto) {
          await sock.sendMessage(jid, { text: rNa.texto, mentions: rNa.mentions || [] }, { quoted: m })
        }
        break
      }

      case 'herramientas': {
        if (!esDueno(m)) {
          await responder('⛔ Solo el dueño del bot puede usar este comando.')
          break
        }
        const subH = (args[0] || '').toLowerCase()
        const libreH = herramientas.libreMB()
        const cfgH = leerConfig()
        if (subH === 'instalar') {
          if ((process.env.PREFIX || '').includes('com.termux')) {
            await responder('ℹ️ En Termux se instalan con: pkg install yt-dlp ffmpeg')
            break
          }
          if (libreH !== null && libreH < 300) {
            await responder('⚠️ Hay poco espacio (' + libreH + ' MB) y necesito unos 300 MB libres. Prueba con #limpiar y revisa #espacio.')
            break
          }
          cfgH.herramientas = true
          guardarConfig(cfgH)
          await responder('⏳ Instalando yt-dlp y ffmpeg. Esto puede tardar uno o dos minutos...')
          const rH = await herramientas.instalar()
          await responder(
            (rH.ytdlp ? '✅ yt-dlp: ' + rH.ytdlp : '❌ yt-dlp: no quedó instalado') + '\n' +
            (rH.ffmpeg ? '✅ ffmpeg: ' + rH.ffmpeg.slice(0, 40) : '❌ ffmpeg: no quedó instalado') +
            (rH.errores.length ? '\n\nDetalles:\n' + rH.errores.join('\n') : '') +
            '\n💾 Espacio libre: ' + herramientas.libreMB() + ' MB'
          )
          break
        }
        if (subH === 'apagar') {
          cfgH.herramientas = false
          guardarConfig(cfgH)
          herramientas.desinstalar()
          await responder('✅ Herramientas desinstaladas. Espacio libre: ' + herramientas.libreMB() + ' MB')
          break
        }
        const eH = await herramientas.estado()
        await responder(
          '🛠️ *Herramientas del servidor*\n\n' +
          'yt-dlp: ' + (eH.ytdlp || 'no instalado') + '\n' +
          'ffmpeg: ' + (eH.ffmpeg ? 'instalado' : 'no instalado') + '\n' +
          'Espacio libre: ' + (libreH === null ? 'no disponible' : libreH + ' MB') + '\n\n' +
          'Uso:\n#herramientas instalar\n#herramientas apagar'
        )
        break
      }

      case 'reiniciar': {
        if (!esDueno(m)) {
          await responder('⛔ Solo el dueño del bot puede usar este comando.')
          break
        }
        if (process.env.BOT_LOOP || leerConfig().reinicioAuto) {
          await responder('♻️ Reiniciando el bot... vuelvo en un momento.')
          setTimeout(() => process.exit(42), 2000)
        } else {
          await responder('⚠️ El reinicio automático está desactivado. Si tu hosting reinicia solo el bot cuando se cierra, actívalo con #setupdate reinicio on')
        }
        break
      }

      case 'setmenu': {
        if (!esDueno(m)) {
          console.log('setmenu denegado. key:', JSON.stringify(m.key))
          await responder('⛔ Solo el dueño del bot puede usar este comando.')
          break
        }
        const nuevo = cuerpo.slice(cmd.length).trim()
        const cfg = leerConfig()
        if (!nuevo) {
          await responder(
            'Uso:\n#setmenu <texto del menú>\n#setmenu reset (volver al menú original)\n\nPuedes usar {fecha} y {hora} dentro del texto.'
          )
        } else if (nuevo.toLowerCase() === 'reset') {
          delete cfg.menu
          guardarConfig(cfg)
          await responder('✅ Menú restaurado al original.')
        } else {
          cfg.menu = nuevo
          guardarConfig(cfg)
          await responder('✅ Menú actualizado. Pruébalo con #menu')
        }
        break
      }

      default: {
        if (COMANDOS_GACHA.includes(comando)) {
          try {
            const participante = m.key.participantAlt || m.key.participant || jid
            const info = m.message.extendedTextMessage?.contextInfo || {}
            const ids = [participante, m.key.participant, m.key.participantAlt]
              .filter(Boolean)
              .map(x => x.split('@')[0].split(':')[0].replace(/\D/g, ''))
              .filter(Boolean)

            const resultado = gachaEjecutar(comando, args, {
              ids,
              jid: participante,
              nombre: m.pushName || '',
              cuerpo: args.join(' '),
              mentions: info.mentionedJid || [],
              citado: info.participant || null,
              esDueno: esDueno(m)
            })

            if (resultado?.texto) {
              await sock.sendMessage(jid, {
                text: resultado.texto,
                mentions: resultado.mentions || []
              }, { quoted: m })
            }
          } catch (e) {
            console.log('Error Gacha:', e)
            await responder('❌ Ocurrió un error en el sistema Gacha.')
          }
        } else {
          await responder('❌ Lo siento, ese comando no está disponible.\n📋 Usa #menu para ver los comandos disponibles.')
        }
        break
      }
    }
    if (conocido) await reaccionar(marcaFinal || EMOJIS_GACHA[comando] || EMOJIS[comando] || '✅')
  })
}

iniciar()

for (const n of leerConfig().subbots || []) {
  let vinculado = false
  try {
    vinculado = JSON.parse(fs.readFileSync('./sesiones/sub-' + n + '/creds.json', 'utf8')).registered === true
  } catch {}
  if (vinculado) {
    iniciar({ carpeta: './sesiones/sub-' + n, esSub: true, numeroSub: n })
  } else {
    quitarSubBot(n)
  }
}
