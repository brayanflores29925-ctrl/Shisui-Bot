if (!process.env.BOT_CHILD && !process.env.BOT_LOOP) {
  // Supervisor: mantiene vivo el bot y lo reinicia solo, sin depender del hosting
  const { spawn } = require('child_process')

// Pre-cargando modelo NSFW para que la primera detección sea rápida
// APAGADO try { require('./nsfw').cargarModelo().catch(e => console.log('[antiporno] No se pudo cargar modelo:', e.message)) } catch (e) { console.log('[antiporno] nsfw.js no cargó:', e.message) }
  const supFs = require('fs')
  const supPath = require('path')
  let hijo = null
  let rapidos = 0
  const revertir = () => {
    try {
      const carpetas = supFs.readdirSync('backup-update').sort()
      if (!carpetas.length) return false
      const ult = carpetas[carpetas.length - 1]
      for (const a of supFs.readdirSync(supPath.join('backup-update', ult))) {
        supFs.copyFileSync(supPath.join('backup-update', ult, a), a)
      }
      supFs.rmSync(supPath.join('backup-update', ult), { recursive: true, force: true })
      return true
    } catch {
      return false
    }
  }
  const lanzar = () => {
    const inicio = Date.now()
    hijo = spawn(process.execPath, [__filename], { stdio: 'inherit', env: { ...process.env, BOT_CHILD: '1', BOT_LOOP: '1' } })
    hijo.on('exit', code => {
      if (code === 0) process.exit(0)
      rapidos = Date.now() - inicio < 30000 ? rapidos + 1 : 0
      let espera = 3000
      if (rapidos >= 3) {
        const volvio = revertir()
        console.log(volvio ? 'El bot falla al arrancar: volví a la versión anterior.' : 'El bot falla al arrancar y no hay copia anterior.')
        rapidos = 0
        espera = 15000
      } else if (rapidos > 0) {
        espera = 10000
      }
      console.log('El bot se detuvo (código ' + code + '). Reiniciando en ' + espera / 1000 + ' segundos...')
      setTimeout(lanzar, espera)
    })
  }
  const apagar = () => {
    if (hijo) hijo.kill('SIGTERM')
    setTimeout(() => process.exit(0), 1500)
  }
  process.on('SIGTERM', apagar)
  process.on('SIGINT', apagar)
  lanzar()
  return
}
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
const fixcmd = require('./fixcmd')
const capacidad = require('./capacidad')
const extras = require('./extras')
const admin = require('./admin')
const rapido = require('./rapido')
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
const antiporno = { procesar: async () => false } // APAGADO

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
const socksVivos = new Set()
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
function maxSubs() {
  const n = Number(leerConfig().maxSubs)
  return Number.isInteger(n) && n >= 0 && n <= 100 ? n : 5
}
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

function menuActual(nsfw, filtro) {
  const cfg = leerConfig()
  if (!cfg.menu) return generarMenu(nsfw, filtro)
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
    
// --- NATIVE ANTIDELETE LISTENER ---
sock.ev.on('messages.update', async (updates) => {
  for (const update of updates) {
    // Si el mensaje fue revocado (eliminado para todos)
    if (update.update.message === null) {
      try {
        const jid = update.key.remoteJid;
        const id = update.key.id;
        if (global.msgCache && global.msgCache[jid] && global.msgCache[jid][id]) {
          const msgOriginal = global.msgCache[jid][id];
          
          // Preparar el mensaje para reenviar
          const tipo = Object.keys(msgOriginal.message)[0];
          let textoAviso = '🗑️ *MENSAJE ELIMINADO DETECTADO*\n\n';
          if (msgOriginal.message.conversation) textoAviso += msgOriginal.message.conversation;
          else if (msgOriginal.message.extendedTextMessage) textoAviso += msgOriginal.message.extendedTextMessage.text;
          else textoAviso += 'El usuario intentó borrar un mensaje multimedia (foto/video/audio).';
          
          await sock.sendMessage(jid, { text: textoAviso + '\n\n👤 De: @' + (update.key.participant || jid).split('@')[0], mentions: [update.key.participant || jid] });
        }
      } catch(e) { console.log('Error antidelete:', e.message); }
    }
  }
});
// ----------------------------------

if (connection === 'open') {
      // --- BIENVENIDA SUBBOT (SIN SPAM) ---
      try {
        const botNumber = sock.user.id.split(':')[0];
        const fs2 = require('fs');
        let bienvenidos = {};
        try { bienvenidos = JSON.parse(fs2.readFileSync('./subbots_welcomed.json', 'utf8')); } catch { bienvenidos = {}; }
        
        if (!bienvenidos[botNumber]) {
          bienvenidos[botNumber] = true;
          fs2.writeFileSync('./subbots_welcomed.json', JSON.stringify(bienvenidos, null, 2));
          
          setTimeout(async () => {
            const jidSelf = botNumber + '@s.whatsapp.net';
            const mensaje = `🎉 *¡FELICIDADES!* 🎉\n\n@${botNumber} *Te has convertido en un SubBot oficial de Shisui Bot.* 🤖\n\n*Recuerda que hay nuevas actualizaciones:*\n✅ Menú renovado\n✅ Nuevas descargas\n✅ Juegos y Economía\n\n💡 Escribe *.menu* aquí o en cualquier grupo para empezar.\n\n¡Disfruta tu nuevo bot! 🚀`;
            
            // Se envía SOLO al privado del SubBot, no al grupo
            await sock.sendMessage(jidSelf, { text: mensaje, mentions: [jidSelf] });
            console.log('✅ Mensaje de bienvenida enviado al SubBot:', botNumber);
          }, 5000); // Espera 5 segundos a que termine de sincronizar
        }
      } catch (e) {
        console.log('Error en bienvenida de subbot:', e.message);
      }
      // ------------------------------------
    
      // --- CANCELAR TIMEOUT SUBBOT ---
      try {
        const botNumberOpen = sock.user.id.split(':')[0];
        if (global.pendingCodes) {
          for (const senderJid in global.pendingCodes) {
            if (global.pendingCodes[senderJid].target === botNumberOpen) {
              clearTimeout(global.pendingCodes[senderJid].timer);
              delete global.pendingCodes[senderJid];
              console.log('✅ Subbot vinculado a tiempo. Cronómetro cancelado.');
            }
          }
        }
      } catch(e) {}
      // -------------------------------
        
      // --- BIENVENIDA SUBBOT ---
      try {
        const botNumber = sock.user.id.split(':')[0];
        if (!global.subbotsBienvenidos) global.subbotsBienvenidos = new Set();
        
        // Si es la primera vez que este número se conecta en esta sesión
        if (!global.subbotsBienvenidos.has(botNumber)) {
          global.subbotsBienvenidos.add(botNumber);
          
          // Esperar 3 segundos para que WhatsApp termine de sincronizar
          setTimeout(async () => {
            const jidSelf = botNumber + '@s.whatsapp.net';
            const mensaje = `🎉 *¡FELICIDADES!* 🎉\n\n@${botNumber} *Te has convertido en un SubBot oficial de Shisui Bot.* 🤖\n\n*Recuerda que hay nuevas actualizaciones:*\n✅ Menú renovado\n✅ Nuevas descargas (TikTok, YouTube)\n✅ Juegos y Economía\n✅ Comandos de Admin\n\n💡 *¿Qué puedes hacer ahora?*\nYa puedes digitar el menú escribiendo *.menu* aquí en tu chat privado o en cualquier grupo donde te agreguen.\n\n¡Disfruta tu nuevo bot! 🚀`;
            
            await sock.sendMessage(jidSelf, { 
              text: mensaje, 
              mentions: [jidSelf] 
            });
            console.log('✅ Mensaje de bienvenida enviado al SubBot:', botNumber);
          }, 3000);
        }
      } catch (e) {
        console.log('Error en bienvenida de subbot:', e.message);
      }
      // --------------------------

      if (esSub) subEstado[numeroSub] = { vinculado: true }
      console.log(esSub ? 'Sub bot conectado ✅ ' + numeroSub : 'Bot conectado ✅')
      socksVivos.add(sock)
      admin.programarHorarios(socksVivos)
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
      socksVivos.delete(sock)
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

  
// Sistema de invitaciones pendientes (en memoria)

async function convertirGifAWebp(gifBuffer) {
  const fs = require('fs');
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
  const path = require('path');
  const os = require('os');
  const { execFile } = require('child_process');
  const { promisify } = require('util');
  const execFileAsync = promisify(execFile);
  const base = path.join(os.tmpdir(), 'anime_' + Date.now());
  const input = base + '.gif';
  const output = base + '.webp';
  fs.writeFileSync(input, gifBuffer);
  try {
    await execFileAsync('ffmpeg', [
      '-y', '-i', input,
      '-vf', 'scale=512:512:force_original_aspect_ratio=decrease,fps=15,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000',
      '-c:v', 'libwebp', '-lossless', '1', '-q:v', '70', '-loop', '0', '-preset', 'default', '-an', '-vsync', '0',
      output
    ], { timeout: 20000 });
    return fs.readFileSync(output);
  } finally {
    try { fs.unlinkSync(input); } catch (e) {}
    try { fs.unlinkSync(output); } catch (e) {}
  }
}


async function enviarStickerAnime(cmd, jid, m, sock, mencionado) {
  const accionApi = ANIME_MAP[cmd] || cmd;
  const textoAccion = ANIME_TXT[cmd] || 'interactúa contigo';
  try {
    // Usamos otakugifs que tiene endpoints más estables para todos los comandos
    const res = await fetch('https://api.otakugifs.xyz/gif?reaction=' + accionApi);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const urlGif = data.url;
    if (!urlGif) throw new Error('Sin GIF');
    
    const gifRes = await fetch(urlGif);
    const gifBuffer = Buffer.from(await gifRes.arrayBuffer());
    const webpBuffer = await convertirGifAWebp(gifBuffer);

    // Enviamos el sticker animado
    await sock.sendMessage(jid, { sticker: webpBuffer }, { quoted: m });

    // Enviamos el texto igual que el bot Akame
    const nombre = mencionado ? '@' + mencionado.split('@')[0] : 'alguien';
    const texto = 'Tú le diste *' + textoAccion + '* a ' + nombre + ' 🤗';
    await sock.sendMessage(jid, {
      text: texto,
      mentions: mencionado ? [mencionado] : []
    }, { quoted: m });
    
  } catch (e) {
    console.log('Error sticker anime (' + accionApi + '):', e.message);
    await sock.sendMessage(jid, { text: '❌ No pude obtener el sticker de ' + accionApi }, { quoted: m });
  }
}
function calcularPorcentaje(comando, userId) {
  const crypto = require('crypto');
  const hash = crypto.createHash('md5').update(comando + userId).digest('hex');
  return parseInt(hash.substring(0, 8), 16) % 101;
}


async function descargarRespondido(m, sock) {
  const { downloadMediaMessage } = require('@whiskeysockets/baileys');
  const msg = m.message || {};
  let ctx = {};
  for (const k of Object.keys(msg)) {
    const sub = msg[k];
    if (sub && sub.contextInfo) { ctx = sub.contextInfo; break; }
  }
  if (!ctx.quotedMessage) return null;
  const quotedMsg = {
    message: ctx.quotedMessage,
    key: { remoteJid: m.key.remoteJid, id: ctx.stanzaId, participant: ctx.participant || m.key.participant }
  };
  return await downloadMediaMessage(quotedMsg, 'buffer', {}, { logger: console, reuploadRequest: sock.updateMediaMessage });
}

async function ffmpegProcess(input, inputExt, args, outputExt) {
  const fs = require('fs');
  const path = require('path');
  const os = require('os');
  const { execFile } = require('child_process');
  const { promisify } = require('util');
  const execFileAsync = promisify(execFile);
  const base = path.join(os.tmpdir(), 'fx_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8));
  const inputFile = base + inputExt;
  const outputFile = base + outputExt;
  fs.writeFileSync(inputFile, input);
  try {
    await execFileAsync('ffmpeg', ['-y', '-i', inputFile, ...args, outputFile], { timeout: 45000, maxBuffer: 50 * 1024 * 1024 });
    return fs.readFileSync(outputFile);
  } finally {
    try { fs.unlinkSync(inputFile); } catch (e) {}
    try { fs.unlinkSync(outputFile); } catch (e) {}
  }
}

async function audioEfecto(buffer, filtro) {
  try {
    return await ffmpegProcess(buffer, '.ogg', ['-filter:a', filtro, '-b:a', '128k', '-vn'], '.mp3');
  } catch (e) {
    // Fallback: intentar como mp4 por si viene de video
    return await ffmpegProcess(buffer, '.mp4', ['-vn', '-filter:a', filtro, '-b:a', '128k'], '.mp3');
  }
}

async function imagenASticker(buffer, tipo) {
  if (tipo === 'circle') {
    const vf = "scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=black@0,format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(gt(pow(X-256,2)+pow(Y-256,2),256*256),0,255)'";
    return await ffmpegProcess(buffer, '.jpg', ['-vf', vf, '-c:v', 'libwebp', '-quality', '80', '-loop', '0'], '.webp');
  }
  const vf = "scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=black@0";
  return await ffmpegProcess(buffer, '.jpg', ['-vf', vf, '-c:v', 'libwebp', '-quality', '80', '-loop', '0'], '.webp');
}

const ANIME_MAP = {"hug":"hug","kiss":"kiss","pat":"pat","slap":"slap","punch":"punch","patear":"kick","poke":"poke","tickle":"tickle","cuddle":"cuddle","bite":"bite","feed":"feed","nom":"feed","smile":"smile","wink":"wink","blush":"blush","smug":"smug","happy":"happy","angry":"angry","bored":"bored","cry":"cry","laugh":"laugh","pout":"pout","baka":"baka","bonk":"bonk","wave":"wave","nod":"nod","shrug":"shrug","nope":"nope","thumbsup":"thumbsup","handshake":"handshake","handhold":"handhold","highfive":"highfive","dance":"dance","run":"run","sleep":"sleep","yawn":"yawn","lurk":"lurk","stare":"stare","think":"think","facepalm":"facepalm","tableflip":"tableflip","shoot":"shoot","yeet":"yeet","peck":"peck"};
const ANIME_TXT = {"hug":"un abrazo","kiss":"un beso","pat":"una caricia","slap":"una bofetada","punch":"un puñetazo","patear":"una patada","poke":"un toque","tickle":"cosquillas","cuddle":"un acurruque","bite":"una mordida","feed":"de comer","nom":"de comer","smile":"una sonrisa","wink":"un guiño","blush":"un sonrojo","smug":"presumir","happy":"felicidad","angry":"enojo","bored":"aburrimiento","cry":"llanto","laugh":"risa","pout":"un puchero","baka":"un baka","bonk":"un golpecito","wave":"un saludo","nod":"un asentimiento","shrug":"un encogimiento","nope":"una negación","thumbsup":"pulgar arriba","handshake":"la mano","handhold":"la mano","highfive":"un choca los cinco","dance":"un baile","run":"una carrera","sleep":"dormir","yawn":"un bostezo","lurk":"un espía","stare":"una mirada","think":"pensar","facepalm":"una palmada en la cara","tableflip":"voltear la mesa","shoot":"un disparo","yeet":"un lanzamiento","peck":"un besito"};


function getPerfilDB() {
  const fs = require('fs');
  try { return JSON.parse(fs.readFileSync('./perfiles.json', 'utf8')); } catch { return {}; }
}
function savePerfilDB(db) {
  const fs = require('fs');
  fs.writeFileSync('./perfiles.json', JSON.stringify(db, null, 2));
}


function getTierRacha(dias) {
  if (dias >= 60) return { emoji: '👑', nombre: 'Legendario' };
  if (dias >= 30) return { emoji: '💎', nombre: 'Diamante' };
  if (dias >= 15) return { emoji: '🥇', nombre: 'Oro' };
  if (dias >= 5) return { emoji: '🥈', nombre: 'Plata' };
  return { emoji: '🥉', nombre: 'Bronce' };
}
function getRachaDB() {
  const fs = require('fs');
  try { return JSON.parse(fs.readFileSync('./rachas.json', 'utf8')); } catch { return {}; }
}
function saveRachaDB(db) {
  const fs = require('fs');
  fs.writeFileSync('./rachas.json', JSON.stringify(db, null, 2));
}


function getGachaDB() {
  const fs = require('fs');
  try { return JSON.parse(fs.readFileSync('./gacha.json', 'utf8')); } catch { return {}; }
}
function saveGachaDB(db) {
  const fs = require('fs');
  fs.writeFileSync('./gacha.json', JSON.stringify(db, null, 2));
}
function getGachaUser(db, id) {
  if (!db[id]) db[id] = { coins: 100, level: 1, xp: 0, lastDaily: 0, lastWork: 0, chars: [] };
  return db[id];
}
const GACHA_RARITIES = [
  { name: 'Común', emoji: '⚪', chance: 0.60, value: 10 },
  { name: 'Raro', emoji: '🔵', chance: 0.30, value: 30 },
  { name: 'Épico', emoji: '🟣', chance: 0.08, value: 100 },
  { name: 'Legendario', emoji: '🟡', chance: 0.02, value: 500 }
];




global.listaComandos = ['sticker', 'robloxgame', 'trabajar', 'robloxgroups', 'ranknazis', 'mediafire', 'antisticker', 'bored', 'antiaudio', 'stickername', 'despedida', 'yawn', '12vs12', 'advertencia', 'limpiar', 'card', 'bn', 'diario', 'descargarapk', 'horca', 'np', 'topricos', 'chatpgt', 'felicitar', 'setred', 'pin', 'video', 'robloxuser', 'fp', 'autoread', 'imagina', 'stare', 'grave', 'attp3', 'disco', 'random', 'piropo', 'yeet', 'adv', 'reverse', 'subs', 'pt', 'promote', 'patear', 'fake', 'instagram', 'videorapido', 'clima', 'delcode', 'imagine', 'horario', 'robloxrandom', 'arbol', 'smug', 'aspam', 'ram', 'yt', 'admins', 'cambiarlink', 'stats', 'aceptarracha', 'perfil', 'v', 'kiss', 'fd', 'piti', 'cd', 'nd', 'highfive', 'resphorca', 'musica', 'activarbot', 'dr', 'pfp', 'robloxavatar', 'as', 'roll', 'sticker2', 'gpt', 'tbcookie', 'w', 'tovideo', 'balance', 'voz', 'shoot', 'code', 'invitacion', 'dados', 'setmenu', 'invitar', 'shrug', 'audiorapido', 'bite', 'wink', 'baka', 'nod', 'antiestafas', 'ar', 'work', 'desactivarracha', 'ayudagacha', 'reglas', '6vs6', 'antilink', 'setowner', 'bt', 'feo', 'gacha', 'attp', 'setupdate', 'bass', 'p', 'toimg', 'setprotect', 'dn', 'setperfil', 'gay', 'rankotaku', 'cambiarenlace', 'k', 'facebook', 'casino', 'fix', 'coleccion', 'poke', 'sg', 'kick', 'bl', 'chatgpt', 'setoficial', 'handshake', 'hs', 'po', 'descripcion', 'sensibilidad', 'cuddle', 'setnsfw', 'aceptarinv', 'hp', 'an', 'lf', 'ardilla', 'e', 'robloxbadges', 'status', 'gpfp', 'verdad', 'thumbsup', 'tf', 'desmutear', 'rn', 'antibots', 'bonk', 'play', 'setprimary', 'videocontrario', 'yn', 'setnombre', 'downloadlink', 'fotogrupo', 'hf', 'ranklesbianas', 'dance', 'simi', 'vender', 'yonunca', 'toqr', 'think', 'link', 'aviso', 'cry', 'fb', 'aprobartodo', 'mr', 'testvideo', 'facepalm', 'slap', 'sleep', 'tag', 'modoadmin', 'guerra', 'reto', 'buscartt', 'x', 'menu', 'clear', 'sl', 'nope', 'audiolento', 'bd', 'aa', 'rankinfieles', 'navidad', 'cmd', 'r', 'horoscopo', 'borrar', 'eco', 'gachaprof', 'a2v', 'hd', 'fantasmas', 'handhold', 'setdespedida', 'owners', 'juegospro', 'rc', 'reporte', 'fq', 'stik', 'espacio', 'herramientas', 'monedas', 'setbienvenida', 'tirar', 'ae', 'robot', 'ttp', 'antistatus', 'attp2', 'lk', 'angry', 'alteradores', 'play2', 'tableflip', 'gachamenu', 'error', 'run', 'videolento', 'anonuevo', 'nom', 'togif', 'consola', 'ping', 'daily', 'delowner', 'mispj', 'wikipedia', 'ap', 'ab', 'blush', 'pk', 'removemoney', 'ranktherian', 'tt', 'tiktok', 'mute', 'actualizar', 'apostar', 'hh', 'setbotprincipal', 'setpfp', '4vs4', 'attp4', 'cerrar', 'buscar', 'setapi', 'menuclan', 'pat', 'st', 'rankbromistas', 'attp6', 'rr', 'tk', 'nombregrupo', 'wv', 'rechazarracha', 'bal', 'ban', 'robloxfriends', 'robloxfollowers', 'miracha', 'miid', 'peck', 'mutear', 'google', 'playdoc', 'sticker3', 'sh', 'ig', 'h', 'rankcornudos', 'bot', 'desactivarbot', 'tickle', 'sr', 'reiniciar', 'flipp', 'key', 'cartera', 'abrir', 'th', 'party', 'nochebuena', 'happy', 'ytsearch', 'antivideos', 'laugh', 'pc', 'smile', 'rankfieles', 'tu', 'pu', 'demote', 'sell', 'del', 'setban', 's', 'botlist', 'wave', 'restart', 'patada', 'punch', 'pout', 'zz', 'robloxstatus', 'nm', 'bk', 'unmute', 'g', 'addmoney', 'tomp3', 'rechazarinv', 'm', 'cr', 'attp5', 'av', 'robloxplayers', 'd', 'col', 'bienvenida', 'ranklindo', 'topactive', 'feed', 'llama', 'consejo', 'sm', 'wn', 'estado', 'racha', 'enigma', 'rankgay', 'gprof', 'topmoney', 'antispam', 'playvideo', 'botones', 'lurk', 'ppt', 'c', 'packname', 'hug', 'topactivos', 'ruleta', 'ruletarusa', 'unirme', 'iniciar', 'cancelarruleta'];

// --- SISTEMA DE REGISTRO DE LOGS ---
global.botLogs = [];
const oldLog = console.log;
const oldError = console.error;

function guardarLog(tipo, args) {
  try {
    const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
    const tiempo = new Date().toLocaleTimeString('es-HN');
    global.botLogs.push('[' + tiempo + '] ' + tipo + ': ' + msg);
    if (global.botLogs.length > 100) global.botLogs.shift(); // Guardar solo los últimos 100
  } catch(e) {}
}

console.log = function(...args) { guardarLog('LOG', args); oldLog.apply(console, args); };
console.error = function(...args) { guardarLog('ERR', args); oldError.apply(console, args); };
// -----------------------------------


global.filtrosConfig = {
  antiPorno: false, antiaudio: false, antivideos: false,
  antisticker: false, antispam: false, antibots: false, antiestafas: false
};

global.antiaudio = false
global.antivideos = false
global.antisticker = false
global.antispam = false
global.antibots = false
global.antiestafas = false
const invitacionesPendientes = new Map()
let contadorInvitaciones = 0


// --- DESTRUCTOR DE INVITACIONES DE UN SOLO USO ---
sock.ev.on('group-participants.update', async (update) => {
  try {
    if (update.action === 'add' && global.invitesUsoUnico && global.invitesUsoUnico[update.id]) {
      // Alguien entró, revocamos el enlace inmediatamente
      await sock.groupRevokeInvite(update.id);
      delete global.invitesUsoUnico[update.id];
      console.log('🔗 Enlace de invitación revocado automáticamente en el grupo:', update.id);
      
      await sock.sendMessage(update.id, { text: '⚠️ *Aviso:* El enlace de invitación de un solo uso ha sido revocado porque alguien ya ingresó.' });
    }
  } catch (e) {
    console.log('Error al revocar invitación:', e.message);
  }
});
// --------------------------------------------------

sock.ev.on('messages.upsert', async ({ messages }) => {

  // --- NATIVE ANTIDELETE STORE ---
  try {
    const msg = messages[0];
    if (msg.message && !msg.key.fromMe) {
      const jid = msg.key.remoteJid;
      if (!global.msgCache[jid]) global.msgCache[jid] = {};
      global.msgCache[jid][msg.key.id] = msg;
      // Limitar caché a 100 mensajes por grupo para no saturar la RAM
      const keys = Object.keys(global.msgCache[jid]);
      if (keys.length > 100) delete global.msgCache[jid][keys[0]];
    }
  } catch(e) {}
  // -------------------------------


  // --- FILTRO GLOBAL DE SUBBOTS ---
  try {
    const msg0 = messages[0];
    if (msg0 && !msg0.key.fromMe) {
      const fs2 = require('fs');
      let cfg = {};
      try { cfg = JSON.parse(fs2.readFileSync('./config.json', 'utf8')); } catch { cfg = {}; }
      
      if (cfg.subbots_off === true) {
        const miNumero = sock.user.id.split(':')[0].split('@')[0];
        const botPrincipal = cfg.botPrincipal;
        // Si NO soy el bot principal, significa que soy un subbot y debo ignorar
        if (botPrincipal && miNumero !== botPrincipal) {
          return; // Ignora el mensaje silenciosamente
        }
      }
    }
  } catch (e) {}
  // ---------------------------------

  // --- CONTADOR DE MENSAJES ---
  try {
    const msg = messages[0];
    if (msg.key.remoteJid.endsWith('@g.us') && msg.key.participant && !msg.key.fromMe) {
      const textoMsg = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
      if (textoMsg && textoMsg.length > 1) {
         const db = getActividadDB();
         if (!db[msg.key.remoteJid]) db[msg.key.remoteJid] = {};
         const sender = msg.key.participant;
         db[msg.key.remoteJid][sender] = (db[msg.key.remoteJid][sender] || 0) + 1;
         saveActividadDB(db);
      }
      
      // Detectar si alguien responde "si" a un sorteo
      if (textoMsg.toLowerCase() === 'si' && global.sorteos) {
        for (const id in global.sorteos) {
          if (global.sorteos[id].ganador === msg.key.participant && global.sorteos[id].jid === msg.key.remoteJid) {
            const premio = global.sorteos[id].premio;
            delete global.sorteos[id];
            await sock.sendMessage(msg.key.remoteJid, { text: `🎉 ¡Felicidades @${msg.key.participant.split('@')[0]}! Has reclamado tu premio: *${premio}*`, mentions: [msg.key.participant] });
          }
        }
      }
      
      // Respuestas automáticas
      const dbResp = getRespuestasDB();
      if (dbResp[msg.key.remoteJid] && textoMsg) {
         const palabra = textoMsg.toLowerCase().trim();
         if (dbResp[msg.key.remoteJid][palabra]) {
            await sock.sendMessage(msg.key.remoteJid, { text: dbResp[msg.key.remoteJid][palabra] }, { quoted: msg });
         }
      }
    }
  } catch(e) { console.log('Error contador:', e.message); }
  // ----------------------------

  // --- BAN POR REACCION ---
  try {
    const msgR = messages[0];
    if (msgR.message && msgR.message.reactionMessage) {
      const reaction = msgR.message.reactionMessage;
      const textoReaccion = (reaction.text || '').toLowerCase().trim();
      
      // Si la reacción es "ban" o la bota 👢
      if (['ban', '👢', '🥾', 'del', '🗑️'].includes(textoReaccion)) {
        const jid = msgR.key.remoteJid;
        const sender = msgR.key.participant || msgR.key.remoteJid;
        const target = reaction.key.participant || reaction.key.remoteJid;
        
        if (jid.endsWith('@g.us') && target && sender !== target) {
          // Verificar que quien reacciona sea admin o dueño
          const groupMetadata = await sock.groupMetadata(jid);
          const senderParticipant = groupMetadata.participants.find(p => p.id === sender);
          
          const esAdmin = senderParticipant && (senderParticipant.admin === 'admin' || senderParticipant.admin === 'superadmin');
          const esDuenoBot = (typeof esDueno === 'function' && esDueno(msgR));
          
          if (esAdmin || esDuenoBot) {
            // Verificar que el bot sea admin
            const botNumber = sock.user.id.split(':')[0].split('@')[0];
            const botParticipant = groupMetadata.participants.find(p => p.id.startsWith(botNumber));
            
            if (botParticipant && botParticipant.admin) {
              // Expulsar
              
              if (['ban', '👢', '🥾'].includes(textoReaccion)) {
                await sock.groupParticipantsUpdate(jid, [target], 'remove');
                await sock.sendMessage(jid, { text: `👢 @${target.split('@')[0]} fue expulsado por reacción.`, mentions: [target] }, { quoted: msgR });
              }
              
              // Borrar mensajes (tanto para ban como para del)
              if (global.msgCache && global.msgCache[jid]) {
                const msgsABorrar = global.msgCache[jid].filter(k => k.participant === target || (k.participant && k.participant.includes(target.split('@')[0])));
                for (const k of msgsABorrar) {
                  try { await sock.sendMessage(jid, { delete: k }); } catch(e) {}
                }
              }
              
              if (['del', '🗑️'].includes(textoReaccion)) {
                await sock.sendMessage(jid, { text: `🗑️ Mensajes de @${target.split('@')[0]} eliminados por reacción.`, mentions: [target] }, { quoted: msgR });
              }
                          
              // Borrar el mensaje original
              try { await sock.sendMessage(jid, { delete: reaction.key }); } catch(e) {}
              
              // Avisar
              await sock.sendMessage(jid, { text: `👢 @${target.split('@')[0]} fue expulsado por reacción de un administrador.`, mentions: [target] }, { quoted: msgR });
              return; // Detener ejecución para que no haga nada más
            }
          }
        }
      }
    }
  } catch (e) {
    console.log('Error en Ban por reacción:', e.message);
  }
  // --- FIN BAN POR REACCION ---

  // --- AUTOREAD HOOK ---
  if (global.autoread && messages[0] && !messages[0].key.fromMe) {
    try { sock.readMessages([messages[0].key]); } catch(e) {}
  }
  // ---------------------

  // --- CANDADO PARA SUBBOTS EN GRUPO OFICIAL ---
  try {
    const fs = require('fs');
    let config = {};
    try { config = JSON.parse(fs.readFileSync('./config.json', 'utf8')); } catch {}
    
    if (config.grupoOficial && config.botPrincipal) {
      const miNumero = sock.user.id.split(':')[0];
      // Si NO soy el bot principal (soy un subbot) Y el mensaje es del grupo oficial
      if (miNumero !== config.botPrincipal && messages[0].key.remoteJid === config.grupoOficial) {
        return; // El subbot ignora el mensaje y no responde
      }
    }
  } catch (e) {
    console.log('Error chequeando candado de subbot:', e.message);
  }
  // --- FIN CANDADO ---

  // --- DETECCIÓN ANTIPORNO AUTOMÁTICA ---
  try {
    if (global.antiPorno && !m.key.fromMe) {
      const { downloadMediaMessage } = require('@whiskeysockets/baileys')
      let innerMsg = m.message || {}
      if (innerMsg.ephemeralMessage) innerMsg = innerMsg.ephemeralMessage.message || {}
      if (innerMsg.viewOnceMessage) innerMsg = innerMsg.viewOnceMessage.message || {}
      if (innerMsg.viewOnceMessageV2) innerMsg = innerMsg.viewOnceMessageV2.message || {}
      if (innerMsg.documentWithCaptionMessage) innerMsg = innerMsg.documentWithCaptionMessage.message || {}

      const imageMsg = innerMsg.imageMessage
      const videoMsg = innerMsg.videoMessage
      const stickerMsg = innerMsg.stickerMessage

      let bufferToCheck = null

      if (imageMsg || stickerMsg) {
        try {
          bufferToCheck = await downloadMediaMessage(m, 'buffer', {}, {
            logger: console,
            reuploadRequest: sock.updateMediaMessage
          })
          console.log('[antiporno] Imagen/sticker descargado:', bufferToCheck.length, 'bytes')
        } catch (e) {
          console.log('[antiporno] Error descargando imagen/sticker:', e.message)
        }
      } else if (videoMsg) {
        console.log('[antiporno] Video detectado, analizando...')
        if (videoMsg.jpegThumbnail && videoMsg.jpegThumbnail.length > 100) {
          bufferToCheck = Buffer.from(videoMsg.jpegThumbnail)
          console.log('[antiporno] Usando thumbnail del video:', bufferToCheck.length, 'bytes')
        } else {
          try {
            const videoBuffer = await downloadMediaMessage(m, 'buffer', {}, {
              logger: console,
              reuploadRequest: sock.updateMediaMessage
            })
            const { execFile } = require('child_process')
            const { promisify } = require('util')
            const fs = require('fs')
            const path = require('path')
            const os = require('os')
            const execFileAsync = promisify(execFile)
            const base = path.join(os.tmpdir(), 'ttk_' + Date.now())
            const tmpVideo = base + '.mp4'
            const tmpFrame = base + '.jpg'
            fs.writeFileSync(tmpVideo, videoBuffer)
            try {
              await execFileAsync('ffmpeg', ['-y', '-i', tmpVideo, '-ss', '00:00:01', '-vframes', '1', tmpFrame], { timeout: 15000 })
              bufferToCheck = fs.readFileSync(tmpFrame)
              console.log('[antiporno] Frame extraído con ffmpeg:', bufferToCheck.length, 'bytes')
            } finally {
              try { fs.unlinkSync(tmpVideo) } catch (e) {}
              try { fs.unlinkSync(tmpFrame) } catch (e) {}
            }
          } catch (e) {
            console.log('[antiporno] Error procesando video:', e.message)
          }
        }
      }

      if (bufferToCheck && bufferToCheck.length) {
        const { esNSFW } = require('./nsfw')
        const malo = await esNSFW(bufferToCheck)
        if (malo) {
          await sock.sendMessage(m.key.remoteJid, { delete: m.key })
          await sock.sendMessage(m.key.remoteJid, {
            text: '🚫 Mensaje eliminado por contenido explícito.'
          }, { quoted: m })
          return
        }
      }
    }
  } catch (e) {
    console.log('[antiporno] Error en chequeo:', e.message)
  }
  // --- FIN DETECCIÓN ANTIPORNO ---

  // --- FILTROS ANTI-* ---
  try {
    if (m.key.remoteJid && m.key.remoteJid.endsWith('@g.us') && !m.key.fromMe) {
      let innerA = m.message || {}
      if (innerA.ephemeralMessage) innerA = innerA.ephemeralMessage.message || {}
      if (innerA.viewOnceMessage) innerA = innerA.viewOnceMessage.message || {}
      if (innerA.viewOnceMessageV2) innerA = innerA.viewOnceMessageV2.message || {}
      if (innerA.documentWithCaptionMessage) innerA = innerA.documentWithCaptionMessage.message || {}

      const senderA = m.key.participant || m.key.remoteJid
      const senderNumA = senderA.split('@')[0].split(':')[0]

      if (global.antiaudio && innerA.audioMessage) {
        try {
          await sock.sendMessage(m.key.remoteJid, { delete: m.key })
          await sock.sendMessage(m.key.remoteJid, { text: '🔇 Audio eliminado por AntiAudio.' }, { quoted: m })
        } catch (e) {}
        return
      }

      if (global.antivideos && innerA.videoMessage) {
        try {
          await sock.sendMessage(m.key.remoteJid, { delete: m.key })
          await sock.sendMessage(m.key.remoteJid, { text: '🎬 Video eliminado por AntiVideos.' }, { quoted: m })
        } catch (e) {}
        return
      }

      if (global.antisticker && innerA.stickerMessage) {
        try {
          await sock.sendMessage(m.key.remoteJid, { delete: m.key })
          await sock.sendMessage(m.key.remoteJid, { text: '🎨 Sticker eliminado por AntiSticker.' }, { quoted: m })
        } catch (e) {}
        return
      }

      if (global.antibots) {
        try {
          const meta = await sock.groupMetadata(m.key.remoteJid)
          const p = meta.participants.find(x => x.id === senderA)
          const nombre = (p && p.notify) || ''
          if (/bot|BOT|Bot/.test(nombre)) {
            await sock.groupParticipantsUpdate(m.key.remoteJid, [senderA], 'remove')
            await sock.sendMessage(m.key.remoteJid, { text: '🤖 Bot expulsado: ' + nombre }, { quoted: m })
            return
          }
        } catch (e) {}
      }

      if (global.antiestafas) {
        const txt = innerA.conversation || (innerA.extendedTextMessage && innerA.extendedTextMessage.text) || (innerA.imageMessage && innerA.imageMessage.caption) || (innerA.videoMessage && innerA.videoMessage.caption) || ''
        const patron = /bit\.ly|tinyurl|shorturl|adf\.ly|shorte\.st|cutt\.ly|rebrand\.ly|is\.gd|free.*robux|robux.*free|gana.*dinero|dinero.*facil|invertir.*garantizado|ganaste.*premio/i
        if (patron.test(txt)) {
          try {
            await sock.sendMessage(m.key.remoteJid, { delete: m.key })
            await sock.sendMessage(m.key.remoteJid, { text: '⚠️ Enlace sospechoso eliminado por AntiEstafas.' }, { quoted: m })
          } catch (e) {}
          return
        }
      }

      if (global.antispam) {
        if (!global.spamTracker) global.spamTracker = new Map()
        const ahora = Date.now()
        const ventana = 10000
        const max = 5
        if (!global.spamTracker.has(senderNumA)) global.spamTracker.set(senderNumA, [])
        const ts = global.spamTracker.get(senderNumA).filter(t => ahora - t < ventana)
        ts.push(ahora)
        global.spamTracker.set(senderNumA, ts)
        if (ts.length > max) {
          try {
            await sock.sendMessage(m.key.remoteJid, { delete: m.key })
            await sock.sendMessage(m.key.remoteJid, {
              text: '⚠️ @' + senderNumA + ' deja de spamear.',
              mentions: [senderA]
            }, { quoted: m })
          } catch (e) {}
          global.spamTracker.set(senderNumA, [])
          return
        }
      }
    }
  } catch (e) {
    console.log('[anti-*] Error:', e.message)
  }
  // --- FIN FILTROS ANTI-* ---

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

    if (await antiporno.procesar(sock, m, texto, esAdmin, downloadMediaMessage)) return

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
      const participanteRacha = [m.key.participantAlt, m.key.participant].filter(Boolean).map(racha.numero).filter(Boolean)
      if (participanteRacha.length) {
        racha.registrarMensaje(m.key.remoteJid, participanteRacha)
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
      'setoficial', 'setbotprincipal',
      'setowner', 'delowner',
      'activarbot', 'desactivarbot',
      'setnombre', 'setbienvenida', 'setdespedida',
      'setperfil', 'setban', 'setred', 'key',
      'setprotect', 'setnsfw', 'setmenu', 'navidadmenu', 'menunormal', 'miid', 'registrargrupo'
    ])

    if (comandosSoloDueno.has(comando) && !esDueno(m)) {
      await responder('⛔ Solo el dueño autorizado puede usar este comando.')
      return
    }

    if (comando === 'fix' || comando === 'actualizar') {
      await fixcmd.ejecutar({ sock, m, jid, args, responder, esDueno: esDueno(m) })
      return
    }
    const conocido = COMANDOS.has(comando)
    if (conocido) await reaccionar('⏳')

    
    // --- FILTRO INTELIGENTE DE COMANDOS ---
    if (global.listaComandos && comando && !COMANDOS.has(comando) && !global.listaComandos.includes(comando)) {
      let sugerencia = '';
      let menorDistancia = 3;
      const comandoMalEscrito = comando.toLowerCase().trim();
      if (comandoMalEscrito.length > 1) {
        for (const comandoValido of global.listaComandos) {
          const distancia = calcularSimilitud(comandoMalEscrito, comandoValido);
          if (distancia < menorDistancia && distancia > 0) {
            menorDistancia = distancia;
            sugerencia = comandoValido;
          }
        }
      }
      
      if (sugerencia) {
        
        try {
          if (sugerencia) {
            await responder(`❌ El comando *${comando}* no existe.\n\n💡 ¿Quizás quisiste decir *${prefijo}${sugerencia}*?`);
          } else {
            await responder(`❌ Lo siento, el comando *${comando}* no está disponible.\n📋 Usa ${prefijo}menu para ver los comandos.`);
          }
        } catch (err) {
          console.log('Error en sugerencia:', err.message);
          await responder('❌ Ese comando no existe.');
        }
      } else {
        await responder(`❌ Lo siento, el comando *${comando}* no está disponible.\n📋 Usa ${prefijo}menu para ver los comandos.`);
      }
      return; // Detiene la ejecución para que no llegue al switch
    }
    // --------------------------------------

    
    // --- GUARDIÁN INTELIGENTE DE COMANDOS ---
    if (typeof comando !== 'undefined' && comando && global.listaComandos) {
      const cmdLimpio = comando.toLowerCase().trim();
      // Si el comando NO existe en la lista y tiene más de 1 letra
      if (!COMANDOS.has(cmdLimpio) && !global.listaComandos.includes(cmdLimpio) && cmdLimpio.length > 1) {
        let sug = '';
        let min = 3;
        const p = (typeof prefijo !== 'undefined' && prefijo) ? prefijo : (comando && comando[0]) ? comando[0] : '#';
        
        for (const val of global.listaComandos) {
          // Calculamos la distancia matemáticamente
          const m = Array.from({ length: val.length + 1 }, () => Array(cmdLimpio.length + 1).fill(0));
          for (let i = 0; i <= val.length; i++) m[i][0] = i;
          for (let j = 0; j <= cmdLimpio.length; j++) m[0][j] = j;
          for (let i = 1; i <= val.length; i++) {
            for (let j = 1; j <= cmdLimpio.length; j++) {
              m[i][j] = val[i - 1] === cmdLimpio[j - 1] ? m[i - 1][j - 1] : Math.min(m[i - 1][j - 1] + 1, Math.min(m[i][j - 1] + 1, m[i - 1][j] + 1));
            }
          }
          const d = m[val.length][cmdLimpio.length];
          if (d < min && d > 0) { min = d; sug = val; }
        }
        
        if (sug) {
          await responder(`❌ El comando *${comando}* no existe.\n\n💡 ¿Quizás quisiste decir *${p}${sug}*?`);
        } else {
          await responder(`❌ Lo siento, el comando *${comando}* no está disponible.\n📋 Usa ${p}menu.`);
        }
        return; // Detiene la ejecución para que no llegue al switch original
      }
    }
    // --- FIN GUARDIÁN ---
    
    
    
    
    switch (comando) {

    case 'mediafire': {
      try {
        const url = cuerpo.slice(cmd.length).trim();
        if (!url || !url.includes('mediafire.com')) {
          await responder('Uso: #mediafire <enlace>');
          break;
        }

        try { await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } }); } catch (e) {}
        await responder('📥 Analizando enlace...');

        const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const html = await res.text();
        
        // Búsqueda segura sin Regex (evita errores de sintaxis)
        const parts = html.split('href="https://download');
        if (parts.length < 2) {
          await responder('❌ No se encontró el enlace de descarga. Puede que el archivo haya sido eliminado o el enlace sea inválido.');
          break;
        }
        const linkEnd = parts[1].indexOf('"');
        const directLink = 'https://download' + parts[1].substring(0, linkEnd);

        await responder('⬇️ Descargando archivo... (puede tardar)');

        const fileRes = await fetch(directLink);
        if (!fileRes.ok) throw new Error('HTTP ' + fileRes.status);
        
        const buffer = Buffer.from(await fileRes.arrayBuffer());
        
        if (buffer.length > 64 * 1024 * 1024) {
          await responder('❌ El archivo supera los 64MB (límite de WhatsApp).');
          break;
        }

        let fileName = 'archivo_mediafire';
        const disposition = fileRes.headers.get('content-disposition');
        if (disposition && disposition.includes('filename=')) {
          fileName = disposition.split('filename=')[1].replace(/"/g, '');
        } else {
          const urlParts = url.split('/');
          if (urlParts.length > 4) fileName = urlParts[4];
        }

        await sock.sendMessage(jid, { document: buffer, mimetype: fileRes.headers.get('content-type') || 'application/octet-stream', fileName: fileName }, { quoted: m });
        try { await sock.sendMessage(jid, { react: { text: '✅', key: m.key } }); } catch (e) {}
      } catch (e) {
        console.log('Error en .mediafire:', e.message);
        await responder('❌ Error al descargar: ' + e.message);
      }
      break;
    }



    // ==========================================
    // MEJORAR IMAGEN (HD LOCAL CON JIMP)
    // ==========================================
    case 'hd': case 'remini': case 'mejorar': {
      try {
        // Verificar que esté respondiendo a una imagen
        const quoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (!quoted || (!quoted.imageMessage && !quoted.stickerMessage)) {
          await responder('🖼️ Responde a una imagen o sticker con #hd para mejorarlo.');
          break;
        }

        try { await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } }); } catch (e) {}

        // Descargar la imagen original
        const buffer = await descargarRespondido(m, sock);
        if (!buffer) { 
          await responder('❌ No se pudo descargar la imagen.'); 
          break; 
        }

        // Procesar con Jimp
        const Jimp = require('jimp');
        const image = await Jimp.read(buffer);

        // 1. Escalar x2 (Duplicar tamaño)
        image.scale(2);

        // 2. Aplicar un poco de contraste y saturación para que se vea más "HD"
        image.contrast(0.15);
        image.brightness(0.05);

        // 3. Guardar como JPG de alta calidad
        const finalBuffer = await image.getBufferAsync(Jimp.MIME_JPEG);

        // Enviar la imagen mejorada
        await sock.sendMessage(jid, { 
          image: finalBuffer, 
          caption: '✅ *Imagen mejorada (HD)*' 
        }, { quoted: m });

        try { await sock.sendMessage(jid, { react: { text: '✅', key: m.key } }); } catch (e) {}

      } catch (e) {
        console.log('Error en .hd:', e.message);
        await responder('❌ Error al mejorar la imagen: ' + e.message);
        try { await sock.sendMessage(jid, { react: { text: '❌', key: m.key } }); } catch (e) {}
      }
      break;
    }



    // ==========================================
    // STICKER + AUDIO (SIMULACIÓN DE STICKER CON SONIDO)
    // ==========================================
    case 'stickerconaudio': case 'saudio': case 'sca': {
      try {
        // 1. Verificar que el usuario esté respondiendo a un sticker
        const quoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (!quoted || !quoted.stickerMessage) {
          await responder('❌ Responde a un sticker animado con este comando.\\nEjemplo: #stickerconaudio nombre de la canción');
          break;
        }

        // 2. Obtener el nombre de la canción o el enlace
        const query = cuerpo.slice(cmd.length).trim();
        if (!query) { await responder('Uso: #stickerconaudio <nombre de canción>\\nEjemplo: #stickerconaudio feliz navidad'); break; }

        try { await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } }); } catch (e) {}

        const fs2 = require('fs');
        const { exec } = require('child_process');
        const { promisify } = require('util');
        const execAsync = promisify(exec);

        // 3. Descargar el sticker original para reenviarlo
        const stickerBuffer = await sock.downloadMediaMessage({
          message: quoted,
          key: { remoteJid: jid, id: m.message.extendedTextMessage.contextInfo.stanzaId }
        });

        // 4. Buscar y descargar el audio de YouTube (solo 3 segundos)
        let url = query;
        if (!query.startsWith('http')) {
          const { stdout } = await execAsync('yt-dlp --extractor-args "youtube:player_client=android" --dump-json --no-warnings "ytsearch1:' + query + '"', { timeout: 30000 });
          const info = JSON.parse(stdout.trim().split('\\n')[0]);
          url = info.webpage_url;
        }

        const filePath = '/tmp/audio_corto_' + Date.now() + '.m4a';
        // Descargamos y recortamos a 3 segundos exactos
        await execAsync('yt-dlp --extractor-args "youtube:player_client=android" -f 140/bestaudio[ext=m4a]/bestaudio -o - "' + url + '" | ffmpeg -y -i pipe:0 -t 3 -c copy "' + filePath + '"', { timeout: 60000 });

        if (!fs2.existsSync(filePath)) { await responder('❌ No se pudo obtener el audio.'); break; }
        
        const audioBuffer = fs2.readFileSync(filePath);
        fs2.unlinkSync(filePath);

        // 5. Enviar primero el Sticker y luego el Audio
        await sock.sendMessage(jid, { sticker: stickerBuffer }, { quoted: m });
        await sock.sendMessage(jid, { audio: audioBuffer, mimetype: 'audio/mp4' }, { quoted: m });
        
        try { await sock.sendMessage(jid, { react: { text: '✅', key: m.key } }); } catch (e) {}

      } catch (e) {
        console.log('Error en .stickerconaudio:', e.message);
        await responder('❌ Error al procesar el sticker con audio.');
      }
      break;
    }



    case 'fix': case 'actualizar': case 'update': {
      try {
        await responder('🔧 Forzando actualización desde GitHub...');
        const { exec } = require('child_process');
        const { promisify } = require('util');
        const execAsync = promisify(exec);
        
        // Esto obliga a Git a ignorar los cambios locales y traer lo de GitHub
        await execAsync('git fetch origin main', { timeout: 60000 });
        await execAsync('git reset --hard origin/main', { timeout: 60000 });
        
        await responder('✅ Código actualizado. Reiniciando el bot...');
        setTimeout(() => { process.exit(0); }, 2000);
        
      } catch (e) {
        await responder('❌ Error al actualizar: ' + e.message);
      }
      break;
    }



    case 'play': case 'play2': case 'spotify': case 'sp': {
      try {
        const query = cuerpo.slice(cmd.length).trim();
        if (!query) { await responder('Uso: #' + cmd + ' <nombre>'); break; }
        
        try { await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } }); } catch (e) {}

        const Youtube = require('youtube-search-api');
        const results = await Youtube.GetListByKeyword(query, false, 1);
        if (!results.items || results.items.length === 0) { await responder('❌ No encontré resultados.'); break; }
        
        const v = results.items[0];
        const url = 'https://www.youtube.com/watch?v=' + v.id;
        const title = v.title;
        const channel = v.channelTitle;
        const duration = v.length ? v.length.text : 'Desconocido';
        const thumb = v.thumbnail ? (v.thumbnail.url || v.thumbnail) : null;

        const txt = '➩ Audio › *' + title + '*\n\n❖ Canal › *' + channel + '*\n⧖ Duración › *' + duration + '*\n⏳ Descargando audio...';
        if (thumb) await sock.sendMessage(jid, { image: { url: thumb }, caption: txt }, { quoted: m });
        else await sock.sendMessage(jid, { text: txt }, { quoted: m });

        let bufferFinal = null;
        
        // API 1: PAXSENIX
        try {
           const res = await fetch('https://api.paxsenix.biz.id/dl/ytmp3?url=' + encodeURIComponent(url));
           const json = await res.json();
           if (json.status && json.result && json.result.download) {
               const r = await fetch(json.result.download);
               bufferFinal = Buffer.from(await r.arrayBuffer());
           }
        } catch(e) { console.log('Fallo API 1 Paxsenix'); }

        // API 2: PRIMESAVE
        if (!bufferFinal) {
           try {
             const downloader = require('primesave-dl');
             const res = await downloader(url);
             if (res.success && res.options) {
               const opt = res.options.find(o => o.type === 'Audio');
               if (opt && opt.url) { const r = await fetch(opt.url); bufferFinal = Buffer.from(await r.arrayBuffer()); }
             }
           } catch(e) { console.log('Fallo API 2 Primesave'); }
        }

        // API 3: YT-DLP
        if (!bufferFinal) {
           try {
             const { exec } = require('child_process');
             const { promisify } = require('util');
             const execAsync = promisify(exec);
             const fs2 = require('fs');
             const p = '/tmp/aud_' + Date.now() + '.m4a';
             await execAsync('yt-dlp --extractor-args "youtube:player_client=android" -f 140/bestaudio[ext=m4a]/bestaudio -o "' + p + '" "' + url + '"', {timeout: 40000});
             if (fs2.existsSync(p)) { bufferFinal = fs2.readFileSync(p); fs2.unlinkSync(p); }
           } catch(e) { console.log('Fallo API 3 yt-dlp'); }
        }

        if (bufferFinal && bufferFinal.length > 5000) {
          await sock.sendMessage(jid, { audio: bufferFinal, mimetype: 'audio/mp4' }, { quoted: m });
          try { await sock.sendMessage(jid, { react: { text: '✅', key: m.key } }); } catch (e) {}
        } else {
          await responder('❌ No se pudo descargar el audio (todos los servidores fallaron).');
        }
      } catch (e) { console.log('Error play:', e.message); }
      break;
    }

    // ==========================================
    // DESCARGA DE VIDEO (MULTI-API RESCATE)
    // ==========================================
    case 'playvideo': case 'video': case 'v': {
      try {
        const query = cuerpo.slice(cmd.length).trim();
        if (!query) { await responder('Uso: #' + cmd + ' <nombre>'); break; }
        
        try { await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } }); } catch (e) {}

        const Youtube = require('youtube-search-api');
        const results = await Youtube.GetListByKeyword(query, false, 1);
        if (!results.items || results.items.length === 0) { await responder('❌ No encontré resultados.'); break; }
        
        const v = results.items[0];
        const url = 'https://www.youtube.com/watch?v=' + v.id;
        const title = v.title;
        const channel = v.channelTitle;
        const duration = v.length ? v.length.text : 'Desconocido';
        const thumb = v.thumbnail ? (v.thumbnail.url || v.thumbnail) : null;

        const txt = '➩ Video › *' + title + '*\n\n❖ Canal › *' + channel + '*\n⧖ Duración › *' + duration + '*\n⏳ Descargando video...';
        if (thumb) await sock.sendMessage(jid, { image: { url: thumb }, caption: txt }, { quoted: m });
        else await sock.sendMessage(jid, { text: txt }, { quoted: m });

        let bufferFinal = null;
        
        // API 1: PAXSENIX
        try {
           const res = await fetch('https://api.paxsenix.biz.id/dl/ytmp4?url=' + encodeURIComponent(url));
           const json = await res.json();
           if (json.status && json.result && json.result.download) {
               const r = await fetch(json.result.download);
               bufferFinal = Buffer.from(await r.arrayBuffer());
           }
        } catch(e) { console.log('Fallo API 1 Paxsenix Video'); }

        // API 2: PRIMESAVE
        if (!bufferFinal) {
           try {
             const downloader = require('primesave-dl');
             const res = await downloader(url);
             if (res.success && res.options) {
               const opt = res.options.find(o => o.type === 'Video');
               if (opt && opt.url) { const r = await fetch(opt.url); bufferFinal = Buffer.from(await r.arrayBuffer()); }
             }
           } catch(e) { console.log('Fallo API 2 Primesave Video'); }
        }

        // API 3: YT-DLP
        if (!bufferFinal) {
           try {
             const { exec } = require('child_process');
             const { promisify } = require('util');
             const execAsync = promisify(exec);
             const fs2 = require('fs');
             const p = '/tmp/vid_' + Date.now() + '.mp4';
             await execAsync('yt-dlp --extractor-args "youtube:player_client=web_embedded,android" -f "bv*+ba/b" --merge-output-format mp4 -o "' + p + '" "' + url + '"', {timeout: 60000});
             if (fs2.existsSync(p)) { bufferFinal = fs2.readFileSync(p); fs2.unlinkSync(p); }
           } catch(e) { console.log('Fallo API 3 yt-dlp Video'); }
        }

        if (bufferFinal && bufferFinal.length > 5000) {
          if (bufferFinal.length > 64 * 1024 * 1024) {
            await responder('❌ El video supera los 64MB.');
          } else {
            await sock.sendMessage(jid, { video: bufferFinal, caption: '✅ ' + title }, { quoted: m });
            try { await sock.sendMessage(jid, { react: { text: '✅', key: m.key } }); } catch (e) {}
          }
        } else {
          await responder('❌ No se pudo descargar el video (todos los servidores fallaron).');
        }
      } catch (e) { console.log('Error video:', e.message); }
      break;
    }

    // ==========================================
    // DESCARGA DE FACEBOOK (3 APIS)
    // ==========================================
    case 'facebook': case 'fb': {
      try {
        const url = cuerpo.slice(cmd.length).trim();
        if (!url || !url.includes('facebook.com')) {
          await responder('Uso: #facebook <enlace>');
          break;
        }
        try { await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } }); } catch (e) {}
        await responder('📥 Descargando video de Facebook...');
        
        let bufferFinal = null;

        // API 1: BetaBotz
        try {
          const res = await fetch('https://api.betabotz.eu.org/api/download/fbdown?url=' + encodeURIComponent(url));
          const json = await res.json();
          if (json.status && json.result && (json.result.hd || json.result.sd)) {
            const r = await fetch(json.result.hd || json.result.sd);
            bufferFinal = Buffer.from(await r.arrayBuffer());
          }
        } catch(e) { console.log('Fallo FB API 1'); }

        // API 2: Nexoracle
        if (!bufferFinal) {
           try {
             const res = await fetch('https://api.nexoracle.com/downloader/facebook?url=' + encodeURIComponent(url));
             const json = await res.json();
             if (json.status && json.result && json.result.url) {
               const r = await fetch(json.result.url);
               bufferFinal = Buffer.from(await r.arrayBuffer());
             }
           } catch(e) { console.log('Fallo FB API 2'); }
        }

        // API 3: Paxsenix
        if (!bufferFinal) {
           try {
             const res = await fetch('https://api.paxsenix.biz.id/dl/facebook?url=' + encodeURIComponent(url));
             const json = await res.json();
             if (json.status && json.result && (json.result.video_hd || json.result.video_sd)) {
               const r = await fetch(json.result.video_hd || json.result.video_sd);
               bufferFinal = Buffer.from(await r.arrayBuffer());
             }
           } catch(e) { console.log('Fallo FB API 3'); }
        }

        if (bufferFinal) {
          if (bufferFinal.length > 64 * 1024 * 1024) {
            await responder('❌ El video de Facebook pesa más de 64MB.');
            try { await sock.sendMessage(jid, { react: { text: '❌', key: m.key } }); } catch (e) {}
          } else {
            await sock.sendMessage(jid, { video: bufferFinal, caption: '✅ Video de Facebook' }, { quoted: m });
            try { await sock.sendMessage(jid, { react: { text: '✅', key: m.key } }); } catch (e) {}
          }
        } else {
          await responder('❌ No se pudo descargar el video (la API falló o el video es privado).');
          try { await sock.sendMessage(jid, { react: { text: '❌', key: m.key } }); } catch (e) {}
        }
      } catch (e) { console.log('Error en facebook:', e.message); }
      break;
    }



    case 'ia': case 'chatgpt': case 'gpt': {
      try {
        const prompt = cuerpo.slice(cmd.length).trim();
        if (!prompt) { await responder('Uso: #' + cmd + ' <pregunta>'); break; }
        
        try { await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } }); } catch (e) {}

        let respuesta = null;

        // API 1: algochat-ai (Gemini, sin API key)
        try {
          const algochat = require('algochat-ai');
          respuesta = await algochat.chat(prompt);
        } catch (e) { console.log('Fallo API 1 (algochat):', e.message); }

        // API 2: keylessai (OpenAI-compatible, sin API key)
        if (!respuesta) {
          try {
            const res = await fetch('https://keylessai.thryx.workers.dev/v1/chat/completions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ model: 'gpt-4o', messages: [{ role: 'user', content: prompt }] })
            });
            const data = await res.json();
            if (data.choices && data.choices[0] && data.choices[0].message) {
              respuesta = data.choices[0].message.content;
            }
          } catch (e) { console.log('Fallo API 2 (keylessai):', e.message); }
        }

        // API 3: Pollinations (Respaldo final)
        if (!respuesta) {
          try {
            const res = await fetch('https://text.pollinations.ai/' + encodeURIComponent(prompt) + '?model=openai');
            const text = await res.text();
            if (text) respuesta = text.trim();
          } catch (e) { console.log('Fallo API 3 (pollinations):', e.message); }
        }

        if (respuesta) {
          await sock.sendMessage(jid, { text: respuesta }, { quoted: m });
          try { await sock.sendMessage(jid, { react: { text: '✅', key: m.key } }); } catch (e) {}
        } else {
          await responder('❌ La IA no pudo responder (todos los servidores fallaron).');
          try { await sock.sendMessage(jid, { react: { text: '❌', key: m.key } }); } catch (e) {}
        }

      } catch (e) { console.log('Error IA:', e.message); }
      break;
    }



    // ==========================================
    // DESCARGAS Y IA BLINDADAS
    // ==========================================
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
          
          let sug2 = '';
          let min2 = 3;
          if (global.listaComandos && comando && comando.length > 1) {
            for (const val of global.listaComandos) {
              const d = calcularSimilitud(comando, val);
              if (d < min2 && d > 0) { min2 = d; sug2 = val; }
            }
          }
          if (sug2) {
            await responder(`❌ El comando *${comando}* no existe.\n\n💡 ¿Quizás quisiste decir *${prefijo}${sug2}*?`);
          } else {
            await responder(`❌ Lo siento, el comando *${comando}* no está disponible.\n📋 Usa ${prefijo}menu.`);
          }
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
