if (!process.env.BOT_CHILD && !process.env.BOT_LOOP) {
  // Supervisor: mantiene vivo el bot y lo reinicia solo, sin depender del hosting
  const { spawn } = require('child_process')

// Pre-cargando modelo NSFW para que la primera detección sea rápida
try { require('./nsfw').cargarModelo().catch(e => console.log('[antiporno] No se pudo cargar modelo:', e.message)) } catch (e) { console.log('[antiporno] nsfw.js no cargó:', e.message) }
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
const antiporno = require('./antiporno')

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

function menuActual(nsfw, filtro) {
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
      'setprotect', 'setnsfw', 'setmenu', 'miid', 'registrargrupo'
    ])

    if (comandosSoloDueno.has(comando) && !esDueno(m)) {
      await responder('⛔ Solo el dueño autorizado puede usar este comando.')
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

    // ==========================================
    // INTERRUPTOR GLOBAL PARA SUBBOTS (BLINDADO)
    // ==========================================
    case 'apagarsubs': case 'subsoff': {
      try {
        // Lista de dueños directa (por si esDueno falla)
        const esDuenoReal = esDuenoPrincipal(m);
        
        if (!esDuenoReal) {
          await responder('❌ Solo el dueño principal puede apagar los SubBots.');
          try { await sock.sendMessage(jid, { react: { text: '❌', key: m.key } }); } catch(e) {}
          break;
        }
        
        const fs2 = require('fs');
        let cfg = {};
        try { cfg = JSON.parse(fs2.readFileSync('./config.json', 'utf8')); } catch { cfg = {}; }
        
        cfg.subbots_off = true;
        fs2.writeFileSync('./config.json', JSON.stringify(cfg, null, 2));
        
        await responder('🔴 *SubBots apagados globalmente.*\nNingún SubBot responderá a comandos hasta que uses #encendersubs.');
        try { await sock.sendMessage(jid, { react: { text: '🔴', key: m.key } }); } catch(e) {}
      } catch (e) {
        console.log('Error en .apagarsubs:', e.message);
        await responder('❌ Error al apagar SubBots: ' + e.message);
      }
      break;
    }

    case 'encendersubs': case 'subson': {
      try {
        const esDuenoReal = esDuenoPrincipal(m);
        
        if (!esDuenoReal) {
          await responder('❌ Solo el dueño principal puede encender los SubBots.');
          try { await sock.sendMessage(jid, { react: { text: '❌', key: m.key } }); } catch(e) {}
          break;
        }
        
        const fs2 = require('fs');
        let cfg = {};
        try { cfg = JSON.parse(fs2.readFileSync('./config.json', 'utf8')); } catch { cfg = {}; }
        
        cfg.subbots_off = false;
        fs2.writeFileSync('./config.json', JSON.stringify(cfg, null, 2));
        
        await responder('🟢 *SubBots encendidos globalmente.*\nAhora todos los SubBots pueden responder a comandos.');
        try { await sock.sendMessage(jid, { react: { text: '🟢', key: m.key } }); } catch(e) {}
      } catch (e) {
        console.log('Error en .encendersubs:', e.message);
        await responder('❌ Error al encender SubBots: ' + e.message);
      }
      break;
    }



    // ==========================================
    // INTERRUPTOR GLOBAL PARA SUBBOTS
    // ==========================================
    case 'instagram': case 'ig': {
      try {
        const url = cuerpo.slice(cmd.length).trim();
        if (!url || !url.includes('instagram.com')) {
          await responder('Uso: #instagram <enlace>\nEjemplo: #ig https://www.instagram.com/reel/...');
          break;
        }
        
        try { await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } }); } catch (e) {}
        
        const { alldl } = require('rahad-all-downloader-v2');
        const res = await alldl(url, { retries: 2 });

        if (!res || !res.data || !res.data.videoUrl) {
          await responder('❌ No se pudo extraer el video. Asegúrate de que el enlace sea de un Reel o video público.');
          try { await sock.sendMessage(jid, { react: { text: '❌', key: m.key } }); } catch (e) {}
          break;
        }

        const videoRes = await fetch(res.data.videoUrl);
        const buffer = Buffer.from(await videoRes.arrayBuffer());

        if (buffer.length > 64 * 1024 * 1024) {
          await responder('❌ El video supera los 64MB (límite de WhatsApp).');
          try { await sock.sendMessage(jid, { react: { text: '❌', key: m.key } }); } catch (e) {}
        } else {
          const titulo = res.data.title || 'Video de Instagram';
          await sock.sendMessage(jid, { video: buffer, caption: '✅ *' + titulo + '*' }, { quoted: m });
          try { await sock.sendMessage(jid, { react: { text: '✅', key: m.key } }); } catch (e) {}
        }
      } catch (e) {
        console.log('Error en .instagram (rahad):', e.message);
        await responder('❌ Error al descargar. Puede que el post sea privado o no contenga video.');
        try { await sock.sendMessage(jid, { react: { text: '❌', key: m.key } }); } catch (e) {}
      }
      break;
    }



    case 'facebook': case 'fb': {
      const fs2 = require('fs');
      const path2 = require('path');
      const { execFile } = require('child_process');
      const { promisify } = require('util');
      const execFileAsync = promisify(execFile);
      const base = '/tmp/fb_' + Date.now();
      const filePath = base + '.mp4';
      const fileWA = base + '_wa.mp4';

      try {
        const url = cuerpo.slice(cmd.length).trim();
        if (!url || !/facebook\.com|fb\.watch/i.test(url)) {
          await responder('Uso: #facebook <enlace>\nEjemplo: #fb https://www.facebook.com/share/r/...');
          break;
        }

        try { await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } }); } catch (e) {}

        await execFileAsync('yt-dlp', [
          '--no-warnings',
          '--no-playlist',
          '-f', 'bv*+ba/b',
          '--merge-output-format', 'mp4',
          '-o', filePath,
          url
        ], { timeout: 90000, maxBuffer: 10 * 1024 * 1024 });

        if (!fs2.existsSync(filePath)) {
          throw new Error('No se encontró el video descargado');
        }

        await execFileAsync('ffmpeg', [
          '-y', '-i', filePath,
          '-map', '0:v:0',
          '-map', '0:a?',
          '-c:v', 'libx264',
          '-preset', 'veryfast',
          '-crf', '26',
          '-pix_fmt', 'yuv420p',
          '-c:a', 'aac',
          '-b:a', '128k',
          '-movflags', '+faststart',
          fileWA
        ], { timeout: 120000, maxBuffer: 10 * 1024 * 1024 });

        if (!fs2.existsSync(fileWA)) {
          throw new Error('No se pudo convertir el video');
        }

        const buffer = fs2.readFileSync(fileWA);
        if (!buffer.length) throw new Error('El video convertido está vacío');

        await sock.sendMessage(jid, {
          video: buffer,
          mimetype: 'video/mp4',
          caption: '✅ Video de Facebook'
        }, { quoted: m });

        try { await sock.sendMessage(jid, { react: { text: '✅', key: m.key } }); } catch (e) {}
      } catch (e) {
        console.log('Error en .facebook:', e.message);
        await responder('❌ No se pudo descargar o convertir el video de Facebook.');
        try { await sock.sendMessage(jid, { react: { text: '❌', key: m.key } }); } catch (e) {}
      } finally {
        for (const f of [filePath, fileWA]) {
          try { if (fs2.existsSync(f)) fs2.unlinkSync(f); } catch (e) {}
        }
      }
      break;
    }


    case 'regalo': {
      try {
        const ctxRegalo = m.message?.extendedTextMessage?.contextInfo;
        const mencionado = (ctxRegalo?.mentionedJid || [])[0] || ctxRegalo?.participant;
        if (!mencionado) {
          await responder('Uso: #regalo @usuario\nEjemplo: #regalo @Leandro');
          break;
        }

        const sender = m.key.participant || m.key.remoteJid;
        const nombreSender = sender.split('@')[0].split(':')[0];
        const nombreTarget = mencionado.split('@')[0].split(':')[0];

        const regalos = [
          '🎁 una caja llena de abrazos',
          '🧸 un osito de peluche gigante',
          '🍫 un chocolate delicioso',
          '🌹 una rosa roja',
          '💎 un diamante brillante',
          '🎮 un videojuego nuevo',
          '🎂 un pastel de cumpleaños',
          '🎈 un globo con mucho amor'
        ];
        const reg = regalos[Math.floor(Math.random() * regalos.length)];

        await sock.sendMessage(jid, {
          text: '🎁 @' + nombreSender + ' le regala ' + reg + ' a @' + nombreTarget + ' ❤️',
          mentions: [sender, mencionado]
        }, { quoted: m });

        try { await sock.sendMessage(jid, { react: { text: '🎁', key: m.key } }); } catch (e) {}
      } catch (e) {
        console.log('Error en .regalo:', e.message);
        await responder('❌ Error al enviar el regalo.');
      }
      break;
    }



    // ==========================================
    // DESCARGA OPTIMIZADA (SOLO 2 MENSAJES)
    // ==========================================
    case 'play': case 'play2': case 'spotify': case 'sp': {
      try {
        const query = cuerpo.slice(cmd.length).trim();
        const conTiempo = (promesa, ms) => new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('Tiempo agotado')), ms);
          Promise.resolve(promesa).then(
            valor => { clearTimeout(timer); resolve(valor); },
            error => { clearTimeout(timer); reject(error); }
          );
        });

        if (!query) { await responder('Uso: #' + cmd + ' <nombre>'); break; }
        
        // Reacción de "trabajando" para no mandar mensaje de texto
        try { await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } }); } catch (e) {}
        await responder('⏳ Buscando información y preparando tu audio...');

        const fs2 = require('fs');
        let bufferFinal = null;
        let tituloFinal = query;
        let thumbFinal = null;
        let canalFinal = null;
        let duracionFinal = null;
        let vistasFinal = null;
        let enlaceFinal = null;
        const descargarArchivo = async (url) => {
          const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error('HTTP ' + r.status);
          const tipo = (r.headers.get('content-type') || '').toLowerCase();
          if (/text\/html|application\/json/.test(tipo)) throw new Error('Respuesta no válida');
          const b = Buffer.from(await r.arrayBuffer());
          if (b.length < 1024) throw new Error('Archivo vacío o incompleto');
          return b;
        };


        // API 1: Denzy
        try {
          const yt = require('@denzy-official/youtube_scraper');
          const res = await conTiempo(yt.ytmp3(query), 8000);
          if (res && res.download && res.download.url) {
            bufferFinal = await descargarArchivo(res.download.url);
            tituloFinal = (res.metadata && res.metadata.title) ? res.metadata.title : query;
            thumbFinal = res.metadata ? res.metadata.thumbnail : null;
            canalFinal = res.metadata?.author?.name || null;
            duracionFinal = res.metadata?.timestamp || res.metadata?.duration?.timestamp || null;
            vistasFinal = res.metadata?.views || res.metadata?.viewCount || null;
            enlaceFinal = res.metadata?.url || res.metadata?.webpage_url || null;
          }
        } catch (e) {}

        // API 2: ShadowX
        if (!bufferFinal) {
          try {
            const ytdl = require('shadowx-ytdl');
            const busqueda = await conTiempo(ytdl.searchYouTube(query), 5000);
            const video = busqueda && busqueda.status && Array.isArray(busqueda.results)
              ? busqueda.results.find(v => v.type === 'video' && v.url)
              : null;

            if (video) {
              const res = await conTiempo(ytdl.downloadAudio(video.url, 128), 10000);
              if (res && res.status && res.download && res.download.status && res.download.downloadUrl) {
                bufferFinal = await descargarArchivo(res.download.downloadUrl);
                tituloFinal = (res.metadata && res.metadata.title) || video.title || query;
                thumbFinal = (res.metadata && res.metadata.thumbnail) || video.thumbnail || video.image || null;
                canalFinal = res.metadata?.author?.name || video.author?.name || null;
                duracionFinal = res.metadata?.timestamp || video.timestamp || null;
                vistasFinal = res.metadata?.views || res.metadata?.viewCount || video.views || video.viewCount || null;
                enlaceFinal = res.metadata?.url || res.metadata?.webpage_url || video.url || null;
              }
            }
          } catch (e) { console.log('ShadowX audio:', e.message); }
        }

        // API 3: yt-dlp
        if (!bufferFinal) {
          try {
            const { exec } = require('child_process');
            const { promisify } = require('util');
            const execAsync = promisify(exec);
            const filePath = '/tmp/fb_' + Date.now() + '.m4a';
            const { stdout } = await execAsync('yt-dlp --extractor-args "youtube:player_client=android" --dump-json --no-warnings "ytsearch1:' + query + '"', { timeout: 18000 });
            const info = JSON.parse(stdout.trim().split('\n')[0]);
            tituloFinal = info.title || query;
            thumbFinal = info.thumbnail || null;
            canalFinal = info.channel || info.uploader || null;
            duracionFinal = info.duration_string || null;
            vistasFinal = info.view_count || null;
            enlaceFinal = info.webpage_url || null;
            
            await execAsync('yt-dlp --extractor-args "youtube:player_client=android" -f 140/bestaudio[ext=m4a]/bestaudio -o "' + filePath + '" "' + info.webpage_url + '"', { timeout: 18000 });
            if (fs2.existsSync(filePath)) {
              bufferFinal = fs2.readFileSync(filePath);
              fs2.unlinkSync(filePath);
            }
          } catch (e) {}
        }

        if (bufferFinal) {
          const infoExtraFinal = [canalFinal ? '👤 ' + canalFinal : '', duracionFinal ? '⏱️ ' + duracionFinal : '', vistasFinal ? '👁️ ' + Number(vistasFinal).toLocaleString('es-HN') + ' visualizaciones' : '', enlaceFinal ? '🔗 ' + enlaceFinal : ''].filter(Boolean).join('\n');
          const captionInfoFinal = '➩ Audio › *' + tituloFinal + '*' + (infoExtraFinal ? '\n' + infoExtraFinal : '');
          // MENSAJE 1: Foto + Texto
          if (thumbFinal) {
            try {
              await sock.sendMessage(jid, { image: { url: thumbFinal }, caption: captionInfoFinal }, { quoted: m });
            } catch (e) {
              await sock.sendMessage(jid, { text: captionInfoFinal }, { quoted: m });
            }
          } else {
            await sock.sendMessage(jid, { text: captionInfoFinal }, { quoted: m });
          }
          // MENSAJE 2: El Audio
          await sock.sendMessage(jid, { audio: bufferFinal, mimetype: 'audio/mp4' }, { quoted: m });
          
          // Cambiamos la reacción a "Listo"
          try { await sock.sendMessage(jid, { react: { text: '✅', key: m.key } }); } catch (e) {}
        } else {
          await responder('❌ No se pudo descargar el audio.');
          try { await sock.sendMessage(jid, { react: { text: '❌', key: m.key } }); } catch (e) {}
        }
      } catch (e) { console.log('Error play:', e.message); }
      break;
    }

    case 'playvideo': case 'video': case 'v': {
      try {
        const query = cuerpo.slice(cmd.length).trim();
        const conTiempo = (promesa, ms) => new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('Tiempo agotado')), ms);
          Promise.resolve(promesa).then(
            valor => { clearTimeout(timer); resolve(valor); },
            error => { clearTimeout(timer); reject(error); }
          );
        });

        if (!query) { await responder('Uso: #' + cmd + ' <nombre>'); break; }
        
        try { await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } }); } catch (e) {}
        await responder('⏳ Buscando información y preparando tu video...');

        let bufferFinal = null;
        let tituloFinal = query;
        let thumbFinal = null;
        let canalFinal = null;
        let duracionFinal = null;
        let vistasFinal = null;
        let enlaceFinal = null;
        const descargarArchivo = async (url) => {
          const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
          if (!r.ok) throw new Error('HTTP ' + r.status);
          const tipo = (r.headers.get('content-type') || '').toLowerCase();
          if (/text\/html|application\/json/.test(tipo)) throw new Error('Respuesta no válida');
          const b = Buffer.from(await r.arrayBuffer());
          if (b.length < 1024) throw new Error('Archivo vacío o incompleto');
          return b;
        };


        // API 1: Denzy
        try {
          const yt = require('@denzy-official/youtube_scraper');
          const res = await conTiempo(yt.ytmp4(query), 6000);
          if (res && res.download && res.download.url) {
            bufferFinal = await descargarArchivo(res.download.url);
            tituloFinal = (res.metadata && res.metadata.title) ? res.metadata.title : query;
            thumbFinal = res.metadata ? res.metadata.thumbnail : null;
            canalFinal = res.metadata?.author?.name || null;
            duracionFinal = res.metadata?.timestamp || res.metadata?.duration?.timestamp || null;
            vistasFinal = res.metadata?.views || res.metadata?.viewCount || null;
            enlaceFinal = res.metadata?.url || res.metadata?.webpage_url || null;
          }
        } catch (e) {}

        // API 2: ShadowX
        if (!bufferFinal) {
          try {
            const ytdl = require('shadowx-ytdl');
            let enlace = query;
            let video = null;

            if (!/^https?:\/\//i.test(query)) {
              const busqueda = await conTiempo(ytdl.searchYouTube(query), 7000);
              video = busqueda && busqueda.status && Array.isArray(busqueda.results)
                ? busqueda.results.find(v => v.type === 'video' && v.url)
                : null;
              if (video) enlace = video.url;
            }

            if (/^https?:\/\//i.test(enlace)) {
              const res = await conTiempo(ytdl.downloadVideo(enlace, 360), 8000);
              if (res && res.status && res.download && res.download.status && res.download.downloadUrl) {
                bufferFinal = await descargarArchivo(res.download.downloadUrl);
                tituloFinal = (res.metadata && res.metadata.title) || (video && video.title) || query;
                thumbFinal = (res.metadata && res.metadata.thumbnail) || (video && (video.thumbnail || video.image)) || null;
                canalFinal = res.metadata?.author?.name || video?.author?.name || null;
                duracionFinal = res.metadata?.timestamp || video?.timestamp || null;
                vistasFinal = res.metadata?.views || res.metadata?.viewCount || video?.views || video?.viewCount || null;
                enlaceFinal = res.metadata?.url || res.metadata?.webpage_url || video?.url || null;
              }
            }
          } catch (e) { console.log('ShadowX video:', e.message); }
        }
        
        // API 3: yt-dlp
        if (!bufferFinal) {
          try {
            const { exec } = require('child_process');
            const { promisify } = require('util');
            const execAsync = promisify(exec);
            const filePath = '/tmp/fb_v_' + Date.now() + '.mp4';
            const { stdout } = await execAsync('yt-dlp --extractor-args "youtube:player_client=android" --dump-json --no-warnings "ytsearch1:' + query + '"', { timeout: 15000 });
            const info = JSON.parse(stdout.trim().split('\n')[0]);
            tituloFinal = info.title || query;
            thumbFinal = info.thumbnail || null;
            canalFinal = info.channel || info.uploader || null;
            duracionFinal = info.duration_string || null;
            vistasFinal = info.view_count || null;
            enlaceFinal = info.webpage_url || null;
            
            await execAsync('yt-dlp --extractor-args "youtube:player_client=web_embedded,android" -f "bv*+ba/b" --merge-output-format mp4 -o "' + filePath + '" "' + info.webpage_url + '"', { timeout: 40000 });
            if (require('fs').existsSync(filePath)) {
              bufferFinal = require('fs').readFileSync(filePath);
              require('fs').unlinkSync(filePath);
            }
          } catch (e) {}
        }

        if (bufferFinal) {
          const infoExtraFinal = [canalFinal ? '👤 ' + canalFinal : '', duracionFinal ? '⏱️ ' + duracionFinal : '', vistasFinal ? '👁️ ' + Number(vistasFinal).toLocaleString('es-HN') + ' visualizaciones' : '', enlaceFinal ? '🔗 ' + enlaceFinal : ''].filter(Boolean).join('\n');
          const captionInfoFinal = '➩ Video › *' + tituloFinal + '*' + (infoExtraFinal ? '\n' + infoExtraFinal : '');
          if (thumbFinal) {
            try {
              await sock.sendMessage(jid, { image: { url: thumbFinal }, caption: captionInfoFinal }, { quoted: m });
            } catch (e) {
              await sock.sendMessage(jid, { text: captionInfoFinal }, { quoted: m });
            }
          } else {
            await sock.sendMessage(jid, { text: captionInfoFinal }, { quoted: m });
          }
          await sock.sendMessage(jid, { video: bufferFinal, caption: '✅ ' + tituloFinal + (infoExtraFinal ? '\\n' + infoExtraFinal : '') }, { quoted: m });
          try { await sock.sendMessage(jid, { react: { text: '✅', key: m.key } }); } catch (e) {}
        } else {
          await responder('❌ No se pudo descargar el video.');
          try { await sock.sendMessage(jid, { react: { text: '❌', key: m.key } }); } catch (e) {}
        }
      } catch (e) { console.log('Error video:', e.message); }
      break;
    }
    
    case 'ytsearch': {
      try {
        const query = cuerpo.slice(cmd.length).trim();
        const conTiempo = (promesa, ms) => new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('Tiempo agotado')), ms);
          Promise.resolve(promesa).then(
            valor => { clearTimeout(timer); resolve(valor); },
            error => { clearTimeout(timer); reject(error); }
          );
        });

        if (!query) { await responder('Uso: #ytsearch <búsqueda>'); break; }
        
        try { await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } }); } catch (e) {}
        
        const Youtube = require('youtube-search-api');
        const results = await Youtube.GetListByKeyword(query, false, 5);
        
        if (!results.items || results.items.length === 0) {
          await responder('❌ No encontré resultados.');
          break;
        }
        
        let txt = '🔍 *Resultados para:* ' + query + '\n\n';
        for (let i = 0; i < results.items.length; i++) {
          let v = results.items[i];
          txt += '*' + (i+1) + '. ' + v.title + '*\n';
          txt += '👤 ' + (v.channelTitle || 'Desconocido') + '\n';
          txt += '🔗 https://www.youtube.com/watch?v=' + v.id + '\n\n';
        }
        await sock.sendMessage(jid, { text: txt }, { quoted: m });
        try { await sock.sendMessage(jid, { react: { text: '✅', key: m.key } }); } catch (e) {}
      } catch (e) { await responder('❌ Error al buscar.'); }
      break;
    }



    // ==========================================
    // SISTEMA DE DESCARGA CON MÚLTIPLES APIS
    // ==========================================
    case 'novedad': case 'anuncio': {
      try {
        if (!esDueno(m)) { await responder('❌ Solo el dueño puede usar este comando.'); break; }
        const texto = cuerpo.slice(cmd.length).trim();
        if (!texto) { await responder('Uso: #novedad <mensaje>\nEjemplo: #novedad Se arregló Spotify.'); break; }
        
        const txt = '📢 *NUEVA ACTUALIZACIÓN* 📢\n\n' + texto + '\n\n_Revisa el menú para más detalles._';
        await sock.sendMessage(jid, { text: txt }, { quoted: m });
      } catch (e) {
        console.log('Error en novedad:', e.message);
      }
      break;
    }
    // ==========================================


case 'config': {
  try {
    if (!global.filtrosConfig) {
      global.filtrosConfig = { antiPorno: false, antiaudio: false, antivideos: false, antisticker: false, antispam: false, antibots: false, antiestafas: false };
    }
    const args = cuerpo.slice(cmd.length).trim();
    const f = global.filtrosConfig;
    if (args) {
      const num = parseInt(args);
      if (num === 1) f.antiPorno = !f.antiPorno;
      else if (num === 2) f.antiaudio = !f.antiaudio;
      else if (num === 3) f.antivideos = !f.antivideos;
      else if (num === 4) f.antisticker = !f.antisticker;
      else if (num === 5) f.antispam = !f.antispam;
      else if (num === 6) f.antibots = !f.antibots;
      else if (num === 7) f.antiestafas = !f.antiestafas;
      else { await responder('❌ Usa números del 1 al 7.'); break; }
    }
    const on = '✅ ON'; const off = '❌ OFF';
    let txt = '⚙️ *CONFIGURACIÓN*\n\n';
    txt += '*1.* 🔞 Antiporno: ' + (f.antiPorno ? on : off) + '\n';
    txt += '*2.* 🔇 Antiaudio: ' + (f.antiaudio ? on : off) + '\n';
    txt += '*3.* 🎬 Antivideos: ' + (f.antivideos ? on : off) + '\n';
    txt += '*4.* 🎨 Antisticker: ' + (f.antisticker ? on : off) + '\n';
    txt += '*5.* 📵 Antispam: ' + (f.antispam ? on : off) + '\n';
    txt += '*6.* 🤖 Antibots: ' + (f.antibots ? on : off) + '\n';
    txt += '*7.* ⚠️ Antiestafas: ' + (f.antiestafas ? on : off) + '\n\n';
    txt += '💡 Envía #config 1 para cambiar.';
    await responder(txt);
  } catch (e) { await responder('❌ Error en config.'); }
  break;
}

case 'racha': case 'rc': {
  const sender = m.key.participant || m.key.remoteJid;
  const mencionado = (m.message?.extendedTextMessage?.contextInfo?.mentionedJid || [])[0] || m.message?.extendedTextMessage?.contextInfo?.participant;
  if (!mencionado) { await responder('❌ Menciona o responde a alguien para invitar a una racha.'); break; }
  if (mencionado === sender) { await responder('❌ No puedes hacerte una racha a ti mismo.'); break; }
  
  const db = getRachaDB();
  const id = [sender, mencionado].sort().join('|');
  if (db[id]) { await responder('❌ Ya tienen una racha activa. Usen #miracha para verla.'); break; }
  
  db[id] = { users: [sender, mencionado], dias: 0, record: 0, lastTime: Date.now(), pendiente: true, invitador: sender };
  saveRachaDB(db);
  
  await sock.sendMessage(jid, { text: `🔥 @${sender.split('@')[0]} te ha invitado a una racha de amistad.\n\nResponde con *#aceptarracha* para aceptar.`, mentions: [sender, mencionado] }, { quoted: m });
  break;
}
case 'aceptarracha': case 'ar': {
  const sender = m.key.participant || m.key.remoteJid;
  const db = getRachaDB();
  let encontrada = false;
  
  for (const id in db) {
    const r = db[id];
    if (r.pendiente && r.users.includes(sender) && r.invitador !== sender) {
      r.pendiente = false;
      r.dias = 1;
      r.record = 1;
      r.lastTime = Date.now();
      saveRachaDB(db);
      encontrada = true;
      const otro = r.users.find(u => u !== sender);
      await sock.sendMessage(jid, { text: `🔥 ¡Racha iniciada! @${sender.split('@')[0]} y @${otro.split('@')[0]} ahora tienen 1 día de racha.`, mentions: r.users }, { quoted: m });
      break;
    }
  }
  if (!encontrada) await responder('❌ No tienes invitaciones pendientes.');
  break;
}
case 'miracha': case 'mr': {
  const sender = m.key.participant || m.key.remoteJid;
  const db = getRachaDB();
  let txt = '';
  
  for (const id in db) {
    const r = db[id];
    if (r.users.includes(sender) && !r.pendiente) {
      const horasPasadas = (Date.now() - r.lastTime) / (1000 * 60 * 60);
      if (horasPasadas >= 24) {
        r.dias++;
        if (r.dias > r.record) r.record = r.dias;
        r.lastTime = Date.now();
        saveRachaDB(db);
      }
      
      const otro = r.users.find(u => u !== sender);
      const tier = getTierRacha(r.dias);
      const tiempoRestante = 24 - Math.floor((Date.now() - r.lastTime) / (1000 * 60 * 60));
      
      txt += `╭━━〔 🔥 RACHA DE AMISTAD 〕
┃ 👤 *Con:* @${otro.split('@')[0]}
┃ 📅 *Días:* ${r.dias}
┃ 🏆 *Récord:* ${r.record}
┃ ${tier.emoji} *Nivel:* ${tier.nombre}
┃ ⏳ *Tiempo restante:* ${tiempoRestante > 0 ? tiempoRestante + ' horas' : '¡En peligro!'}
╰━━━━━━━━━━━━━━━━━━\n\n`;
    }
  }
  
  if (!txt) {
    await responder('❌ No tienes ninguna racha activa.\nInvita a alguien con #racha @usuario');
  } else {
    await sock.sendMessage(jid, { text: txt }, { quoted: m });
  }
  break;
}
case 'rechazarracha': case 'rr': {
  const sender = m.key.participant || m.key.remoteJid;
  const db = getRachaDB();
  let rechazada = false;
  
  for (const id in db) {
    const r = db[id];
    if (r.pendiente && r.users.includes(sender) && r.invitador !== sender) {
      delete db[id];
      saveRachaDB(db);
      rechazada = true;
      await responder('🗑️ Has rechazado la invitación a la racha.');
      break;
    }
  }
  if (!rechazada) await responder('❌ No tienes invitaciones pendientes.');
  break;
}
case 'desactivarracha': case 'dr': {
  const sender = m.key.participant || m.key.remoteJid;
  const db = getRachaDB();
  let eliminada = false;
  
  for (const id in db) {
    if (db[id].users.includes(sender)) {
      delete db[id];
      saveRachaDB(db);
      eliminada = true;
    }
  }
  
  if (eliminada) await responder('💔 Has eliminado tu racha de amistad.');
  else await responder('❌ No tienes ninguna racha activa.');
  break;
}
case 'menu': {
    const filtro = cuerpo.slice(cmd.length).trim();

        const quien = m.key.participant || m.key.remoteJid
        const tag = '@' + quien.split('@')[0].split(':')[0]
        const saludo = `Hola ${tag}, soy ${leerConfig().nombre || 'Shisui Bot'} 🤖`
        if (fs.existsSync('./foto.jpg')) {
          await sock.sendMessage(jid, { image: fs.readFileSync('./foto.jpg'), caption: saludo + '\n\n' + menuActual(nsfwActivo(jid, filtro), filtro), mentions: [quien] }, { quoted: m })
        } else {
          await sock.sendMessage(jid, { text: saludo + '\n\n' + menuActual(nsfwActivo(jid, filtro), filtro), mentions: [quien] }, { quoted: m })
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

      case 'buscar':
case 'buscartt': {
  const consulta = cuerpo.slice(cmd.length).trim()
  if (!consulta) {
    await responder('Uso: .buscar <tema>\nEjemplo: .buscar baile de moda')
    break
  }

  const apiKey = process.env.SOCIALCRAWL_API_KEY
  if (!apiKey) {
    await responder('❌ No está configurada la API de SocialCrawl.')
    break
  }

  const propietario = esDueno(m)
  const remitente = m.key.participantAlt || m.key.participant ||
    m.key.remoteJidAlt || m.key.remoteJid
  const idUsuario = String(remitente || '').split('@')[0]
    .split(':')[0].replace(/\D/g, '')

  if (!propietario && !idUsuario) {
    await responder('❌ No pude identificar tu cuenta para aplicar el límite.')
    break
  }

  const archivoLimites = path.join(__dirname, 'buscar-limites.json')
  let limites = {}
  try {
    limites = JSON.parse(fs.readFileSync(archivoLimites, 'utf8'))
    if (!limites || typeof limites !== 'object' || Array.isArray(limites)) limites = {}
  } catch {}

  const usados = Number(limites[idUsuario] || 0)
  if (!propietario && usados >= 2) {
    await responder('⛔ Ya utilizaste tus 2 búsquedas de TikTok permitidas.')
    break
  }

  if (!propietario) {
    limites[idUsuario] = usados + 1
    fs.writeFileSync(archivoLimites, JSON.stringify(limites, null, 2))
  }

  let busquedaCobro = false
  try {
    await responder('🔎 Buscando 2 videos de TikTok sobre: ' + consulta)

    const urlApi = new URL('https://www.socialcrawl.dev/v1/tiktok/search')
    urlApi.searchParams.set('query', consulta)
    urlApi.searchParams.set('limit', '2')
    urlApi.searchParams.set('sort_by', 'relevance')

    const respuestaApi = await fetch(urlApi, {
      headers: { 'x-api-key': apiKey, 'Accept': 'application/json' },
      signal: AbortSignal.timeout(45000)
    })

    const datosApi = await respuestaApi.json()
    if (!respuestaApi.ok || datosApi.success === false) {
      throw new Error(datosApi.error?.message || datosApi.message || 'Error HTTP ' + respuestaApi.status)
    }

    busquedaCobro = true
    const resultados = datosApi.data?.items || datosApi.items || []

    if (!Array.isArray(resultados) || resultados.length === 0) {
      await responder('❌ No encontré videos para esa búsqueda.')
      break
    }

    const tareas = resultados.slice(0, 2).map(async (elemento) => {
      try {
        const post = elemento.post || elemento
        const enlace = post.url || post.share_url || post.web_url || post.video_url || elemento.url

        if (!enlace || !/^https?:\/\//i.test(enlace)) return null

        const descarga = await descargar('video', enlace, null, null)
        if (!descarga?.ok || !descarga.url) return null

        const buffer = await bajarMedia(descarga.url)
        if (!buffer || !buffer.length) return null

        const autor = post.author?.username || post.author?.nickname || 'TikTok'
        const descripcion = String(post.caption || post.description || post.text || consulta).slice(0, 500)
        const vistas = post.play_count ?? post.statistics?.play_count
        const duracion = post.duration

        let caption = '🎬 ' + descripcion + '\\n👤 ' + autor
        if (typeof duracion === 'number') caption += '\\n⏱️ Duración: ' + duracion + ' s'
        if (typeof vistas === 'number') caption += '\\n👁️ Vistas: ' + vistas.toLocaleString('en-US')
        caption += '\\n🔗 ' + enlace

        return { buffer, caption }
      } catch (errorVideo) {
        console.log('Error descargando resultado de .buscar:', errorVideo.message)
        return null
      }
    })

    const descargados = await Promise.all(tareas)
    const enviados = descargados.filter(Boolean)

    for (const resultado of enviados) {
      await sock.sendMessage(jid, {
        video: resultado.buffer,
        caption: resultado.caption
      }, { quoted: m })
    }

    if (enviados.length === 0) {
      await responder('❌ Encontré resultados, pero no pude descargar sus videos.')
    } else if (enviados.length === 1) {
      await responder('⚠️ Solo pude enviar 1 de los 2 videos encontrados.')
    }
  } catch (error) {
    if (!busquedaCobro && !propietario) {
      limites[idUsuario] = usados
      if (usados === 0) delete limites[idUsuario]
      try { fs.writeFileSync(archivoLimites, JSON.stringify(limites, null, 2)) } catch {}
    }
    console.log('Error en .buscar (SocialCrawl):', error.message)
    await responder('❌ No pude completar la búsqueda. Intenta más tarde.')
  }
  break
}
case 'invitar':
case 'invitacion': {
  const enlace = cuerpo.slice(cmd.length).trim()
  if (!enlace) {
    await responder('Uso: #invitar <enlace>\nEjemplos:\n#invitar https://chat.whatsapp.com/XXXXX\n#invitar https://whatsapp.com/channel/XXXXX')
    break
  }
  const matchGrupo = enlace.match(/chat\.whatsapp\.com\/([A-Za-z0-9]+)/)
  const matchCanal = enlace.match(/whatsapp\.com\/channel\/([A-Za-z0-9]+)/)
  if (!matchGrupo && !matchCanal) {
    await responder('❌ Enlace no válido. Debe ser de grupo (chat.whatsapp.com/...) o canal (whatsapp.com/channel/...).')
    break
  }
  const tipo = matchGrupo ? 'grupo' : 'canal'
  const codigo = matchGrupo ? matchGrupo[1] : matchCanal[1]
  const id = ++contadorInvitaciones
  const remitente = (m.key.participant || m.key.remoteJid || '').split('@')[0].split(':')[0].replace(/[^0-9]/g, '')
  invitacionesPendientes.set(id, { tipo, codigo, enlace, remitente, jid: m.key.remoteJid })
  await responder('📨 Solicitud #' + id + ' enviada al dueño del bot. Te aviso cuando responda.')
  const OWNERS = ['50493482934', '50494874330', '50495939120']
  for (const num of OWNERS) {
    const ownerJid = num + '@s.whatsapp.net'
    try {
      await sock.sendMessage(ownerJid, {
        text: '📩 *Solicitud de invitación #' + id + '*\n\n' +
              '👤 De: +' + remitente + '\n' +
              '📋 Tipo: ' + tipo + '\n' +
              '🔗 ' + enlace + '\n\n' +
              'Responde:\n*#aceptarinv ' + id + '* para unirme\n*#rechazarinv ' + id + '* para rechazar'
      })
    } catch (e) {
      console.log('No se pudo notificar al owner ' + num + ':', e.message)
    }
  }
  break
}
case 'aceptarinv':
case 'rechazarinv': {
  const OWNERS = ['50493482934', '50494874330', '50495939120']
  const remitente = (m.key.participant || m.key.remoteJid || '').split('@')[0].split(':')[0].replace(/[^0-9]/g, '')
  const esOwner = OWNERS.some(n => remitente.includes(n))
  if (!esOwner) {
    await responder('❌ Solo el owner del bot puede aceptar o rechazar invitaciones.')
    break
  }
  const idStr = cuerpo.slice(cmd.length).trim()
  const id = parseInt(idStr, 10)
  if (!id || !invitacionesPendientes.has(id)) {
    await responder('❌ No hay solicitud con ID ' + idStr + '. Revisa el número.')
    break
  }
  const sol = invitacionesPendientes.get(id)
  invitacionesPendientes.delete(id)
  if (cmd === 'rechazarinv') {
    await responder('🗑️ Solicitud #' + id + ' rechazada.')
    try { await sock.sendMessage(sol.jid, { text: '❌ El dueño rechazó la invitación #' + id + '.' }) } catch (e) {}
    break
  }
  if (sol.tipo === 'grupo') {
    try {
      await sock.groupAcceptInvite(sol.codigo)
      await responder('✅ Aceptada #' + id + '. Ya estoy en el grupo.')
      try { await sock.sendMessage(sol.jid, { text: '✅ El dueño aceptó. El bot se unió al grupo.' }) } catch (e) {}
    } catch (e) {
      await responder('❌ No pude unirme: ' + e.message)
    }
  } else {
    const jidCanal = sol.codigo + '@newsletter'
    try {
      if (typeof sock.newsletterFollow === 'function') {
        await sock.newsletterFollow(jidCanal)
      } else if (typeof sock.subscribeNewsletter === 'function') {
        await sock.subscribeNewsletter(jidCanal)
      } else {
        throw new Error('Tu Baileys no soporta seguir canales.')
      }
      await responder('✅ Aceptada #' + id + '. Ahora sigo el canal.')
      try { await sock.sendMessage(sol.jid, { text: '✅ El dueño aceptó. El bot sigue el canal.' }) } catch (e) {}
    } catch (e) {
      await responder('❌ No pude seguir el canal: ' + e.message)
    }
  }
  break
}

case 'robloxuser': {
  const nombre = cuerpo.slice(cmd.length).trim()
  if (!nombre) {
    await responder('Uso: #robloxuser <nombre>\nEjemplo: #robloxuser Roblox')
    break
  }
  await responder('🔎 Buscando usuario de Roblox: ' + nombre + '...')
  try {
    const idRes = await fetch('https://users.roblox.com/v1/usernames/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usernames: [nombre], excludeBannedUsers: false })
    })
    const idData = await idRes.json()
    if (!idData.data || !idData.data[0]) {
      await responder('❌ No encontré ese usuario en Roblox.')
      break
    }
    const userId = idData.data[0].id
    const infoRes = await fetch(`https://users.roblox.com/v1/users/${userId}`)
    const info = await infoRes.json()
    const creado = new Date(info.created).toLocaleDateString('es-HN')
    const caption = `👤 *${info.displayName}* (@${info.name})\n🆔 ID: ${info.id}\n📅 Creado: ${creado}\n📝 Bio: ${info.description || 'Sin descripción'}`
    await sock.sendMessage(jid, { text: caption }, { quoted: m })
  } catch (e) {
    console.log('Error .robloxuser:', e.message)
    await responder('❌ Error al buscar el usuario.')
  }
  break
}
case 'robloxavatar': {
  const nombre = cuerpo.slice(cmd.length).trim()
  if (!nombre) {
    await responder('Uso: #robloxavatar <nombre>\nEjemplo: #robloxavatar Roblox')
    break
  }
  await responder('🖼️ Buscando skin de: ' + nombre + '...')
  try {
    const idRes = await fetch('https://users.roblox.com/v1/usernames/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usernames: [nombre], excludeBannedUsers: false })
    })
    const idData = await idRes.json()
    if (!idData.data || !idData.data[0]) {
      await responder('❌ No encontré ese usuario.')
      break
    }
    const userId = idData.data[0].id
    const thumbRes = await fetch(`https://thumbnails.roblox.com/v1/users/avatar?userIds=${userId}&size=720x720&format=Png&isCircular=false`)
    const thumbData = await thumbRes.json()
    if (!thumbData.data || !thumbData.data[0] || !thumbData.data[0].imageUrl) {
      await responder('❌ No se pudo obtener la skin.')
      break
    }
    await sock.sendMessage(jid, { image: { url: thumbData.data[0].imageUrl }, caption: `🖼️ Skin de *${nombre}*` }, { quoted: m })
  } catch (e) {
    console.log('Error .robloxavatar:', e.message)
    await responder('❌ Error al obtener la skin.')
  }
  break
}
case 'robloxgroups': {
  const nombre = cuerpo.slice(cmd.length).trim()
  if (!nombre) {
    await responder('Uso: #robloxgroups <nombre>')
    break
  }
  await responder('👥 Buscando grupos de: ' + nombre + '...')
  try {
    const idRes = await fetch('https://users.roblox.com/v1/usernames/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usernames: [nombre], excludeBannedUsers: false })
    })
    const idData = await idRes.json()
    if (!idData.data || !idData.data[0]) {
      await responder('❌ Usuario no encontrado.')
      break
    }
    const userId = idData.data[0].id
    const groupsRes = await fetch(`https://groups.roblox.com/v1/users/${userId}/groups/roles`)
    const groupsData = await groupsRes.json()
    const grupos = groupsData.data || []
    if (grupos.length === 0) {
      await responder('ℹ️ Este usuario no está en ningún grupo.')
      break
    }
    let lista = '👥 *Grupos de ' + nombre + ':*\n\n'
    grupos.slice(0, 10).forEach(g => {
      lista += `• *${g.group.name}* (Rango: ${g.role.name})\n`
    })
    if (grupos.length > 10) lista += `\n... y ${grupos.length - 10} más.`
    await sock.sendMessage(jid, { text: lista }, { quoted: m })
  } catch (e) {
    console.log('Error .robloxgroups:', e.message)
    await responder('❌ Error al buscar grupos.')
  }
  break
}
case 'robloxgame': {
  const nombre = cuerpo.slice(cmd.length).trim()
  if (!nombre) {
    await responder('Uso: #robloxgame <nombre del juego>\\nEjemplo: #robloxgame Blox Fruits')
    break
  }
  await responder('🎮 Buscando juego: ' + nombre + '...')
  try {
    // Usamos 'pageType=all' y un 'sessionId' para que la API de Roblox responda correctamente
    const url = `https://apis.roblox.com/search-api/omni-search?searchQuery=${encodeURIComponent(nombre)}&pageType=all&sessionId=0`
    const res = await fetch(url)
    const data = await res.json()

    // La API devuelve los resultados en 'searchResults[0].contents'
    const resultados = data.searchResults?.[0]?.contents || []
    const juego = resultados.find(r => r.name)

    if (!juego) {
      await responder('❌ No encontré ese juego. Prueba con el nombre exacto.')
      break
    }

    const caption = `🎮 *${juego.name}*\\n` +
                    `🆔 Universe ID: ${juego.id || juego.universeId}\\n` +
                    `👤 Creador: ${juego.creatorName || 'Desconocido'}\\n` +
                    `📊 Visitas: ${(juego.playerCount || juego.visits || 0).toLocaleString()}\\n` +
                    `🔗 https://www.roblox.com/games/${juego.id}`

    await sock.sendMessage(jid, { text: caption }, { quoted: m })
  } catch (e) {
    console.log('Error .robloxgame:', e.message)
    await responder('❌ Error al buscar el juego.')
  }
  break
}
case 'robloxplayers': {
  const idStr = cuerpo.slice(cmd.length).trim()
  if (!idStr) {
    await responder('Uso: #robloxplayers <Universe ID>\nEjemplo: #robloxplayers 123456')
    break
  }
  await responder('📊 Consultando jugadores...')
  try {
    const res = await fetch(`https://games.roblox.com/v1/games?universeIds=${idStr}`)
    const data = await res.json()
    if (!data.data || data.data.length === 0) {
      await responder('❌ No encontré ese juego.')
      break
    }
    const juego = data.data[0]
    const caption = `🎮 *${juego.name}*\n👥 Jugadores ahora: ${juego.playing.toLocaleString()}\n📈 Visitas totales: ${juego.visits.toLocaleString()}`
    await sock.sendMessage(jid, { text: caption }, { quoted: m })
  } catch (e) {
    console.log('Error .robloxplayers:', e.message)
    await responder('❌ Error al consultar jugadores.')
  }
  break
}
case 'robloxbadges': {
  const nombre = cuerpo.slice(cmd.length).trim()
  if (!nombre) {
    await responder('Uso: #robloxbadges <nombre>')
    break
  }
  await responder('🏅 Buscando insignias de: ' + nombre + '...')
  try {
    const idRes = await fetch('https://users.roblox.com/v1/usernames/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usernames: [nombre], excludeBannedUsers: false })
    })
    const idData = await idRes.json()
    if (!idData.data || !idData.data[0]) {
      await responder('❌ Usuario no encontrado.')
      break
    }
    const userId = idData.data[0].id
    const badgesRes = await fetch(`https://badges.roblox.com/v1/users/${userId}/badges?limit=10&sortOrder=Desc`)
    const badgesData = await badgesRes.json()
    const badges = badgesData.data || []
    if (badges.length === 0) {
      await responder('ℹ️ Este usuario no tiene insignias públicas.')
      break
    }
    let lista = '🏅 *Insignias de ' + nombre + ':*\n\n'
    badges.forEach(b => {
      lista += `• ${b.name}\n`
    })
    await sock.sendMessage(jid, { text: lista }, { quoted: m })
  } catch (e) {
    console.log('Error .robloxbadges:', e.message)
    await responder('❌ Error al buscar insignias.')
  }
  break
}
case 'robloxfriends': {
  const nombre = cuerpo.slice(cmd.length).trim()
  if (!nombre) {
    await responder('Uso: #robloxfriends <nombre>')
    break
  }
  await responder('👫 Buscando amigos de: ' + nombre + '...')
  try {
    const idRes = await fetch('https://users.roblox.com/v1/usernames/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usernames: [nombre], excludeBannedUsers: false })
    })
    const idData = await idRes.json()
    if (!idData.data || !idData.data[0]) {
      await responder('❌ Usuario no encontrado.')
      break
    }
    const userId = idData.data[0].id
    const friendsRes = await fetch(`https://friends.roblox.com/v1/users/${userId}/friends`)
    const friendsData = await friendsRes.json()
    const friends = friendsData.data || []
    if (friends.length === 0) {
      await responder('ℹ️ Este usuario no tiene amigos públicos.')
      break
    }
    let lista = '👫 *Amigos de ' + nombre + ':*\n\n'
    friends.slice(0, 10).forEach(f => {
      lista += `• ${f.name} (${f.displayName})\n`
    })
    if (friends.length > 10) lista += `\n... y ${friends.length - 10} más.`
    await sock.sendMessage(jid, { text: lista }, { quoted: m })
  } catch (e) {
    console.log('Error .robloxfriends:', e.message)
    await responder('❌ Error al buscar amigos.')
  }
  break
}
case 'robloxfollowers': {
  const nombre = cuerpo.slice(cmd.length).trim()
  if (!nombre) {
    await responder('Uso: #robloxfollowers <nombre>')
    break
  }
  await responder('📊 Consultando seguidores de: ' + nombre + '...')
  try {
    const idRes = await fetch('https://users.roblox.com/v1/usernames/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usernames: [nombre], excludeBannedUsers: false })
    })
    const idData = await idRes.json()
    if (!idData.data || !idData.data[0]) {
      await responder('❌ Usuario no encontrado.')
      break
    }
    const userId = idData.data[0].id
    const followersRes = await fetch(`https://friends.roblox.com/v1/users/${userId}/followers/count`)
    const followersData = await followersRes.json()
    await responder(`👥 *${nombre}* tiene *${followersData.count.toLocaleString()}* seguidores.`)
  } catch (e) {
    console.log('Error .robloxfollowers:', e.message)
    await responder('❌ Error al consultar seguidores.')
  }
  break
}
case 'robloxstatus': {
  const nombre = cuerpo.slice(cmd.length).trim()
  if (!nombre) {
    await responder('Uso: #robloxstatus <nombre>\\nEjemplo: #robloxstatus Roblox')
    break
  }
  await responder('🔍 Consultando estado de: ' + nombre + '...')
  try {
    // 1. Obtener el ID del usuario
    const idRes = await fetch('https://users.roblox.com/v1/usernames/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usernames: [nombre], excludeBannedUsers: false })
    })
    const idData = await idRes.json()
    if (!idData.data || !idData.data[0]) {
      await responder('❌ Usuario no encontrado.')
      break
    }
    const userId = idData.data[0].id

    // 2. Obtener detalles del perfil (bio, fecha de creación, etc.)
    const infoRes = await fetch(`https://users.roblox.com/v1/users/${userId}`)
    const info = await infoRes.json()

    // 3. Obtener foto de perfil (headshot)
    const thumbRes = await fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=420x420&format=Png&isCircular=false`)
    const thumbData = await thumbRes.json()
    const avatarUrl = thumbData.data && thumbData.data[0] ? thumbData.data[0].imageUrl : null

    // 4. Obtener seguidores y amigos (si la API responde)
    let seguidores = 'N/A'
    let amigos = 'N/A'
    try {
      const [followRes, friendRes] = await Promise.all([
        fetch(`https://friends.roblox.com/v1/users/${userId}/followers/count`),
        fetch(`https://friends.roblox.com/v1/users/${userId}/friends/count`)
      ])
      if (followRes.ok) { const fData = await followRes.json(); seguidores = fData.count?.toLocaleString() || '0' }
      if (friendRes.ok) { const aData = await friendRes.json(); amigos = aData.count?.toLocaleString() || '0' }
    } catch (e) { /* Silencioso si falla la API social */ }

    const estado = info.isBanned ? '❌ Baneado' : '✅ Activo'
    const premium = info.isPremium ? '⭐ Premium' : 'No'
    const creado = new Date(info.created).toLocaleDateString('es-HN')
    const bio = info.description ? info.description.substring(0, 80).replace(/\n/g, ' ') : 'Sin descripción'

    const caption = `👤 *${info.displayName}* (@${info.name})\\n` +
                    `🆔 ID: ${info.id}\\n` +
                    `📊 Estado: ${estado}\\n` +
                    `⭐ Premium: ${premium}\\n` +
                    `📅 Creado: ${creado}\\n` +
                    `👥 Amigos: ${amigos}\\n` +
                    `👣 Seguidores: ${seguidores}\\n` +
                    `📝 Bio: ${bio}`

    if (avatarUrl) {
      await sock.sendMessage(jid, { image: { url: avatarUrl }, caption }, { quoted: m })
    } else {
      await sock.sendMessage(jid, { text: caption }, { quoted: m })
    }
  } catch (e) {
    console.log('Error .robloxstatus:', e.message)
    await responder('❌ Error al consultar el estado.')
  }
  break
}
case 'robloxrandom': {
  await responder('🎲 Obteniendo un juego aleatorio de Roblox...')
  try {
    const res = await fetch('https://games.roblox.com/v1/games/list?model.sortToken=&model.maxRows=10')
    const data = await res.json()
    if (!data.games || data.games.length === 0) {
      await responder('❌ No se pudo obtener un juego aleatorio.')
      break
    }
    const juego = data.games[Math.floor(Math.random() * data.games.length)]
    const caption = `🎲 *Juego aleatorio:*\n\n🎮 *${juego.name}*\n🆔 Place ID: ${juego.placeId}\n👤 Creador: ${juego.creatorName}\n📊 Visitas: ${juego.visits.toLocaleString()}`
    await sock.sendMessage(jid, { text: caption }, { quoted: m })
  } catch (e) {
    console.log('Error .robloxrandom:', e.message)
    await responder('❌ Error al obtener juego aleatorio.')
  }
  break
}

case 'antiaudio': case 'aa':
case 'antivideos': case 'av':
case 'antisticker': case 'as':
case 'antispam': case 'aspam':
case 'antibots': case 'ab':
case 'antiestafas': case 'ae': {
  const mapaAnti = {
    antiaudio: 'antiaudio', aa: 'antiaudio',
    antivideos: 'antivideos', av: 'antivideos',
    antisticker: 'antisticker', as: 'antisticker',
    antispam: 'antispam', aspam: 'antispam',
    antibots: 'antibots', ab: 'antibots',
    antiestafas: 'antiestafas', ae: 'antiestafas'
  }
  const emojiAnti = { antiaudio: '🔇', antivideos: '🎬', antisticker: '🎨', antispam: '📵', antibots: '🤖', antiestafas: '⚠️' }
  const flag = mapaAnti[cmd]
  const arg = cuerpo.slice(cmd.length).trim().toLowerCase()
  if (arg === 'on') {
    global[flag] = true
    await responder(emojiAnti[flag] + ' ' + flag.toUpperCase() + ' ACTIVADO.')
  } else if (arg === 'off') {
    global[flag] = false
    await responder(emojiAnti[flag] + ' ' + flag.toUpperCase() + ' DESACTIVADO.')
  } else {
    const estado = global[flag] ? '✅ ON' : '❌ OFF'
    await responder('Uso: #' + cmd + ' on/off\nEstado actual: ' + estado)
  }
  break
}
case 'antistatus': {
  const lista = [
    ['🔇 AntiAudio', global.antiaudio],
    ['🎬 AntiVideos', global.antivideos],
    ['🎨 AntiSticker', global.antisticker],
    ['📵 AntiSpam', global.antispam],
    ['🤖 AntiBots', global.antibots],
    ['⚠️ AntiEstafas', global.antiestafas],
    ['🔞 AntiPorno', global.antiPorno]
  ]
  let txt = '🛡️ *Estado de filtros:*\n\n'
  for (const [n, a] of lista) txt += n + ': ' + (a ? '✅ ON' : '❌ OFF') + '\n'
  await responder(txt)
  break
}

case 'hug': case 'h':
case 'kiss': case 'k':
case 'pat': case 'pt':
case 'slap': case 'sl':
case 'punch': case 'pu':
case 'patear': case 'patada':
case 'poke': case 'pk':
case 'tickle': case 'tk':
case 'cuddle': case 'cd':
case 'bite': case 'bt':
case 'feed': case 'fd':
case 'nom': case 'nm':
case 'smile': case 'sm':
case 'wink': case 'wn':
case 'blush': case 'bl':
case 'smug': case 'sg':
case 'happy': case 'hp':
case 'angry': case 'an':
case 'bored': case 'bd':
case 'cry': case 'cr':
case 'laugh': case 'lf':
case 'pout': case 'po':
case 'baka': case 'bk':
case 'bonk': case 'bn':
case 'wave': case 'wv':
case 'nod': case 'nd':
case 'shrug': case 'sr':
case 'nope': case 'np':
case 'thumbsup': case 'tu':
case 'handshake': case 'hs':
case 'handhold': case 'hh':
case 'highfive': case 'hf':
case 'dance': case 'dn':
case 'run': case 'rn':
case 'sleep': case 'zz':
case 'yawn': case 'yn':
case 'lurk': case 'lk':
case 'stare': case 'st':
case 'think': case 'th':
case 'facepalm': case 'fp':
case 'tableflip': case 'tf':
case 'shoot': case 'sh':
case 'yeet': case 'yt':
case 'peck': case 'pc':
{
  let mencionado = (m.message?.extendedTextMessage?.contextInfo?.mentionedJid || [])[0];
  const citado = m.message?.extendedTextMessage?.contextInfo?.participant;
  if (!mencionado && citado) {
    mencionado = citado; // Si responde a un mensaje, usa al autor del mensaje
  }
  if (!mencionado) {
    await responder('❌ Menciona a alguien o responde a su mensaje. Ejemplo: #hug @usuario o (responde) #hug');
    break;
  }
  await enviarStickerAnime(cmd, jid, m, sock, mencionado);
  break;
}
case 'gay':
case 'feo':
case 'rankbromistas':
case 'rankgay':
case 'ranklindo':
case 'rankcornudos':
case 'ranknazis':
case 'rankotaku':
case 'ranklesbianas':
case 'rankinfieles':
case 'rankfieles':
case 'ranktherian':
{
  const mencionado = (m.message?.extendedTextMessage?.contextInfo?.mentionedJid || [])[0];
  const objetivo = mencionado || (m.key.participant || m.key.remoteJid);
  const nombre = objetivo.split('@')[0];
  if (cmd.startsWith('rank')) {
    // Ranking grupal ficticio basado en hash de cada miembro
    try {
      const meta = await sock.groupMetadata(jid);
      const lista = meta.participants.map(p => ({
        id: p.id,
        num: p.id.split('@')[0],
        pct: calcularPorcentaje(cmd, p.id)
      })).sort((a,b) => b.pct - a.pct).slice(0,5);
      let txt = '🏆 *' + cmd.replace('rank','').toUpperCase() + ' — TOP 5*\n\n';
      lista.forEach((u,i) => {
        txt += (i+1) + '. @' + u.num + ' — ' + u.pct + '%\n';
      });
      await sock.sendMessage(jid, { text: txt, mentions: lista.map(u=>u.id) }, { quoted: m });
    } catch(e) {
      await responder('❌ No pude calcular el ranking.');
    }
  } else {
    const pct = calcularPorcentaje(cmd, objetivo);
    const emoji = pct > 70 ? '🔥' : pct > 40 ? '😐' : '💧';
    await sock.sendMessage(jid, {
      text: emoji + ' @' + nombre + ' es *' + pct + '% ' + cmd + '*.',
      mentions: [objetivo]
    }, { quoted: m });
  }
  break;
}
case 'alteradores': {
  const lista = '🎧 *EFECTOS DISPONIBLES*\n\n' +
    '*Audio (responde a un audio):*\n' +
    '• #audiolento\n• #audiorapido\n• #grave\n• #ardilla\n• #bass\n• #robot\n• #eco\n• #reverse\n\n' +
    '*Video (responde a un video):*\n' +
    '• #videolento\n• #videorapido\n• #videocontrario\n\n' +
    '*Stickers:*\n' +
    '• #sticker2 (cuadrado)\n• #sticker3 (circular)\n• #attp4/5/6 #ttp (texto)\n• #togif (video→sticker)\n• #tomp3 (video→audio)\n\n' +
    '*IA:*\n• #imagine (imagen)';
  await responder(lista);
  break;
}
case 'audiolento': case 'audiorapido': case 'grave': case 'ardilla':
case 'bass': case 'robot': case 'eco': case 'reverse': {
  const ctx = m.message?.extendedTextMessage?.contextInfo || {};
  const quoted = ctx.quotedMessage;
  if (!quoted || (!quoted.audioMessage && !quoted.videoMessage)) {
    await responder('🎧 Responde a un audio o video con #' + cmd);
    break;
  }
  await responder('🎧 Procesando audio...');
  try {
    const buffer = await descargarRespondido(m, sock);
    if (!buffer) { await responder('❌ No pude descargar el audio.'); break; }
    const filtros = {
      audiolento: 'atempo=0.7',
      audiorapido: 'atempo=1.4',
      grave: 'asetrate=35280,aresample=44100,atempo=1.25',
      ardilla: 'asetrate=57330,aresample=44100,atempo=0.77',
      bass: 'bass=g=15',
      robot: "afftfilt=real='hypot(re,im)*sin(0)':imag='hypot(re,im)*cos(0)':win_size=512:overlap=0.75",
      eco: 'aecho=0.8:0.88:60:0.4',
      reverse: 'areverse'
    };
    const out = await audioEfecto(buffer, filtros[cmd]);
    await sock.sendMessage(jid, { audio: out, mimetype: 'audio/mp4', ptt: true }, { quoted: m });
  } catch (e) {
    console.log('Error .' + cmd + ':', e.message);
    await responder('❌ Error procesando audio: ' + e.message);
  }
  break;
}
case 'videolento': case 'videorapido': case 'videocontrario': {
  const ctx = m.message?.extendedTextMessage?.contextInfo || {};
  const quoted = ctx.quotedMessage;
  if (!quoted || !quoted.videoMessage) {
    await responder('🎬 Responde a un video con #' + cmd);
    break;
  }
  await responder('🎬 Procesando video... (puede tardar)');
  try {
    const buffer = await descargarRespondido(m, sock);
    if (!buffer) { await responder('❌ No pude descargar el video.'); break; }
    let vf, af, extra = [];
    if (cmd === 'videolento') { vf = 'setpts=2.0*PTS'; af = 'atempo=0.5'; }
    else if (cmd === 'videorapido') { vf = 'setpts=0.5*PTS'; af = 'atempo=2.0'; }
    else { vf = 'reverse'; af = 'areverse'; extra = ['-t', '15']; }
    let out;
    try {
      out = await ffmpegProcess(buffer, '.mp4', [...extra, '-vf', vf, '-af', af, '-c:v', 'libx264', '-preset', 'fast', '-crf', '28', '-c:a', 'aac', '-b:a', '128k'], '.mp4');
    } catch (e) {
      out = await ffmpegProcess(buffer, '.mp4', [...extra, '-vf', vf, '-c:v', 'libx264', '-preset', 'fast', '-crf', '28', '-an'], '.mp4');
    }
    await sock.sendMessage(jid, { video: out, caption: '✅ #' + cmd }, { quoted: m });
  } catch (e) {
    console.log('Error .' + cmd + ':', e.message);
    await responder('❌ Error procesando video: ' + e.message);
  }
  break;
}
case 'tomp3': {
  const buffer = await descargarRespondido(m, sock);
  if (!buffer) { await responder('🎵 Responde a un video o audio con #tomp3'); break; }
  await responder('🎵 Convirtiendo a MP3...');
  try {
    const out = await ffmpegProcess(buffer, '.mp4', ['-vn', '-acodec', 'libmp3lame', '-b:a', '128k'], '.mp3');
    await sock.sendMessage(jid, { audio: out, mimetype: 'audio/mpeg' }, { quoted: m });
  } catch (e) {
    console.log('Error .tomp3:', e.message);
    await responder('❌ Error convirtiendo.');
  }
  break;
}
case 'togif': {
  const ctx = m.message?.extendedTextMessage?.contextInfo || {};
  const quoted = ctx.quotedMessage;
  if (!quoted || !quoted.videoMessage) {
    await responder('🎞️ Responde a un video con #togif');
    break;
  }
  await responder('🎞️ Creando sticker animado...');
  try {
    const buffer = await descargarRespondido(m, sock);
    const vf = 'fps=10,scale=320:-1:flags=lanczos';
    const out = await ffmpegProcess(buffer, '.mp4', ['-t', '5', '-vf', vf, '-c:v', 'libwebp', '-quality', '70', '-loop', '0', '-an'], '.webp');
    await sock.sendMessage(jid, { sticker: out }, { quoted: m });
  } catch (e) {
    console.log('Error .togif:', e.message);
    await responder('❌ Error creando GIF.');
  }
  break;
}
case 'sticker2': case 'sticker3': {
  const buffer = await descargarRespondido(m, sock);
  if (!buffer) { await responder('🖼️ Responde a una imagen o sticker con #' + cmd); break; }
  await responder('🖼️ Creando sticker...');
  try {
    const out = await imagenASticker(buffer, cmd === 'sticker3' ? 'circle' : 'square');
    await sock.sendMessage(jid, { sticker: out }, { quoted: m });
  } catch (e) {
    console.log('Error .' + cmd + ':', e.message);
    await responder('❌ Error creando sticker: ' + e.message);
  }
  break;
}
case 'attp4': case 'attp5': case 'attp6': case 'imagine': case 'imagina': {
  const prompt = cuerpo.slice(cmd.length).trim();
  if (!prompt) { await responder('Uso: #imagine <descripción>\nEjemplo: #imagine un gato astronauta'); break; }
  await responder('🎨 Generando imagen con IA...');
  try {
    const url = 'https://image.pollinations.ai/prompt/' + encodeURIComponent(prompt) + '?width=768&height=768&nologo=true&seed=' + Date.now();
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const buffer = Buffer.from(await res.arrayBuffer());
    await sock.sendMessage(jid, { image: buffer, caption: '🎨 *' + prompt + '*' }, { quoted: m });
  } catch (e) {
    console.log('Error .imagine:', e.message);
    await responder('❌ Error generando imagen.');
  }
  break;
}

case 'simi': {
  const texto = cuerpo.slice(cmd.length).trim();
  if (!texto) { await responder('Uso: #simi <mensaje>'); break; }
  await responder('💬 Pensando...');
  try {
    const prompt = 'Responde como SimSimi, un loro gracioso y sarcástico. Sé breve. El usuario dice: ' + texto;
    const res = await fetch('https://text.pollinations.ai/' + encodeURIComponent(prompt) + '?model=openai');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const text = await res.text();
    await sock.sendMessage(jid, { text: '🤖 ' + text.trim() }, { quoted: m });
  } catch (e) {
    console.log('Error .simi:', e.message);
    await responder('❌ Simi no quiere hablar ahora. Intenta de nuevo.');
  }
  break;
}
case 'wikipedia': {
  const query = cuerpo.slice(cmd.length).trim();
  if (!query) { await responder('Uso: #wikipedia <tema>'); break; }
  await responder('📚 Buscando en Wikipedia...');
  try {
    const { searchAndSummary } = require('wiki-starlight-api');
    const results = await searchAndSummary(query, 1);
    if (!results.length) { await responder('❌ No encontré artículos.'); break; }
    const art = results[0];
    const txt = `📚 *${art.title}*\n\n${art.extract || art.snippet || 'Sin resumen.'}`;
    await sock.sendMessage(jid, { text: txt }, { quoted: m });
  } catch (e) {
    console.log('Error .wikipedia:', e.message);
    await responder('❌ Error buscando en Wikipedia.');
  }
  break;
}

case 'horoscopo': {
  const signo = cuerpo.slice(cmd.length).trim().toLowerCase();
  if (!signo) { await responder('Uso: #horoscopo <signo>\nEj: #horoscopo aries'); break; }
  const signos = ['aries','tauro','geminis','cancer','leo','virgo','libra','escorpio','sagitario','capricornio','acuario','piscis'];
  if (!signos.includes(signo)) { await responder('❌ Signo no válido.'); break; }
  const frases = [
    'Hoy es un buen día para tomar decisiones importantes.',
    'La energía fluye a tu favor, aprovecha para avanzar en tus proyectos.',
    'Podrías recibir una noticia inesperada que cambiará tu perspectiva.',
    'Es momento de cuidar tu salud y descansar un poco más.',
    'Una conversación pendiente te dará claridad.'
  ];
  const prediccion = frases[Math.floor(Math.random() * frases.length)];
  const txt = `🔮 *Horóscopo para ${signo.toUpperCase()}*\n\n${prediccion}`;
  await sock.sendMessage(jid, { text: txt }, { quoted: m });
  break;
}
case 'toimg': {
  const ctx = m.message?.extendedTextMessage?.contextInfo || {};
  const quoted = ctx.quotedMessage;
  if (!quoted || !quoted.stickerMessage) {
    await responder('🖼️ Responde a un sticker con #toimg');
    break;
  }
  await responder('🖼️ Convirtiendo sticker a imagen...');
  try {
    const buffer = await descargarRespondido(m, sock);
    const Jimp = require('jimp');
    const img = await Jimp.read(buffer);
    const pngBuffer = await img.getBufferAsync(Jimp.MIME_PNG);
    await sock.sendMessage(jid, { image: pngBuffer, caption: '✅ Sticker convertido a PNG' }, { quoted: m });
  } catch (e) {
    console.log('Error .toimg:', e.message);
    await responder('❌ Error convirtiendo sticker.');
  }
  break;
}
case 'hd': {
  const ctx = m.message?.extendedTextMessage?.contextInfo || {};
  const quoted = ctx.quotedMessage;
  if (!quoted || (!quoted.imageMessage && !quoted.stickerMessage)) {
    await responder('🖼️ Responde a una imagen con #hd');
    break;
  }
  await responder('✨ Mejorando calidad...');
  try {
    const buffer = await descargarRespondido(m, sock);
    const Jimp = require('jimp');
    const img = await Jimp.read(buffer);
    img.scale(2).quality(100);
    const out = await img.getBufferAsync(Jimp.MIME_JPEG);
    await sock.sendMessage(jid, { image: out, caption: '✅ Imagen mejorada (escala x2)' }, { quoted: m });
  } catch (e) {
    console.log('Error .hd:', e.message);
    await responder('❌ Error mejorando la imagen.');
  }
  break;
}

case 'gacha': case 'g': case 'roll': case 'tirar':
case 'gachamenu': case 'ayudagacha': {
  if (cmd === 'gachamenu' || cmd === 'ayudagacha') {
    await responder('🎮 *SISTEMA GACHA*\n\nUsa #gacha para tirar (50 monedas).\nUsa #daily para tu recompensa.\nUsa #w para trabajar.\nUsa #coleccion para ver tus personajes.\nUsa #apostar para jugar monedas.\nUsa #gachaprof para ver tu perfil.');
    break;
  }
  const sender = m.key.participant || m.key.remoteJid;
  const db = getGachaDB();
  const u = getGachaUser(db, sender);
  
  if (u.coins < 50) { await responder('❌ No tienes suficientes monedas. Necesitas 50 para tirar. Usa #daily o #w.'); break; }
  u.coins -= 50;
  
  let rand = Math.random();
  let rarity = GACHA_RARITIES[0];
  for (const r of GACHA_RARITIES) { if (rand < r.chance) { rarity = r; break; } rand -= r.chance; }
  
  const personajes = ['Goku', 'Naruto', 'Levi', 'Gojo', 'Luffy', 'Zoro', 'Eren', 'Saitama', 'Miku', 'Rem', 'Asuna', 'Kirito', 'Tanjiro', 'Nezuko', 'Kakashi', 'Itachi', 'Sukuna', 'Anya', 'Killua', 'Hisoka'];
  const pj = personajes[Math.floor(Math.random() * personajes.length)];
  
  const id = Date.now().toString().slice(-4);
  u.chars.push({ id, name: pj, rarity: rarity.name, emoji: rarity.emoji, value: rarity.value });
  
  u.xp += 15;
  if (u.xp >= u.level * 100) { u.xp -= u.level * 100; u.level++; }
  saveGachaDB(db);
  
  const txt = `🎰 *¡INVOCACIÓN!*\n\nHas obtenido a:\n${rarity.emoji} *${pj}*\n🌟 Rareza: ${rarity.name}\n🆔 ID: ${id}\n\n💰 Monedas restantes: ${u.coins}`;
  await sock.sendMessage(jid, { text: txt }, { quoted: m });
  break;
}
case 'daily': case 'd': case 'diario': {
  const sender = m.key.participant || m.key.remoteJid;
  const db = getGachaDB();
  const u = getGachaUser(db, sender);
  const ahora = Date.now();
  
  if (ahora - u.lastDaily < 86400000) {
    const h = Math.ceil((86400000 - (ahora - u.lastDaily)) / 3600000);
    await responder(`⏳ Ya reclamaste tu recompensa hoy. Vuelve en ${h} horas.`);
    break;
  }
  
  u.coins += 100;
  u.lastDaily = ahora;
  u.xp += 20;
  if (u.xp >= u.level * 100) { u.xp -= u.level * 100; u.level++; }
  saveGachaDB(db);
  await responder(`🎁 ¡Recompensa diaria reclamada!\n💰 +100 monedas\n⭐ +20 XP\n\nAhora tienes: ${u.coins} monedas.`);
  break;
}
case 'w': case 'work': case 'trabajar': {
  const sender = m.key.participant || m.key.remoteJid;
  const db = getGachaDB();
  const u = getGachaUser(db, sender);
  const ahora = Date.now();
  
  if (ahora - u.lastWork < 3600000) {
    const m_rest = Math.ceil((3600000 - (ahora - u.lastWork)) / 60000);
    await responder(`⏳ Estás cansado. Descansa ${m_rest} minutos antes de volver a trabajar.`);
    break;
  }
  
  const ganancia = Math.floor(Math.random() * 30) + 20;
  u.coins += ganancia;
  u.lastWork = ahora;
  u.xp += 10;
  if (u.xp >= u.level * 100) { u.xp -= u.level * 100; u.level++; }
  saveGachaDB(db);
  await responder(`💼 ¡Has trabajado duro!\n💰 +${ganancia} monedas\n⭐ +10 XP\n\nAhora tienes: ${u.coins} monedas.`);
  break;
}
case 'monedas': case 'bal': case 'balance': case 'cartera': {
  const sender = m.key.participant || m.key.remoteJid;
  const db = getGachaDB();
  const u = getGachaUser(db, sender);
  await sock.sendMessage(jid, { text: `💰 *Tus Monedas:* ${u.coins}\n📊 *Nivel:* ${u.level} (${u.xp}/${u.level * 100} XP)`, mentions: [sender] }, { quoted: m });
  break;
}
case 'coleccion': case 'col': case 'mispj': {
  const sender = m.key.participant || m.key.remoteJid;
  const db = getGachaDB();
  const u = getGachaUser(db, sender);
  if (u.chars.length === 0) { await responder('📭 No tienes personajes. Usa #gacha para tirar.'); break; }
  
  let txt = `📚 *COLECCIÓN DE @${sender.split('@')[0]}*\n\n`;
  u.chars.forEach((c, i) => {
    txt += `${i+1}. ${c.emoji} *${c.name}* (${c.rarity}) — ID: ${c.id}\n`;
  });
  await sock.sendMessage(jid, { text: txt, mentions: [sender] }, { quoted: m });
  break;
}
case 'apostar': case 'ap': {
  const sender = m.key.participant || m.key.remoteJid;
  const cantidad = parseInt(cuerpo.slice(cmd.length).trim());
  if (isNaN(cantidad) || cantidad <= 0) { await responder('Uso: #apostar <cantidad>\nEjemplo: #apostar 50'); break; }
  
  const db = getGachaDB();
  const u = getGachaUser(db, sender);
  if (u.coins < cantidad) { await responder('❌ No tienes suficientes monedas.'); break; }
  
  const gano = Math.random() > 0.5;
  if (gano) {
    u.coins += cantidad;
    await responder(`🎲 ¡GANASTE!\n💰 +${cantidad} monedas\nAhora tienes: ${u.coins}`);
  } else {
    u.coins -= cantidad;
    await responder(`🎲 ¡PERDISTE!\n💸 -${cantidad} monedas\nAhora tienes: ${u.coins}`);
  }
  saveGachaDB(db);
  break;
}
case 'vender': case 'sell': {
  const sender = m.key.participant || m.key.remoteJid;
  const idVenta = cuerpo.slice(cmd.length).trim();
  if (!idVenta) { await responder('Uso: #vender <ID del personaje>\nMira tus IDs con #coleccion'); break; }
  
  const db = getGachaDB();
  const u = getGachaUser(db, sender);
  const index = u.chars.findIndex(c => c.id === idVenta);
  if (index === -1) { await responder('❌ No tienes ningún personaje con ese ID.'); break; }
  
  const pj = u.chars[index];
  u.coins += pj.value;
  u.chars.splice(index, 1);
  saveGachaDB(db);
  await responder(`💸 Has vendido a ${pj.emoji} *${pj.name}* por *${pj.value} monedas*.\nAhora tienes: ${u.coins}`);
  break;
}
case 'gachaprof': case 'gprof': {
  const sender = m.key.participant || m.key.remoteJid;
  const db = getGachaDB();
  const u = getGachaUser(db, sender);
  
  let mejor = 'Ninguno';
  if (u.chars.length > 0) {
    const top = [...u.chars].sort((a,b) => b.value - a.value)[0];
    mejor = `${top.emoji} ${top.name} (${top.rarity})`;
  }
  
  const txt = `👤 *PERFIL GACHA*\n\n📊 Nivel: ${u.level}\n⭐ XP: ${u.xp}/${u.level * 100}\n💰 Monedas: ${u.coins}\n🎴 Personajes: ${u.chars.length}\n🏆 Mejor PJ: ${mejor}`;
  await sock.sendMessage(jid, { text: txt, mentions: [sender] }, { quoted: m });
  break;
}
case 'topricos': case 'topmoney': {
  const db = getGachaDB();
  const lista = Object.keys(db).map(id => ({ id, coins: db[id].coins || 0 })).sort((a,b) => b.coins - a.coins).slice(0, 5);
  if (lista.length === 0) { await responder('No hay usuarios con monedas aún.'); break; }
  
  let txt = '💎 *TOP 5 MÁS RICOS*\n\n';
  lista.forEach((u, i) => {
    txt += `${i+1}. @${u.id.split('@')[0]} — ${u.coins} monedas\n`;
  });
  await sock.sendMessage(jid, { text: txt, mentions: lista.map(u => u.id) }, { quoted: m });
  break;
}
case 'setoficial': {
  if (!esDueno(m)) {
    await responder('❌ Solo el dueño puede usar este comando.')
    break
  }
  const enlace = cuerpo.slice(cmd.length).trim()
  const match = enlace.match(/chat\.whatsapp\.com\/([A-Za-z0-9]+)/)
  if (!match) { await responder('Uso: #setoficial <enlace del grupo>\nEjemplo: #setoficial https://chat.whatsapp.com/XXXXX'); break; }
  
  try {
    const fs = require('fs')
    const codigo = match[1]
    const info = await sock.groupGetInviteInfo(codigo)
    const jidOficial = info.id
    
    let config = {}
    try { config = JSON.parse(fs.readFileSync('./config.json', 'utf8')) } catch {}
    config.grupoOficial = jidOficial
    fs.writeFileSync('./config.json', JSON.stringify(config, null, 2))
    
    await responder(`✅ Grupo oficial configurado.\nID: ${jidOficial}\n\nLos subbots ya no responderán en este grupo.`)
  } catch (e) {
    console.log('Error en .setoficial:', e.message)
    await responder('❌ No pude obtener la info del grupo. Asegúrate de que el bot ya esté en ese grupo.')
  }
  break
}
case 'setbotprincipal': {
  if (!esDueno(m)) {
    await responder('❌ Solo el dueño puede usar este comando.')
    break
  }
  const numero = cuerpo.slice(cmd.length).trim().replace(/[^0-9]/g, '')
  if (!numero) { await responder('Uso: #setbotprincipal <número>\nEjemplo: #setbotprincipal 50493482934'); break; }
  
  try {
    const fs = require('fs')
    let config = {}
    try { config = JSON.parse(fs.readFileSync('./config.json', 'utf8')) } catch {}
    config.botPrincipal = numero
    fs.writeFileSync('./config.json', JSON.stringify(config, null, 2))
    await responder(`✅ Bot principal configurado al número: ${numero}`)
  } catch (e) {
    console.log('Error en .setbotprincipal:', e.message)
    await responder('❌ Error guardando la configuración.')
  }
  break
}
case 'setbotprincipal': {
  const OWNERS = ['50493482934', '50494874330', '50495939120']
  const remitente = (m.key.participant || m.key.remoteJid || '').split('@')[0].split(':')[0].replace(/[^0-9]/g, '')
  if (!OWNERS.some(n => remitente.includes(n))) {
    await responder('❌ Solo el dueño puede usar este comando.')
    break
  }
  const numero = cuerpo.slice(cmd.length).trim().replace(/[^0-9]/g, '')
  if (!numero) { await responder('Uso: #setbotprincipal <número>\nEjemplo: #setbotprincipal 50493482934'); break; }
  
  try {
    const fs = require('fs')
    let config = {}
    try { config = JSON.parse(fs.readFileSync('./config.json', 'utf8')) } catch {}
    config.botPrincipal = numero
    fs.writeFileSync('./config.json', JSON.stringify(config, null, 2))
    await responder(`✅ Bot principal configurado al número: ${numero}`)
  } catch (e) {
    console.log('Error en .setbotprincipal:', e.message)
    await responder('❌ Error guardando la configuración.')
  }
  break
}
case 'llama': {
  const prompt = cuerpo.slice(cmd.length).trim();
  if (!prompt) { await responder('Uso: #llama <pregunta>'); break; }
  await responder('🦙 Consultando a Llama...');
  try {
    // Usamos la misma API que ChatGPT porque es la que está estable
    const res = await fetch('https://text.pollinations.ai/' + encodeURIComponent(prompt) + '?model=openai');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const text = await res.text();
    await sock.sendMessage(jid, { text: '🦙 ' + text.trim() }, { quoted: m });
  } catch (e) {
    console.log('Error .llama:', e.message);
    await responder('❌ Error consultando a Llama. Intenta de nuevo.');
  }
  break;
}
case 'ia': case 'chatgpt': {
  const prompt = cuerpo.slice(cmd.length).trim();
  if (!prompt) { await responder('Uso: #chatgpt <pregunta>'); break; }

  await responder('🤖 Consultando a la IA...');
  try {
    let respuestaIA;
    try {
      respuestaIA = await consultarGroq(prompt);
      console.log('ChatGPT: respuesta obtenida de Groq');
    } catch (errorGroq) {
      console.log('Groq falló, usando respaldo público:', errorGroq.message);

      const res = await fetch('https://vireonix.ai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(30000),
        body: JSON.stringify({
          model: 'auto',
          messages: [
            { role: 'system', content: 'Eres Levi Bot, un asistente útil. Responde en español claro y directamente.' },
            { role: 'user', content: prompt }
          ]
        })
      });

      if (!res.ok) throw new Error('Respaldo HTTP ' + res.status);
      const data = await res.json();
      respuestaIA = data.choices?.[0]?.message?.content?.trim();
      if (!respuestaIA) throw new Error('El respaldo no devolvió respuesta');
      console.log('ChatGPT: respuesta obtenida de Vireonix');
    }

    await sock.sendMessage(jid, { text: '🤖 ' + respuestaIA }, { quoted: m });
  } catch (e) {
    console.log('Error .chatgpt:', e.message);
    await responder('❌ Groq y la API de respaldo no están disponibles. Intenta más tarde.');
  }
  break;
}
case 'chatpgt': case 'gpt': {
  const prompt = cuerpo.slice(cmd.length).trim();
  if (!prompt) { await responder('Uso: #chatgpt <pregunta>'); break; }
  await responder('🤖 Consultando a ChatGPT...');
  try {
    const res = await fetch('https://keylessai.thryx.workers.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }] })
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    await sock.sendMessage(jid, { text: '🤖 ' + data.choices[0].message.content.trim() }, { quoted: m });
  } catch (e) {
    console.log('Error .chatgpt:', e.message);
    await responder('❌ La IA gratuita está saturada. Intenta de nuevo en unos segundos.');
  }
  break;
}
case 'chatpgt': case 'gpt': {
  const prompt = cuerpo.slice(cmd.length).trim();
  if (!prompt) { await responder('Uso: #chatgpt <pregunta>'); break; }
  
  let apiKey = '';
  try { apiKey = JSON.parse(require('fs').readFileSync('./config.json', 'utf8')).openaiKey; } catch {}
  if (!apiKey) { await responder('❌ Primero configura tu API con el comando #setapi <tu_clave>'); break; }
  
  await responder('🤖 Consultando a ChatGPT...');
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
      body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: prompt }] })
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    await sock.sendMessage(jid, { text: '🤖 ' + data.choices[0].message.content.trim() }, { quoted: m });
  } catch (e) {
    console.log('Error .chatgpt:', e.message);
    await responder('❌ Error consultando a ChatGPT. Revisa tu API Key o saldo.');
  }
  break;
}
case 'llama': {
  const prompt = cuerpo.slice(cmd.length).trim();
  if (!prompt) { await responder('Uso: #llama <pregunta>'); break; }
  
  let apiKey = '';
  try { apiKey = JSON.parse(require('fs').readFileSync('./config.json', 'utf8')).openaiKey; } catch {}
  if (!apiKey) { await responder('❌ Primero configura tu API con el comando #setapi <tu_clave>'); break; }
  
  await responder('🦙 Consultando a Llama...');
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
      body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'system', content: 'Eres un asistente útil.' }, { role: 'user', content: prompt }] })
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    await sock.sendMessage(jid, { text: '🦙 ' + data.choices[0].message.content.trim() }, { quoted: m });
  } catch (e) {
    console.log('Error .llama:', e.message);
    await responder('❌ Error consultando. Revisa tu API Key o saldo.');
  }
  break;
}
case 'simi': {
  const texto = cuerpo.slice(cmd.length).trim();
  if (!texto) { await responder('Uso: #simi <mensaje>'); break; }
  
  let apiKey = '';
  try { apiKey = JSON.parse(require('fs').readFileSync('./config.json', 'utf8')).openaiKey; } catch {}
  if (!apiKey) { await responder('❌ Primero configura tu API con el comando #setapi <tu_clave>'); break; }
  
  await responder('💬 Pensando...');
  try {
    const prompt = 'Responde como SimSimi, un loro gracioso y sarcástico. Sé breve. El usuario dice: ' + texto;
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
      body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: prompt }] })
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    await sock.sendMessage(jid, { text: '🤖 ' + data.choices[0].message.content.trim() }, { quoted: m });
  } catch (e) {
    console.log('Error .simi:', e.message);
    await responder('❌ Simi no quiere hablar. Revisa tu API Key o saldo.');
  }
  break;
}
case 'chatpgt': case 'gpt': {
  const prompt = cuerpo.slice(cmd.length).trim();
  if (!prompt) { await responder('Uso: #chatgpt <pregunta>'); break; }
  await responder('🤖 Consultando a ChatGPT...');
  try {
    const res = await fetch('https://api.blackbox.ai/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: prompt }],
        model: 'gpt-4o'
      })
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const text = await res.text();
    let respuesta = text;
    try { const json = JSON.parse(text); respuesta = json.choices?.[0]?.message?.content || json.response || text; } catch(e) {}
    await sock.sendMessage(jid, { text: '🤖 ' + respuesta.trim() }, { quoted: m });
  } catch (e) {
    console.log('Error .chatgpt:', e.message);
    await responder('❌ Error consultando a ChatGPT.');
  }
  break;
}
case 'chatpgt': case 'gpt': {
  const prompt = cuerpo.slice(cmd.length).trim();
  if (!prompt) { await responder('Uso: #chatgpt <pregunta>'); break; }
  await responder('🤖 Consultando a ChatGPT...');
  try {
    const res = await fetch('https://text.pollinations.ai/' + encodeURIComponent(prompt) + '?model=openai');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const text = await res.text();
    await sock.sendMessage(jid, { text: '🤖 ' + text.trim() }, { quoted: m });
  } catch (e) {
    console.log('Error .chatgpt:', e.message);
    await responder('❌ Error consultando a ChatGPT.');
  }
  break;
}
case 'google': case 'buscar': {
  const query = cuerpo.slice(cmd.length).trim();
  if (!query) { await responder(`Uso: #google <búsqueda>
Ej: #google Shakira`); break; }
  
  await responder('🔍 Buscando en la web...');
  
  try {
    // 1. Buscar en DuckDuckGo
    const res = await fetch('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query), {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });
    const html = await res.text();
    
    const links = [...html.matchAll(/<a rel="nofollow" class="result__a" href="([^"]+)">(.*?)<\/a>/gs)];
    const snippets = [...html.matchAll(/<a class="result__snippet" href="[^"]*">(.*?)<\/a>/gs)];
    
    if (links.length === 0) {
      await responder('❌ No encontré resultados para: ' + query);
      break;
    }

    // Limpiar etiquetas HTML
    const limpiar = (texto) => texto.replace(/<[^>]*>?/gm, '').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&aacute;/g, 'á').replace(/&eacute;/g, 'é').replace(/&iacute;/g, 'í').replace(/&oacute;/g, 'ó').replace(/&uacute;/g, 'ú').replace(/&ntilde;/g, 'ñ');

    // 2. Preparar el primer resultado para la imagen
    let primeraUrl = links[0][1];
    if (primeraUrl.startsWith('//duckduckgo.com/l/?uddg=')) {
      primeraUrl = decodeURIComponent(primeraUrl.split('uddg=')[1].split('&')[0]);
    }
    const primerTitulo = limpiar(links[0][2]);
    const primerSnippet = snippets[0] ? limpiar(snippets[0][1]) : 'Sin descripción.';
    
    let imgUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(query)}?width=512&height=512&nologo=true&seed=1`;
    const domain = primeraUrl ? new URL(primeraUrl).hostname.replace('www.', '') : 'Web';

    // 3. Texto de la imagen (sin lo de "Abriendo resultado")
    const caption = `⇨ Buscando > *${primerTitulo.substring(0, 60)}*\n\n` +
                    `❖ Dominio > ${domain}\n` +
                    `📝 Descripción > ${primerSnippet.substring(0, 100)}...\n` +
                    `□ Enlace > ${primeraUrl}`;

    // 4. Enviar la imagen
    try {
      const imgRes = await fetch(imgUrl);
      const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
      await sock.sendMessage(jid, { image: imgBuffer, caption }, { quoted: m });
    } catch (imgErr) {
      await sock.sendMessage(jid, { text: caption }, { quoted: m });
    }

    // 5. Armar la lista de los otros resultados y enviarla en un NUEVO mensaje
    let txtResultados = `📚 *Más resultados de:* ${query}\n\n`;
    let count = 0;
    
    for (let i = 1; i < links.length && count < 4; i++) {
      let linkUrl = links[i][1];
      if (linkUrl.startsWith('//duckduckgo.com/l/?uddg=')) {
        linkUrl = decodeURIComponent(linkUrl.split('uddg=')[1].split('&')[0]);
      }
      const title = limpiar(links[i][2]);
      txtResultados += `${count+1}. *${title}*\n🔗 ${linkUrl}\n\n`;
      count++;
    }

    if (count > 0) {
      await sock.sendMessage(jid, { text: txtResultados.trim() }, { quoted: m });
    }

  } catch (e) {
    console.log('Error .google:', e.message);
    await responder('❌ Error buscando. Intenta de nuevo.');
  }
  break;
}
case 'buscar': {
  const query = cuerpo.slice(cmd.length).trim();
  if (!query) { await responder(`Uso: #google <búsqueda>
Ej: #google Shakira`); break; }
  
  await responder('🔍 Buscando en la web...');
  
  try {
    let title = query;
    let snippet = 'Sin descripción.';
    let url = '';
    let imgUrl = '';

    // 1. Intentar obtener un resumen rápido y una imagen con la API de DuckDuckGo
    try {
      const ddgRes = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`);
      const ddgData = await ddgRes.json();
      
      if (ddgData.Image) {
        imgUrl = ddgData.Image.startsWith('http') ? ddgData.Image : 'https://duckduckgo.com' + ddgData.Image;
      }
      if (ddgData.AbstractText) {
        snippet = ddgData.AbstractText;
        url = ddgData.AbstractURL;
        title = ddgData.Heading || query;
      }
    } catch (e) {}

    // 2. Si no hay resumen, extraer el primer resultado del HTML de DuckDuckGo
    if (!url) {
      const res = await fetch('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query), {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
      });
      const html = await res.text();
      
      const links = [...html.matchAll(/<a rel="nofollow" class="result__a" href="([^"]+)">(.*?)<\/a>/gs)];
      const snippets = [...html.matchAll(/<a class="result__snippet" href="[^"]*">(.*?)<\/a>/gs)];
      
      if (links.length > 0) {
        let linkUrl = links[0][1];
        if (linkUrl.startsWith('//duckduckgo.com/l/?uddg=')) {
          linkUrl = decodeURIComponent(linkUrl.split('uddg=')[1].split('&')[0]);
        }
        title = links[0][2].replace(/<[^>]*>?/gm, '');
        url = linkUrl;
        snippet = snippets[0] ? snippets[0][1].replace(/<[^>]*>?/gm, '') : 'Sin descripción.';
      }
    }

    // Limpiar caracteres raros del HTML
    title = title.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&aacute;/g, 'á').replace(/&eacute;/g, 'é').replace(/&iacute;/g, 'í').replace(/&oacute;/g, 'ó').replace(/&uacute;/g, 'ú').replace(/&ntilde;/g, 'ñ');
    snippet = snippet.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&aacute;/g, 'á').replace(/&eacute;/g, 'é').replace(/&iacute;/g, 'í').replace(/&oacute;/g, 'ó').replace(/&uacute;/g, 'ú').replace(/&ntilde;/g, 'ñ');

    // 3. Si no hay imagen, buscar en Wikipedia o generarla con IA
    if (!imgUrl) {
      try {
        const wikiRes = await fetch(`https://es.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(query)}&prop=pageimages&format=json&pithumbsize=500`);
        const wikiData = await wikiRes.json();
        const pages = wikiData.query.pages;
        for (const key in pages) {
          if (pages[key].thumbnail) { imgUrl = pages[key].thumbnail.source; break; }
        }
      } catch(e) {}
    }
    if (!imgUrl) {
      imgUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(query)}?width=512&height=512&nologo=true&seed=1`;
    }

    const domain = url ? new URL(url).hostname.replace('www.', '') : 'Web';

    // 4. Formatear el mensaje igual que el comando .play
    const caption = `⇨ Buscando > *${title.substring(0, 60)}*\n\n` +
                    `❖ Dominio > ${domain}\n` +
                    `📝 Descripción > ${snippet.substring(0, 150)}...\n` +
                    `□ Enlace > ${url}\n\n` +
                    `⌛ Abriendo resultado...`;

    // 5. Enviar la foto con el texto abajo
    try {
      const imgRes = await fetch(imgUrl);
      const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
      await sock.sendMessage(jid, { image: imgBuffer, caption }, { quoted: m });
    } catch (imgErr) {
      await sock.sendMessage(jid, { text: caption }, { quoted: m });
    }

  } catch (e) {
    console.log('Error .google:', e.message);
    await responder('❌ Error buscando. Intenta de nuevo.');
  }
  break;
}
case 'buscar': {
  const query = cuerpo.slice(cmd.length).trim();
  if (!query) { await responder(`Uso: #google <búsqueda>
Ej: #google Shakira`); break; }
  
  await responder('🔍 Buscando en la web...');
  
  try {
    let title = query;
    let snippet = 'Sin descripción.';
    let url = '';
    let imgUrl = '';

    // 1. Intentar obtener un resumen rápido y una imagen con la API de DuckDuckGo
    try {
      const ddgRes = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`);
      const ddgData = await ddgRes.json();
      
      if (ddgData.Image) {
        imgUrl = ddgData.Image.startsWith('http') ? ddgData.Image : 'https://duckduckgo.com' + ddgData.Image;
      }
      if (ddgData.AbstractText) {
        snippet = ddgData.AbstractText;
        url = ddgData.AbstractURL;
        title = ddgData.Heading || query;
      }
    } catch (e) {}

    // 2. Si no hay resumen, extraer el primer resultado del HTML de DuckDuckGo
    if (!url) {
      const res = await fetch('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query), {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
      });
      const html = await res.text();
      
      const links = [...html.matchAll(/<a rel="nofollow" class="result__a" href="([^"]+)">(.*?)<\/a>/gs)];
      const snippets = [...html.matchAll(/<a class="result__snippet" href="[^"]*">(.*?)<\/a>/gs)];
      
      if (links.length > 0) {
        let linkUrl = links[0][1];
        if (linkUrl.startsWith('//duckduckgo.com/l/?uddg=')) {
          linkUrl = decodeURIComponent(linkUrl.split('uddg=')[1].split('&')[0]);
        }
        title = links[0][2].replace(/<[^>]*>?/gm, '');
        url = linkUrl;
        snippet = snippets[0] ? snippets[0][1].replace(/<[^>]*>?/gm, '') : 'Sin descripción.';
      }
    }

    // Limpiar caracteres raros del HTML
    title = title.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&aacute;/g, 'á').replace(/&eacute;/g, 'é').replace(/&iacute;/g, 'í').replace(/&oacute;/g, 'ó').replace(/&uacute;/g, 'ú').replace(/&ntilde;/g, 'ñ');
    snippet = snippet.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&aacute;/g, 'á').replace(/&eacute;/g, 'é').replace(/&iacute;/g, 'í').replace(/&oacute;/g, 'ó').replace(/&uacute;/g, 'ú').replace(/&ntilde;/g, 'ñ');

    // 3. Si no hay imagen, buscar en Wikipedia o generarla con IA
    if (!imgUrl) {
      try {
        const wikiRes = await fetch(`https://es.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(query)}&prop=pageimages&format=json&pithumbsize=500`);
        const wikiData = await wikiRes.json();
        const pages = wikiData.query.pages;
        for (const key in pages) {
          if (pages[key].thumbnail) { imgUrl = pages[key].thumbnail.source; break; }
        }
      } catch(e) {}
    }
    if (!imgUrl) {
      imgUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(query)}?width=512&height=512&nologo=true&seed=1`;
    }

    const domain = url ? new URL(url).hostname.replace('www.', '') : 'Web';

    // 4. Formatear el mensaje igual que el comando .play
    const caption = `⇨ Buscando > *${title.substring(0, 60)}*\n\n` +
                    `❖ Dominio > ${domain}\n` +
                    `📝 Descripción > ${snippet.substring(0, 150)}...\n` +
                    `□ Enlace > ${url}\n\n` +
                    `⌛ Abriendo resultado...`;

    // 5. Enviar la foto con el texto abajo
    try {
      const imgRes = await fetch(imgUrl);
      const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
      await sock.sendMessage(jid, { image: imgBuffer, caption }, { quoted: m });
    } catch (imgErr) {
      await sock.sendMessage(jid, { text: caption }, { quoted: m });
    }

  } catch (e) {
    console.log('Error .google:', e.message);
    await responder('❌ Error buscando. Intenta de nuevo.');
  }
  break;
}
case 'buscar': {
  const query = cuerpo.slice(cmd.length).trim();
  if (!query) { await responder(`Uso: #google <búsqueda>
Ej: #google Shakira`); break; }
  
  await responder('🔍 Buscando en la web...');
  
  try {
    // 1. Intentar con DuckDuckGo con un límite de 10 segundos
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    const res = await fetch('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query), {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const html = await res.text();
    
    // Extraer enlaces y descripciones
    const links = [...html.matchAll(/<a rel="nofollow" class="result__a" href="([^"]+)">(.*?)<\/a>/gs)];
    const snippets = [...html.matchAll(/<a class="result__snippet" href="[^"]*">(.*?)<\/a>/gs)];
    
    if (links.length === 0) throw new Error('Sin resultados');
    
    let txt = `🔍 *Resultados para:* ${query}

`;
    let count = 0;
    for (let i = 0; i < links.length && count < 5; i++) {
      let url = links[i][1];
      if (url.startsWith('//duckduckgo.com/l/?uddg=')) {
        url = decodeURIComponent(url.split('uddg=')[1].split('&')[0]);
      }
      const title = links[i][2].replace(/<[^>]*>?/gm, '');
      const snippet = snippets[i] ? snippets[i][1].replace(/<[^>]*>?/gm, '').substring(0, 100) : '';
      
      txt += `*${count+1}. ${title}*
🔗 ${url}
`;
      if (snippet) txt += `📝 ${snippet}...

`;
      count++;
    }
    
    await sock.sendMessage(jid, { text: txt }, { quoted: m });
    
  } catch (e) {
    console.log('Error .google (DuckDuckGo):', e.message);
    // 2. Respaldo: Buscar en Wikipedia si falla o tarda mucho
    try {
      await responder('⚠️ El buscador principal falló. Buscando en Wikipedia...');
      const wikiRes = await fetch(`https://es.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*`);
      const wikiData = await wikiRes.json();
      
      if (wikiData.query && wikiData.query.search.length > 0) {
        let wikiTxt = `📚 *Resultados en Wikipedia:*

`;
        wikiData.query.search.slice(0, 3).forEach((r, i) => {
          wikiTxt += `*${i+1}. ${r.title}*
🔗 https://es.wikipedia.org/wiki/${encodeURIComponent(r.title.replace(/ /g, '_'))}

`;
        });
        await sock.sendMessage(jid, { text: wikiTxt }, { quoted: m });
      } else {
        await responder('❌ No encontré resultados. Intenta con otras palabras.');
      }
    } catch (e2) {
      console.log('Error en Wikipedia:', e2.message);
      await responder('❌ Error buscando. Intenta de nuevo.');
    }
  }
  break;
}
case 'buscar': {
  const query = cuerpo.slice(cmd.length).trim();
  if (!query) { await responder(`Uso: #google <búsqueda>
Ej: #google Shakira`); break; }
  
  await responder('🔍 Buscando en la web...');
  
  try {
    const { search } = await import('ducksearch');
    const results = await search(query, { maxResults: 5 });
    
    if (!results || results.length === 0) {
      await responder('❌ No encontré resultados para: ' + query);
      break;
    }
    
    let txt = `🔍 *Resultados para:* ${query}

`;
    results.forEach((r, i) => {
      txt += `*${i+1}. ${r.title}*
🔗 ${r.url}
`;
      if (r.snippet) txt += `📝 ${r.snippet.substring(0, 150)}...
`;
      txt += `
`;
    });
    
    await sock.sendMessage(jid, { text: txt }, { quoted: m });
    
  } catch (e) {
    console.log('Error .google:', e.message);
    try {
      await responder('⚠️ El buscador principal falló. Buscando en Wikipedia...');
      const wikiRes = await fetch(`https://es.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*`);
      const wikiData = await wikiRes.json();
      
      if (wikiData.query && wikiData.query.search.length > 0) {
        let wikiTxt = `📚 *Resultados en Wikipedia:*

`;
        wikiData.query.search.slice(0, 3).forEach((r, i) => {
          wikiTxt += `*${i+1}. ${r.title}*
🔗 https://es.wikipedia.org/wiki/${encodeURIComponent(r.title.replace(/ /g, '_'))}

`;
        });
        await sock.sendMessage(jid, { text: wikiTxt }, { quoted: m });
      } else {
        await responder('❌ Error buscando. Intenta de nuevo en unos segundos.');
      }
    } catch (e2) {
      console.log('Error en respaldo de Wikipedia:', e2.message);
      await responder('❌ Error buscando. Intenta de nuevo en unos segundos.');
    }
  }
  break;
}
case 'buscar': {
  const query = cuerpo.slice(cmd.length).trim();
  if (!query) { await responder('Uso: #google <búsqueda>'); break; }
  await responder('🔍 Buscando en la web...');
  try {
    const { search, SafeSearchType } = require('duck-duck-scrape');
    const searchResults = await search(query, { safeSearch: SafeSearchType.MODERATE });
    if (!searchResults.results || searchResults.results.length === 0) {
      await responder('❌ No encontré resultados.');
      break;
    }
    let txt = '🔍 *Resultados de búsqueda:*\n\n';
    searchResults.results.slice(0, 5).forEach((r, i) => {
      txt += `*${i+1}. ${r.title}*\n🔗 ${r.url}\n📝 ${r.description || 'Sin descripción'}\n\n`;
    });
    await sock.sendMessage(jid, { text: txt }, { quoted: m });
  } catch (e) {
    console.log('Error .google:', e.message);
    await responder('❌ Error buscando. Intenta de nuevo.');
  }
  break;
}
case 'clima': {
  const ciudad = cuerpo.slice(cmd.length).trim();
  if (!ciudad) { await responder('Uso: #clima <ciudad>\nEj: #clima Tegucigalpa'); break; }
  await responder('🌤️ Consultando clima de ' + ciudad + '...');
  try {
    const res = await fetch('https://wttr.in/' + encodeURIComponent(ciudad) + '?format=j1');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const current = data.current_condition[0];
    const area = data.nearest_area[0].areaName[0].value;
    const region = data.nearest_area[0].region[0].value;
    
    const txt = `🌤️ *Clima en ${area}, ${region}*\n` +
                `🌡️ *Temperatura:* ${current.temp_C}°C (Sensación: ${current.FeelsLikeC}°C)\n` +
                `☁️ *Clima:* ${current.weatherDesc[0].value}\n` +
                `💧 *Humedad:* ${current.humidity}%\n` +
                `💨 *Viento:* ${current.windspeedKmph} km/h`;
    await sock.sendMessage(jid, { text: txt }, { quoted: m });
  } catch (e) {
    console.log('Error .clima:', e.message);
    await responder('❌ Error consultando el clima. Intenta de nuevo.');
  }
  break;
}
case 'setapi': {
  if (!esDueno(m)) { await responder('❌ Solo el dueño puede configurar la API.'); break; }
  const clave = cuerpo.slice(cmd.length).trim();
  if (!clave || (!clave.startsWith('sk-') && !clave.startsWith('gsk_'))) {
    await responder('❌ Uso: #setapi <tu_clave>\nEjemplo: #setapi sk-proj-123456...\n\nLa clave debe empezar con "gsk_" (Groq) o "sk-" (OpenAI).');
    break;
  }
  try {
    const fs = require('fs');
    let config = {};
    try { config = JSON.parse(fs.readFileSync('./config.json', 'utf8')); } catch {}
    config.openaiKey = clave;
    fs.writeFileSync('./config.json', JSON.stringify(config, null, 2));
    await responder('✅ ¡API Key de OpenAI guardada con éxito!\nAhora los comandos .chatgpt, .llama y .simi funcionarán perfectamente.');
  } catch (e) {
    console.log('Error .setapi:', e.message);
    await responder('❌ Error al guardar la API Key.');
  }
  break;
}
case 'addmoney': {
  if (!esDueno(m)) { await responder('❌ Solo el dueño.'); break; }
  const mencionado = (m.message?.extendedTextMessage?.contextInfo?.mentionedJid || [])[0];

  if (!mencionado || !args[1]) { await responder('Uso: #addmoney @user <cantidad>'); break; }
  const cantidad = parseInt(args[1]);
  if (isNaN(cantidad)) { await responder('❌ Cantidad inválida.'); break; }
  const db = getGachaDB();
  const u = getGachaUser(db, mencionado);
  u.coins += cantidad;
  saveGachaDB(db);
  await responder(`✅ Se añadieron ${cantidad} monedas a @${mencionado.split('@')[0]}`);
  break;
}
case 'removemoney': {
  if (!esDueno(m)) { await responder('❌ Solo el dueño.'); break; }
  const mencionado = (m.message?.extendedTextMessage?.contextInfo?.mentionedJid || [])[0];

  if (!mencionado || !args[1]) { await responder('Uso: #removemoney @user <cantidad>'); break; }
  const cantidad = parseInt(args[1]);
  if (isNaN(cantidad)) { await responder('❌ Cantidad inválida.'); break; }
  const db = getGachaDB();
  const u = getGachaUser(db, mencionado);
  u.coins -= cantidad;
  if (u.coins < 0) u.coins = 0;
  saveGachaDB(db);
  await responder(`✅ Se quitaron ${cantidad} monedas a @${mencionado.split('@')[0]}`);
  break;
}
case 'autoread': {
  if (!esDueno(m)) { await responder('❌ Solo el dueño.'); break; }
  const arg = cuerpo.slice(cmd.length).trim().toLowerCase();
  if (arg === 'on') { global.autoread = true; await responder('✅ AutoRead ACTIVADO. El bot marcará los mensajes como leídos.'); }
  else if (arg === 'off') { global.autoread = false; await responder('❌ AutoRead DESACTIVADO.'); }
  else { await responder(`Estado actual: ${global.autoread ? '✅ ON' : '❌ OFF'}\nUso: #autoread on/off`); }
  break;
}
case 'ram': {
  if (!esDueno(m)) { await responder('❌ Solo el dueño.'); break; }
  const os = require('os');
  const total = (os.totalmem() / 1024 / 1024).toFixed(2);
  const libre = (os.freemem() / 1024 / 1024).toFixed(2);
  const uso = (total - libre).toFixed(2);
  await responder(`💻 *RAM del Servidor:*\nTotal: ${total} MB\nEn uso: ${uso} MB\nLibre: ${libre} MB`);
  break;
}
case 'estado': case 'disco': {
  if (!esDueno(m)) { await responder('❌ Solo el dueño.'); break; }
  const os = require('os');
  const { execSync } = require('child_process');
  let disco = 'N/A';
  try { disco = execSync("df -h /data | tail -1 | awk '{print $4}'").toString().trim(); } catch(e) {}
  const uptime = (os.uptime() / 3600).toFixed(2);
  await responder(`📊 *Estado del Bot:*\n⏱️ Uptime: ${uptime} horas\n💾 Disco libre: ${disco}\n🖥️ Plataforma: ${os.platform()} (${os.arch()})\n🆔 Node: ${process.version}`);
  break;
}
case 'e': case 'error': {
  if (!esDueno(m)) { await responder('❌ Solo el dueño.'); break; }
  await responder(`🚨 *Último error capturado:*\n\n${global.lastError || 'No hay errores registrados desde el último reinicio.'}`);
  break;
}
case 'restart': {
  if (!esDueno(m)) { await responder('❌ Solo el dueño.'); break; }
  await responder('🔄 Reiniciando el bot... (Si usas PM2 o un loop, volverá a encender).');
  setTimeout(() => process.exit(0), 1000);
  break;
}
case 'setprimary': {
  if (!esDueno(m)) { await responder('❌ Solo el dueño.'); break; }
  const numero = cuerpo.slice(cmd.length).trim().replace(/[^0-9]/g, '');
  if (!numero) { await responder('Uso: #setprimary <número>\nEjemplo: #setprimary 50493482934'); break; }
  try {
    const fs = require('fs');
    let config = {};
    try { config = JSON.parse(fs.readFileSync('./config.json', 'utf8')); } catch {}
    config.botPrincipal = numero;
    fs.writeFileSync('./config.json', JSON.stringify(config, null, 2));
    await responder(`✅ Bot principal (Primary) configurado a: ${numero}`);
  } catch (e) {
    await responder('❌ Error guardando la configuración.');
  }
  break;
}
case 'tbcookie': {
  if (!esDueno(m)) { await responder('❌ Solo el dueño.'); break; }
  const cookie = cuerpo.slice(cmd.length).trim();
  if (!cookie) { await responder('Uso: #tbcookie <cookie>'); break; }
  try {
    const fs = require('fs');
    let config = {};
    try { config = JSON.parse(fs.readFileSync('./config.json', 'utf8')); } catch {}
    config.tbcookie = cookie;
    fs.writeFileSync('./config.json', JSON.stringify(config, null, 2));
    await responder('✅ Cookie guardada exitosamente en config.json');
  } catch (e) {
    await responder('❌ Error guardando la cookie.');
  }
  break;
}
case 'testvideo': {
  if (!esDueno(m)) { await responder('❌ Solo el dueño.'); break; }
  await responder('🎬 Enviando video de prueba...');
  try {
    await sock.sendMessage(jid, { video: { url: 'https://www.w3schools.com/html/mov_bbb.mp4' }, caption: '✅ Este es un video de prueba para verificar que el envío funciona.' }, { quoted: m });
  } catch (e) {
    await responder('❌ Error enviando el video.');
  }
  break;
}
case 'clear': {
  if (!esDueno(m)) { await responder('❌ Solo el dueño.'); break; }
  console.clear();
  await responder('🧹 Consola y caché de memoria limpiadas.');
  break;
}

case 'consola': case 'cmd': case 'sh': case 'c': {
  if (!esDueno(m)) { await responder('❌ Solo el dueño puede usar la consola.'); break; }
  const comandoTerminal = cuerpo.slice(cmd.length).trim();
  if (!comandoTerminal) { await responder(`Uso: #consola <comando>\nEjemplo: #consola ls -la`); break; }

  await responder(`💻 Ejecutando: \`${comandoTerminal}\`...`);
  try {
    const { exec } = require('child_process');
    exec(comandoTerminal, { timeout: 15000, maxBuffer: 1024 * 1024 * 5 }, (error, stdout, stderr) => {
      let salida = stdout || stderr || 'Sin salida.';
      if (error && !stdout) salida = error.message;
      
      if (salida.length > 3500) {
        salida = salida.substring(0, 3500) + '\n\n...[Cortado por ser muy largo]';
      }
      
      sock.sendMessage(jid, { text: `💻 *Resultado:*\n\`\`\`\n${salida.trim()}\n\`\`\`` }, { quoted: m })
        .catch(e => console.log('Error enviando consola:', e.message));
    });
  } catch (e) {
    console.log('Error en consola:', e.message);
    await responder('❌ Error ejecutando el comando.');
  }
  break;
}

case 'villancico_viejo':
      case 'tt': {
  const url = cuerpo.slice(cmd.length).trim();
  if (!url || !url.includes('tiktok.com')) {
    await responder('Uso: #tiktok <enlace de TikTok>\\nEjemplo: #tiktok https://vm.tiktok.com/...');
    break;
  }
  
  await responder('⬇️ Descargando video de TikTok (rápido)...');
  
  try {
    // Usamos la API de TikWM (sin marca de agua y muy rápida)
    const res = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}&hd=1`);
    const json = await res.json();
    
    if (json.code !== 0 || !json.data) {
      await responder('❌ No se pudo obtener el video. Asegúrate de que el enlace sea público.');
      break;
    }
    
    const videoUrl = json.data.play;
    const titulo = json.data.title || 'Video de TikTok';
    const autor = json.data.author ? json.data.author.nickname : 'Desconocido';
    
    // Descargar el video a la memoria
    const videoRes = await fetch(videoUrl);
    const buffer = Buffer.from(await videoRes.arrayBuffer());
    
    // Enviarlo por WhatsApp
    await sock.sendMessage(jid, { 
      video: buffer, 
      caption: `🎬 *${titulo}*\\n👤 Autor: ${autor}` 
    }, { quoted: m });
    
  } catch (e) {
    console.log('Error .tiktok:', e.message);
    await responder('❌ Error descargando de TikTok. Revisa el enlace.');
  }
  break;
}
case 'tt':
      case 'x':
      case 'tt': {
  const url = cuerpo.slice(cmd.length).trim();
  if (!url || !url.includes('tiktok.com')) {
    await responder('Uso: #tiktok <enlace de TikTok>');
    break;
  }
  await responder('⬇️ Descargando video de TikTok...');
  try {
    const res = await fetch('https://www.tikwm.com/api/?url=' + encodeURIComponent(url) + '&hd=1');
    const json = await res.json();
    if (json.code !== 0 || !json.data) { await responder('❌ Video no disponible o privado.'); break; }
    const videoRes = await fetch(json.data.play);
    const buffer = Buffer.from(await videoRes.arrayBuffer());
    await sock.sendMessage(jid, { video: buffer, caption: '🎬 *' + (json.data.title || 'TikTok') + '*\n👤 ' + (json.data.author ? json.data.author.nickname : 'Desconocido') }, { quoted: m });
  } catch (e) {
    console.log('Error en tiktok:', e.message);
    await responder('❌ Error descargando de TikTok.');
  }
  break;
}


case 'mapa_viejo': {
  const query = cuerpo.slice(cmd.length).trim();
  if (!query) { await responder('Uso: #mapa <lugar>'); break; }
  
  // Envía el enlace directo sin buscar en APIs (respuesta instantánea)
  const link = 'https://www.google.com/maps/search/' + encodeURIComponent(query);
  await sock.sendMessage(jid, { text: '🗺️ *Ubicación en Google Maps:*\n' + link }, { quoted: m });
  break;
}

case 'idgp': {
  await sock.sendMessage(jid, { text: '🆔 *ID de este grupo:*\n\n`' + jid + '`' }, { quoted: m });
  break;
}
case 'listaadmins': {
  if (!jid.endsWith('@g.us')) { await responder('❌ Solo en grupos.'); break; }
  const meta = await sock.groupMetadata(jid);
  const admins = meta.participants.filter(p => p.admin === 'admin' || p.admin === 'superadmin');
  let txt = '👑 *ADMINISTRADORES DEL GRUPO*\n\n';
  admins.forEach(a => { txt += '• @' + a.id.split('@')[0] + '\n'; });
  await sock.sendMessage(jid, { text: txt, mentions: admins.map(a => a.id) }, { quoted: m });
  break;
}
case 'contadormensajes': {
  const db = getActividadDB();
  const total = db[jid] ? Object.values(db[jid]).reduce((a, b) => a + b, 0) : 0;
  await responder(`📊 *Total de mensajes en este grupo:*\n\n💬 ${total} mensajes`);
  break;
}
case 'veractividad': {
  const db = getActividadDB();
  const grupo = db[jid] || {};
  const lista = Object.keys(grupo).map(id => ({ id, count: grupo[id] })).sort((a, b) => b.count - a.count);
  if (lista.length === 0) { await responder('❌ No hay actividad registrada.'); break; }
  let txt = '📊 *ACTIVIDAD DEL GRUPO*\n\n';
  lista.slice(0, 10).forEach((u, i) => { txt += `${i+1}. @${u.id.split('@')[0]} — *${u.count}* msgs\n`; });
  await sock.sendMessage(jid, { text: txt, mentions: lista.slice(0, 10).map(u => u.id) }, { quoted: m });
  break;
}
case 'rankactivos': {
  const db = getActividadDB();
  const grupo = db[jid] || {};
  const lista = Object.keys(grupo).map(id => ({ id, count: grupo[id] })).sort((a, b) => b.count - a.count).slice(0, 10);
  if (lista.length === 0) { await responder('❌ No hay actividad registrada.'); break; }
  let txt = '🏆 *TOP 10 MÁS ACTIVOS*\n\n';
  lista.forEach((u, i) => { txt += `${i+1}. @${u.id.split('@')[0]} — *${u.count}* msgs\n`; });
  await sock.sendMessage(jid, { text: txt, mentions: lista.map(u => u.id) }, { quoted: m });
  break;
}
case 'reiniciarcontador': {
  const meta = await sock.groupMetadata(jid);
  const sender = m.key.participant || m.key.remoteJid;
  const p = meta.participants.find(x => x.id === sender);
  if (!p || (p.admin !== 'admin' && p.admin !== 'superadmin')) { await responder('❌ Solo admins.'); break; }
  const db = getActividadDB();
  if (db[jid]) delete db[jid];
  saveActividadDB(db);
  await responder('🧹 Contador de actividad reiniciado a cero.');
  break;
}
case 'ausente': {
  const motivo = cuerpo.slice(cmd.length).trim() || 'Sin motivo';
  const sender = m.key.participant || m.key.remoteJid;
  if (!global.ausentes) global.ausentes = {};
  global.ausentes[sender] = motivo;
  await sock.sendMessage(jid, { text: `💤 @${sender.split('@')[0]} está ausente: _${motivo}_`, mentions: [sender] }, { quoted: m });
  break;
}
case 'activo': {
  const sender = m.key.participant || m.key.remoteJid;
  if (!global.ausentes) global.ausentes = {};
  delete global.ausentes[sender];
  await sock.sendMessage(jid, { text: `✅ @${sender.split('@')[0]} ha vuelto y está activo.`, mentions: [sender] }, { quoted: m });
  break;
}
case 'sorteo': {
  const meta = await sock.groupMetadata(jid);
  const sender = m.key.participant || m.key.remoteJid;
  const p = meta.participants.find(x => x.id === sender);
  if (!p || (p.admin !== 'admin' && p.admin !== 'superadmin')) { await responder('❌ Solo admins pueden iniciar sorteos.'); break; }
  
  const premio = cuerpo.slice(cmd.length).trim();
  if (!premio) { await responder('Uso: #sorteo <premio>'); break; }
  
  const participantes = meta.participants.map(x => x.id);
  const ganador = participantes[Math.floor(Math.random() * participantes.length)];
  
  if (!global.sorteos) global.sorteos = {};
  const idSorteo = Date.now();
  global.sorteos[idSorteo] = { ganador, premio, jid };
  
  await sock.sendMessage(jid, { text: `🎉 *¡SORTEO INICIADO!* 🎉\n\n🎁 Premio: *${premio}*\n\nEl elegido al azar es: @${ganador.split('@')[0]}\n\n⏳ Tienes *5 minutos* para reclamar. Responde a este mensaje escribiendo: *si*`, mentions: [ganador] }, { quoted: m });
  
  setTimeout(async () => {
    if (global.sorteos && global.sorteos[idSorteo]) {
      delete global.sorteos[idSorteo];
      await sock.sendMessage(jid, { text: `⏰ El tiempo ha terminado. @${ganador.split('@')[0]} no reclamó el premio: *${premio}*.`, mentions: [ganador] });
    }
  }, 300000); // 5 minutos
  break;
}
case 'crearrespuesta': {
  const partes = cuerpo.slice(cmd.length).split('|');
  if (partes.length < 2) { await responder('Uso: #crearrespuesta <palabra> | <respuesta>'); break; }
  const palabra = partes[0].trim().toLowerCase();
  const respuesta = partes[1].trim();
  const db = getRespuestasDB();
  if (!db[jid]) db[jid] = {};
  db[jid][palabra] = respuesta;
  saveRespuestasDB(db);
  await responder(`✅ Respuesta creada: cuando alguien diga *"${palabra}"*, el bot responderá *"${respuesta}"*.`);
  break;
}
case 'listarrespuestas': {
  const db = getRespuestasDB();
  const grupo = db[jid] || {};
  if (Object.keys(grupo).length === 0) { await responder('❌ No hay respuestas automáticas configuradas.'); break; }
  let txt = '🤖 *RESPUESTAS AUTOMÁTICAS*\n\n';
  for (const [palabra, resp] of Object.entries(grupo)) { txt += `• *${palabra}* → ${resp}\n`; }
  await responder(txt);
  break;
}
case 'eliminarrespuesta': {
  const palabra = cuerpo.slice(cmd.length).trim().toLowerCase();
  const db = getRespuestasDB();
  if (db[jid] && db[jid][palabra]) {
    delete db[jid][palabra];
    saveRespuestasDB(db);
    await responder(`✅ Respuesta *"${palabra}"* eliminada.`);
  } else {
    await responder('❌ Esa respuesta no existe.');
  }
  break;
}


case 'mapa_viejo': {
  const query = cuerpo.slice(cmd.length).trim();
  if (!query) { await responder('Uso: #mapa <lugar>'); break; }
  
  // Envía el enlace directo (cero APIs, cero bloqueos)
  const link = 'https://www.google.com/maps/search/' + encodeURIComponent(query);
  await sock.sendMessage(jid, { text: '🗺️ *Ubicación en Google Maps:*\n' + link }, { quoted: m });
  break;
}

case 'attp2': case 'attp3': case 'ttp': {
  const texto = cuerpo.slice(cmd.length).trim();
  if (!texto) { await responder('Uso: #' + cmd + ' <texto>'); break; }
  
  await responder('✨ Creando sticker...');
  
  try {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    const fs2 = require('fs');
    
    // 1. Descargar la fuente si no existe
    const fontPath = '/tmp/font.ttf';
    if (!fs2.existsSync(fontPath)) {
      const fontRes = await fetch('https://github.com/google/fonts/raw/main/apache/roboto/Roboto-Bold.ttf');
      const fontBuffer = Buffer.from(await fontRes.arrayBuffer());
      fs2.writeFileSync(fontPath, fontBuffer);
    }

    const textoLimpio = texto.replace(/['"\\]/g, '');
    const filePath = '/tmp/sticker_' + Date.now() + '.webp';
    
    // 2. Generar con ffmpeg usando la fuente descargada
    const comandoFfmpeg = 'ffmpeg -y -f lavfi -i color=c=black:s=512x512:d=1 -vf "drawtext=fontfile=' + fontPath + ':text=\'' + textoLimpio + '\':fontcolor=white:fontsize=64:x=(w-text_w)/2:y=(h-text_h)/2" -vcodec libwebp -lossless 1 -q:v 60 -loop 0 -preset default -an -vsync 0 "' + filePath + '"';
    
    await execAsync(comandoFfmpeg, { timeout: 15000 });
    
    if (!fs2.existsSync(filePath)) throw new Error('No se creó el archivo');
    
    const buffer = fs2.readFileSync(filePath);
    await sock.sendMessage(jid, { sticker: buffer }, { quoted: m });
    fs2.unlinkSync(filePath);
    
  } catch (e) {
    console.log('Error en attp:', e.message);
    await responder('❌ Error al crear el sticker. Intenta de nuevo.');
  }
  break;
}


case 'mapa_viejo': case 'maps': {
  const query = cuerpo.slice(cmd.length).trim();
  if (!query) { await responder('Uso: #mapa <lugar>'); break; }
  const link = 'https://www.google.com/maps/search/' + encodeURIComponent(query);
  await sock.sendMessage(jid, { text: '🗺️ *Ubicación en Google Maps:*\n' + link }, { quoted: m });
  break;
}

case 'attp': case 'attp2': case 'attp3': case 'ttp': {
  const texto = cuerpo.slice(cmd.length).trim();
  if (!texto) { await responder('Uso: #' + cmd + ' <texto>'); break; }
  
  await responder('✨ Creando sticker...');
  
  try {
    const Jimp = require('jimp');
    // Creamos una imagen transparente de 512x512
    const image = new Jimp(512, 512, 0x00000000);
    const font = await Jimp.loadFont(Jimp.FONT_SANS_64_WHITE);
    
    image.print(font, 0, 0, {
      text: texto,
      alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER,
      alignmentY: Jimp.VERTICAL_ALIGN_MIDDLE
    }, 512, 512);
    
    const buffer = await image.getBufferAsync(Jimp.MIME_PNG);
    const out = await imagenASticker(buffer, 'square');
    await sock.sendMessage(jid, { sticker: out }, { quoted: m });
    
  } catch (e) {
    console.log('Error en .' + cmd + ' (local):', e.message);
    await responder('❌ Error al crear el sticker.');
  }
  break;
}

case 'pin': {
  const query = cuerpo.slice(cmd.length).trim();
  if (!query) {
    await responder('Uso: .pin <búsqueda>');
    break;
  }

  await responder('🔍 Buscando imágenes: ' + query);

  try {
    const { buscarImagenes } = require('./descargas');
    const resultados = await buscarImagenes(query, 3);

    if (!resultados.length) {
      await responder('❌ No se encontraron imágenes.');
      break;
    }

    // Descargar las imágenes en paralelo.
    const tareas = await Promise.all(resultados.map(async (foto) => {
      try {
        const res = await fetch(foto.url, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(15000)
        });

        if (!res.ok) return null;

        const buffer = Buffer.from(await res.arrayBuffer());
        if (!buffer.length || buffer.length > 8 * 1024 * 1024) return null;

        return { buffer, titulo: String(foto.titulo || query).slice(0, 900) };
      } catch (e) {
        console.log('Error descargando imagen PIN:', e.message);
        return null;
      }
    }));

    const imagenes = tareas.filter(Boolean);

    if (!imagenes.length) {
      await responder('❌ No se pudieron descargar las imágenes.');
      break;
    }

    // Crear el mensaje principal del álbum.
    const album = await sock.sendMessage(jid, {
      album: { expectedImageCount: imagenes.length }
    }, { quoted: m });

    // Asociar cada imagen al mismo álbum.
    for (const foto of imagenes) {
      await sock.sendMessage(jid, {
        image: foto.buffer,
        caption: '📌 ' + foto.titulo,
        albumParentKey: album.key
      });
    }

    try { await sock.sendMessage(jid, { react: { text: '✅', key: m.key } }); } catch (e) {}
  } catch (e) {
    console.log('Error buscando PIN:', e.message);
    await responder('❌ No se pudieron buscar las imágenes.');
  }
  break;
}

case 'ruleta': case 'ruletarusa': {
  try {
    if (!jid.endsWith('@g.us')) {
      await responder('❌ Este juego solo funciona en grupos.');
      break;
    }
    if (!global.salasRuleta) global.salasRuleta = {};
    if (global.salasRuleta[jid]?.activa) {
      await responder('❌ Ya hay una partida activa.');
      break;
    }

    const creador = m.key.participant || m.key.remoteJid;
    const sala = {
      creador,
      participantes: [creador],
      activa: true,
      timer: null
    };
    global.salasRuleta[jid] = sala;

    await sock.sendMessage(jid, {
      text: '🎲 *SORTEO ALEATORIO*\n\n👥 @' + creador.split('@')[0] +
        ' ha creado una partida.\n\nEscribe *.unirme* para participar.\n' +
        '⏳ Tienes 30 segundos o el creador puede escribir *.iniciar*. ',
      mentions: [creador]
    }, { quoted: m });

    sala.timer = setTimeout(async () => {
      try {
        const actual = global.salasRuleta?.[jid];
        if (!actual || !actual.activa) return;
        actual.activa = false;
        delete global.salasRuleta[jid];
        const elegido = actual.participantes[
          Math.floor(Math.random() * actual.participantes.length)
        ];
        await sock.sendMessage(jid, {
          text: '🎉 *SORTEO TERMINADO*\n\nPersona seleccionada al azar: @' +
            elegido.split('@')[0],
          mentions: [elegido]
        });
      } catch (e) {
        console.log('Error en sorteo automático:', e.message);
      }
    }, 30000);
  } catch (e) {
    console.log('Error en ruleta:', e.message);
    await responder('❌ No se pudo crear la partida.');
  }
  break;
}

case 'unirme': {
  try {
    const sender = m.key.participant || m.key.remoteJid;
    const sala = global.salasRuleta?.[jid];
    if (!sala || !sala.activa) {
      await responder('❌ No hay ninguna partida activa.');
      break;
    }
    if (sala.participantes.includes(sender)) {
      await responder('❌ Ya estás participando.');
      break;
    }
    sala.participantes.push(sender);
    await sock.sendMessage(jid, {
      text: '✅ @' + sender.split('@')[0] +
        ' se ha unido.\nParticipantes: *' + sala.participantes.length + '*',
      mentions: [sender]
    }, { quoted: m });
  } catch (e) {
    console.log('Error en unirme:', e.message);
    await responder('❌ No se pudo registrar tu participación.');
  }
  break;
}

case 'iniciar': {
  try {
    const sender = m.key.participant || m.key.remoteJid;
    const sala = global.salasRuleta?.[jid];
    if (!sala || !sala.activa) {
      await responder('❌ No hay ninguna partida activa.');
      break;
    }
    if (sala.creador !== sender) {
      await responder('❌ Solo quien creó la partida puede iniciarla.');
      break;
    }
    clearTimeout(sala.timer);
    sala.activa = false;
    delete global.salasRuleta[jid];
    const elegido = sala.participantes[
      Math.floor(Math.random() * sala.participantes.length)
    ];
    await sock.sendMessage(jid, {
      text: '🎉 *SORTEO TERMINADO*\n\nPersona seleccionada al azar: @' +
        elegido.split('@')[0],
      mentions: [elegido]
    }, { quoted: m });
  } catch (e) {
    console.log('Error al iniciar sorteo:', e.message);
    await responder('❌ No se pudo completar el sorteo.');
  }
  break;
}

case 'cancelarruleta': {
  try {
    const sender = m.key.participant || m.key.remoteJid;
    const sala = global.salasRuleta?.[jid];
    if (!sala || !sala.activa) {
      await responder('❌ No hay ninguna partida activa.');
      break;
    }
    if (sala.creador !== sender) {
      await responder('❌ Solo quien creó la partida puede cancelarla.');
      break;
    }
    clearTimeout(sala.timer);
    delete global.salasRuleta[jid];
    await responder('🛑 Partida cancelada correctamente.');
  } catch (e) {
    console.log('Error al cancelar sorteo:', e.message);
    await responder('❌ No se pudo cancelar la partida.');
  }
  break;
}


case 'grupo': {
  try {
    if (!jid.endsWith('@g.us')) { await responder('❌ Solo funciona en grupos.'); break; }
    
    // Verificar si es admin
    const groupMetadata = await sock.groupMetadata(jid);
    const sender = m.key.participant || m.key.remoteJid;
    const participant = groupMetadata.participants.find(p => p.id.split('@')[0].split(':')[0] === sender.split('@')[0].split(':')[0]);
    if (!participant || (participant.admin !== 'admin' && participant.admin !== 'superadmin')) {
       await responder('❌ Solo los administradores pueden usar este comando.');
       break;
    }

    const accion = cuerpo.slice(cmd.length).trim().toLowerCase();
    if (accion === 'abrir') {
      await sock.groupSettingUpdate(jid, 'not_announcement');
      await responder('🔓 Grupo abierto. Todos pueden hablar.');
    } else if (accion === 'cerrar') {
      await sock.groupSettingUpdate(jid, 'announcement');
      await responder('🔒 Grupo cerrado. Solo admins pueden hablar.');
    } else {
      await responder('Uso: #grupo abrir / cerrar');
    }
  } catch (e) {
    console.log('Error grupo:', e.message);
    await responder('❌ Error al cambiar el estado del grupo.');
  }
  break;
}


case 'musica': case 'm': {
  const query = cuerpo.slice(cmd.length).trim();
  if (!query) { await responder('Uso: #' + cmd + ' <nombre>'); break; }
  await responder('🔍 Buscando audio de: ' + query + '...');
  try {
    const yt = require('@denzy-official/youtube_scraper');
    const res = await conTiempo(yt.ytmp3(query), 12000);
    
    if (!res.status || !res.download || !res.download.url) {
      await responder('❌ No se pudo encontrar el audio o el servidor está saturado.');
      break;
    }

    const meta = res.metadata;
    const txt = '➩ Descargando › *' + meta.title + '*\n\n❖ Canal › *' + meta.author.name + '*\n⧖ Duración › *' + meta.timestamp + '*\n⏳ Espera un momento...';
    
    // Enviar tarjeta con foto
    if (meta.thumbnail) await sock.sendMessage(jid, { image: { url: meta.thumbnail }, caption: txt }, { quoted: m });
    else await sock.sendMessage(jid, { text: txt }, { quoted: m });

    // Descargar y enviar el audio
    const fileRes = await fetch(res.download.url);
    const buffer = Buffer.from(await fileRes.arrayBuffer());
    await sock.sendMessage(jid, { audio: buffer, mimetype: 'audio/mp4' }, { quoted: m });

  } catch (e) { 
    console.log('Error en play:', e.message);
    await responder('❌ Error al descargar el audio. Intenta de nuevo.'); 
  }
  break;
}

case 'tiktok': case 'tt': {
  const url = cuerpo.slice(cmd.length).trim();
  if (!url || !url.includes('tiktok.com')) {
    await responder('Uso: #tiktok <enlace de TikTok>');
    break;
  }
  await responder('⬇️ Descargando video de TikTok...');
  try {
    const res = await fetch('https://www.tikwm.com/api/?url=' + encodeURIComponent(url) + '&hd=1');
    const json = await res.json();
    if (json.code !== 0 || !json.data) { await responder('❌ Video no disponible o privado.'); break; }
    const videoRes = await fetch(json.data.play);
    const buffer = Buffer.from(await videoRes.arrayBuffer());
    await sock.sendMessage(jid, { video: buffer, caption: '🎬 *' + (json.data.title || 'TikTok') + '*\n👤 ' + (json.data.author ? json.data.author.nickname : 'Desconocido') }, { quoted: m });
  } catch (e) {
    console.log('Error en tiktok:', e.message);
    await responder('❌ Error descargando de TikTok.');
  }
  break;
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
      case 'perfil': case 'pr': {
  const sender = m.key.participant || m.key.remoteJid;
  const mencionado = (m.message?.extendedTextMessage?.contextInfo?.mentionedJid || [])[0] || m.message?.extendedTextMessage?.contextInfo?.participant;
  const target = mencionado || sender;
  const user = target.split('@')[0];
  
  const db = getPerfilDB();
  const p = db[target] || {};
  
  let txt = '👤 *PERFIL DE @' + user + '*\n\n';
  txt += '📝 *Descripción:* ' + (p.desc || 'No establecida') + '\n';
  txt += '🚻 *Género:* ' + (p.genero || 'No establecido') + '\n';
  txt += '🎂 *Cumpleaños:* ' + (p.cumple || 'No establecido') + '\n';
  txt += '💍 *Pareja:* ' + (p.pareja ? '@' + p.pareja.split('@')[0] : 'Solter@') + '\n';
  
  const menciones = [target]; 
  if (p.pareja) menciones.push(p.pareja);
  
  try {
    const pp = await sock.profilePictureUrl(target, 'image');
    await sock.sendMessage(jid, { image: { url: pp }, caption: txt, mentions: menciones }, { quoted: m });
  } catch (e) {
    // Si no hay foto, enviamos solo el texto
    await sock.sendMessage(jid, { text: txt, mentions: menciones }, { quoted: m });
  }
  break;
}
case 'pr': {
  const sender = m.key.participant || m.key.remoteJid;
  const user = sender.split('@')[0];
  const db = getPerfilDB();
  const p = db[sender] || {};
  let txt = `👤 *PERFIL DE @${user}*\n\n`;
  txt += `📝 *Descripción:* ${p.desc || 'No establecida'}\n`;
  txt += `🚻 *Género:* ${p.genero || 'No establecido'}\n`;
  txt += `🎂 *Cumpleaños:* ${p.cumple || 'No establecido'}\n`;
  txt += `💍 *Pareja:* ${p.pareja ? '@' + p.pareja.split('@')[0] : 'Solter@'}\n`;
  const menciones = [sender]; if (p.pareja) menciones.push(p.pareja);
  await sock.sendMessage(jid, { text: txt, mentions: menciones }, { quoted: m });
  break;
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

      case 'del': case 'borrar': {
  if (!jid.endsWith('@g.us')) {
    await responder('❌ Solo en grupos.');
    break;
  }

  const target = m.message?.extendedTextMessage?.contextInfo?.participant;
  if (!target) {
    await responder('❌ Responde al mensaje de la persona cuyos mensajes quieres borrar.');
    break;
  }

  let borrados = 0;
  const objetivo = target.split('@')[0].split(':')[0];

  try {
    const lista = mensajesRecientes[jid] || [];
    const msgsABorrar = lista.filter(x =>
      Array.isArray(x.ids) && x.ids.includes(objetivo)
    );

    const eliminados = [];

    for (const entrada of msgsABorrar) {
      try {
        await sock.sendMessage(jid, { delete: entrada.key });
        borrados++;
        eliminados.push(entrada);
        await new Promise(r => setTimeout(r, 250));
      } catch (err) {
        console.log('Error al borrar mensaje individual:', err.message);
      }
    }

    mensajesRecientes[jid] = lista.filter(x => !eliminados.includes(x));

    if (borrados > 0) {
      try {
        await sock.sendMessage(jid, { react: { text: '🗑️', key: m.key } });
      } catch (e) {}

      await sock.sendMessage(jid, {
        text: '🗑️ Se eliminaron ' + borrados + ' mensajes de @' + objetivo + '.',
        mentions: [target]
      }, { quoted: m });
    } else {
      await responder('⚠️ No encontré mensajes recientes de esa persona o necesito ser administrador.');
    }
  } catch (e) {
    console.log('Error en .del:', e.message);
    await responder('❌ No se pudieron borrar los mensajes.');
  }
  break;
}
case 'borrar': {
  if (!jid.endsWith('@g.us')) { await responder('❌ Solo en grupos.'); break; }
  
  let target = m.message?.extendedTextMessage?.contextInfo?.participant;
  if (!target) { await responder('❌ Responde al mensaje de la persona a la que le quieres borrar todo.'); break; }
  
  let borrados = 0;
  try {
    if (global.msgCache && global.msgCache[jid]) {
      const msgsABorrar = global.msgCache[jid].filter(k => k.participant === target || (k.participant && k.participant.includes(target.split('@')[0])));
      for (const k of msgsABorrar) {
        try { 
          await sock.sendMessage(jid, { delete: k }); 
          borrados++; 
          await new Promise(r => setTimeout(r, 250)); 
        } catch(err) {
          console.log('Error al borrar mensaje individual:', err.message);
        }
      }
    }
    
    if (borrados > 0) {
      try { await sock.sendMessage(jid, { react: { text: '🗑️', key: m.key } }); } catch (e) {}
      await sock.sendMessage(jid, { text: '🗑️ Se eliminaron ' + borrados + ' mensajes de @' + target.split('@')[0] + '.', mentions: [target] }, { quoted: m });
    } else {
      await responder('⚠️ No encontré mensajes recientes en caché de este usuario, o no soy administrador.');
    }
  } catch(e) {
    if (e.message.includes('forbidden') || e.message.includes('not-authorized')) {
       await responder('❌ Necesito ser administrador para borrar mensajes.');
    }
  }
  break;
}
case 'borrar': {
  if (!jid.endsWith('@g.us')) { await responder('❌ Solo en grupos.'); break; }
  try {
    
    const groupMetadata = await sock.groupMetadata(jid);
    // Obtener el ID del bot de forma robusta
    const botIdRaw = sock.user.id.split(':')[0];
    const botJid = botIdRaw + '@s.whatsapp.net';
    
    // Buscar al bot en el grupo de 3 formas distintas por si WhatsApp cambia el formato
    const botParticipant = groupMetadata.participants.find(p => 
      p.id === botJid || 
      p.id === sock.user.id || 
      p.id.split('@')[0].split(':')[0] === botIdRaw
    );
    
    // Verificar si es admin (true, 'admin' o 'superadmin')
    const isBotAdmin = botParticipant && (botParticipant.admin === 'admin' || botParticipant.admin === 'superadmin' || botParticipant.admin === true);
    
    if (!isBotAdmin) {
      await responder('❌ Necesito ser administrador. (Asegúrate de que el bot tenga el rango de Admin en el grupo).');
      break;
    }

    
    let target = m.message?.extendedTextMessage?.contextInfo?.participant;
    if (!target) { await responder('❌ Responde al mensaje de la persona a la que le quieres borrar todo.'); break; }
    
    try { await sock.sendMessage(jid, { react: { text: '🗑️', key: m.key } }); } catch (e) {}
    
    let borrados = 0;
    if (global.msgCache && global.msgCache[jid]) {
      const msgsABorrar = global.msgCache[jid].filter(k => k.participant === target || (k.participant && k.participant.includes(target.split('@')[0])));
      for (const k of msgsABorrar) {
        try { await sock.sendMessage(jid, { delete: k }); borrados++; await new Promise(r => setTimeout(r, 250)); } catch(err) {}
      }
    }
    await sock.sendMessage(jid, { text: '🗑️ Se eliminaron ' + borrados + ' mensajes de @' + target.split('@')[0] + '.', mentions: [target] }, { quoted: m });
  } catch (e) {
    console.log('Error .del:', e.message);
  }
  break;
}
case 'borrar': {
  if (!jid.endsWith('@g.us')) { await responder('❌ Solo en grupos.'); break; }
  try {
    const groupMetadata = await sock.groupMetadata(jid);
    const botNumber = sock.user.id.split(':')[0].split('@')[0];
    const botParticipant = groupMetadata.participants.find(p => p.id.startsWith(botNumber));
    
    if (!botParticipant || (botParticipant.admin !== 'admin' && botParticipant.admin !== 'superadmin')) {
      await responder('❌ Necesito ser administrador para borrar.');
      break;
    }
    
    let target = m.message?.extendedTextMessage?.contextInfo?.participant;
    if (!target) { await responder('❌ Responde al mensaje de la persona a la que le quieres borrar todo.'); break; }
    
    try { await sock.sendMessage(jid, { react: { text: '🗑️', key: m.key } }); } catch (e) {}
    
    let borrados = 0;
    if (global.msgCache && global.msgCache[jid]) {
      const msgsABorrar = global.msgCache[jid].filter(k => k.participant === target || (k.participant && k.participant.includes(target.split('@')[0])));
      for (const k of msgsABorrar) {
        try { await sock.sendMessage(jid, { delete: k }); borrados++; await new Promise(r => setTimeout(r, 250)); } catch(err) {}
      }
    }
    await sock.sendMessage(jid, { text: '🗑️ Se eliminaron ' + borrados + ' mensajes de @' + target.split('@')[0] + '.', mentions: [target] }, { quoted: m });
  } catch (e) {
    console.log('Error .del:', e.message);
  }
  break;
}
case 'borrar': {
  if (!jid.endsWith('@g.us')) { await responder('❌ Este comando solo funciona en grupos.'); break; }
  
  // Verificar que el bot sea admin
  const groupMetadata = await sock.groupMetadata(jid);
  const botNumber = sock.user.id.split(':')[0].split('@')[0];
  const botParticipant = groupMetadata.participants.find(p => p.id.startsWith(botNumber));
  if (!botParticipant || (botParticipant.admin !== 'admin' && botParticipant.admin !== 'superadmin')) {
    await responder('❌ Necesito ser administrador para borrar mensajes.');
    break;
  }

  // Detectar a quién se le van a borrar los mensajes
  let target = m.message?.extendedTextMessage?.contextInfo?.participant;
  
  if (!target) {
    await responder('❌ Responde al mensaje de la persona a la que le quieres borrar todo.');
    break;
  }

  // Reaccionar con la escoba o basura 🗑️
  try { await sock.sendMessage(jid, { react: { text: '🗑️', key: m.key } }); } catch (e) {}

  let borrados = 0;
  
  // Borrar el mensaje al que le respondiste
  try {
    await sock.sendMessage(jid, { delete: m.message.extendedTextMessage.contextInfo.stanzaId ? { remoteJid: jid, id: m.message.extendedTextMessage.contextInfo.stanzaId, participant: target } : m.key });
    borrados++;
  } catch(e) {}

  // Borrar TODOS los mensajes de su caché
  if (global.msgCache && global.msgCache[jid]) {
    const msgsABorrar = global.msgCache[jid].filter(k => k.participant === target || (k.participant && k.participant.includes(target.split('@')[0])));
    
    for (const k of msgsABorrar) {
      try { 
        await sock.sendMessage(jid, { delete: k }); 
        borrados++;
        await new Promise(r => setTimeout(r, 250)); // Pausa para no ser baneados por spam
      } catch(err) {}
    }
  }

  await sock.sendMessage(jid, { text: `🗑️ Se eliminaron ${borrados} mensajes de @${target.split('@')[0]}.`, mentions: [target] }, { quoted: m });
  break;
}
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

      case 'ban': case 'kick': {
  if (!jid.endsWith('@g.us')) { await responder('❌ Solo en grupos.'); break; }
  
  let mencionado = (m.message?.extendedTextMessage?.contextInfo?.mentionedJid || [])[0] || m.message?.extendedTextMessage?.contextInfo?.participant;
  if (!mencionado) { await responder('❌ Menciona o responde a alguien.'); break; }
  
  try {
    // Intentar expulsar directamente. Si el bot no es admin, WhatsApp lanzará el error aquí.
    await sock.groupParticipantsUpdate(jid, [mencionado], 'remove');
    
    // Si llegó aquí, funcionó
    try { await sock.sendMessage(jid, { react: { text: '👢', key: m.key } }); } catch (e) {}
    await sock.sendMessage(jid, { text: '👢 @' + mencionado.split('@')[0] + ' ha sido pateado.', mentions: [mencionado] }, { quoted: m });
    
    // Borrar mensajes en caché
    if (global.msgCache && global.msgCache[jid]) {
      const msgsABorrar = global.msgCache[jid].filter(k => (k.participant === mencionado || (k.participant && k.participant.includes(mencionado.split('@')[0]))));
      for (const k of msgsABorrar) {
        try { await sock.sendMessage(jid, { delete: k }); await new Promise(r => setTimeout(r, 200)); } catch(err) {}
      }
    }
  } catch (e) {
    console.log('Error al banear:', e.message);
    if (e.message.includes('forbidden') || e.message.includes('not-authorized') || e.message.includes('admin')) {
      await responder('❌ Necesito ser administrador del grupo para expulsar.');
    } else {
      await responder('❌ Error al expulsar. El usuario pudo haber salido o no tengo permisos.');
    }
  }
  break;
}
case 'kick': {
  if (!jid.endsWith('@g.us')) { await responder('❌ Solo en grupos.'); break; }
  try {
    
    const groupMetadata = await sock.groupMetadata(jid);
    // Obtener el ID del bot de forma robusta
    const botIdRaw = sock.user.id.split(':')[0];
    const botJid = botIdRaw + '@s.whatsapp.net';
    
    // Buscar al bot en el grupo de 3 formas distintas por si WhatsApp cambia el formato
    const botParticipant = groupMetadata.participants.find(p => 
      p.id === botJid || 
      p.id === sock.user.id || 
      p.id.split('@')[0].split(':')[0] === botIdRaw
    );
    
    // Verificar si es admin (true, 'admin' o 'superadmin')
    const isBotAdmin = botParticipant && (botParticipant.admin === 'admin' || botParticipant.admin === 'superadmin' || botParticipant.admin === true);
    
    if (!isBotAdmin) {
      await responder('❌ Necesito ser administrador. (Asegúrate de que el bot tenga el rango de Admin en el grupo).');
      break;
    }

    
    let mencionado = (m.message?.extendedTextMessage?.contextInfo?.mentionedJid || [])[0] || m.message?.extendedTextMessage?.contextInfo?.participant;
    if (!mencionado) { await responder('❌ Menciona o responde a alguien para banearlo.'); break; }
    
    const targetParticipant = groupMetadata.participants.find(p => p.id.split('@')[0].split(':')[0] === mencionado.split('@')[0].split(':')[0]);
    if (targetParticipant && (targetParticipant.admin === 'admin' || targetParticipant.admin === 'superadmin')) {
      await responder('❌ No puedo banear a un administrador.');
      break;
    }
    
    try { await sock.sendMessage(jid, { react: { text: '👢', key: m.key } }); } catch (e) {}
    
    let expulsado = false;
    try {
      await sock.groupParticipantsUpdate(jid, [mencionado], 'remove');
      expulsado = true;
      await sock.sendMessage(jid, { text: '👢 @' + mencionado.split('@')[0] + ' ha sido pateado.', mentions: [mencionado] }, { quoted: m });
    } catch (e) {
      try {
        const num = mencionado.split('@')[0].split(':')[0];
        await sock.groupParticipantsUpdate(jid, [num + '@s.whatsapp.net'], 'remove');
        expulsado = true;
        await sock.sendMessage(jid, { text: '👢 @' + num + ' ha sido pateado.', mentions: [num + '@s.whatsapp.net'] }, { quoted: m });
      } catch (e2) {}
    }
    
    if (expulsado && global.msgCache && global.msgCache[jid]) {
      const msgsABorrar = global.msgCache[jid].filter(k => (k.participant === mencionado || (k.participant && k.participant.includes(mencionado.split('@')[0]))));
      for (const k of msgsABorrar) {
        try { await sock.sendMessage(jid, { delete: k }); await new Promise(r => setTimeout(r, 200)); } catch(err) {}
      }
    }
  } catch (e) {
    console.log('Error .ban:', e.message);
    await responder('❌ Error interno al banear.');
  }
  break;
}
case 'kick': {
  if (!jid.endsWith('@g.us')) { await responder('❌ Este comando solo funciona en grupos.'); break; }
  try {
    const groupMetadata = await sock.groupMetadata(jid);
    const botNumber = sock.user.id.split(':')[0].split('@')[0];
    const botParticipant = groupMetadata.participants.find(p => p.id.startsWith(botNumber));
    
    if (!botParticipant || (botParticipant.admin !== 'admin' && botParticipant.admin !== 'superadmin')) {
      await responder('❌ Necesito ser administrador para banear.');
      break;
    }
    
    let mencionado = (m.message?.extendedTextMessage?.contextInfo?.mentionedJid || [])[0] || m.message?.extendedTextMessage?.contextInfo?.participant;
    if (!mencionado) { await responder('❌ Menciona o responde a alguien para banearlo.'); break; }
    
    const targetParticipant = groupMetadata.participants.find(p => p.id.split('@')[0].split(':')[0] === mencionado.split('@')[0].split(':')[0]);
    if (targetParticipant && (targetParticipant.admin === 'admin' || targetParticipant.admin === 'superadmin')) {
      await responder('❌ No puedo banear a un administrador.');
      break;
    }
    
    try { await sock.sendMessage(jid, { react: { text: '👢', key: m.key } }); } catch (e) {}
    
    let expulsado = false;
    try {
      await sock.groupParticipantsUpdate(jid, [mencionado], 'remove');
      expulsado = true;
      await sock.sendMessage(jid, { text: '👢 @' + mencionado.split('@')[0] + ' ha sido pateado.', mentions: [mencionado] }, { quoted: m });
    } catch (e) {
      try {
        const num = mencionado.split('@')[0].split(':')[0];
        await sock.groupParticipantsUpdate(jid, [num + '@s.whatsapp.net'], 'remove');
        expulsado = true;
        await sock.sendMessage(jid, { text: '👢 @' + num + ' ha sido pateado.', mentions: [num + '@s.whatsapp.net'] }, { quoted: m });
      } catch (e2) {}
    }
    
    if (expulsado && global.msgCache && global.msgCache[jid]) {
      const msgsABorrar = global.msgCache[jid].filter(k => (k.participant === mencionado || (k.participant && k.participant.includes(mencionado.split('@')[0]))));
      for (const k of msgsABorrar) {
        try { await sock.sendMessage(jid, { delete: k }); await new Promise(r => setTimeout(r, 200)); } catch(err) {}
      }
    }
  } catch (e) {
    console.log('Error .ban:', e.message);
    await responder('❌ Error interno al banear.');
  }
  break;
}
case 'kick': {
  if (!jid.endsWith('@g.us')) { await responder('❌ Este comando solo funciona en grupos.'); break; }
  
  const groupMetadata = await sock.groupMetadata(jid);
  const botNumber = sock.user.id.split(':')[0].split('@')[0];
  const botParticipant = groupMetadata.participants.find(p => p.id.startsWith(botNumber));
  if (!botParticipant || (botParticipant.admin !== 'admin' && botParticipant.admin !== 'superadmin')) {
    await responder('❌ Necesito ser administrador para banear y borrar mensajes.');
    break;
  }

  const mencionado = (m.message?.extendedTextMessage?.contextInfo?.mentionedJid || [])[0] || m.message?.extendedTextMessage?.contextInfo?.participant;
  if (!mencionado) {
    await responder('❌ Menciona a alguien o responde a su mensaje para banearlo.');
    break;
  }

  const targetParticipant = groupMetadata.participants.find(p => p.id.split('@')[0].split(':')[0] === mencionado.split('@')[0].split(':')[0]);
  if (targetParticipant && (targetParticipant.admin === 'admin' || targetParticipant.admin === 'superadmin')) {
    await responder('❌ No puedo banear a un administrador. Quítale el rango primero.');
    break;
  }

  // Reaccionar con la bota 👢
  try {
    await sock.sendMessage(jid, { react: { text: '👢', key: m.key } });
  } catch (e) {}

  // Expulsar al usuario
  try {
    await sock.groupParticipantsUpdate(jid, [mencionado], 'remove');
    await sock.sendMessage(jid, { text: `👢 @${mencionado.split('@')[0]} ha sido pateado del grupo.`, mentions: [mencionado] }, { quoted: m });
  } catch (e) {
    console.log('Error al expulsar:', e.message);
    await responder('❌ No pude expulsar al usuario.');
  }

  // Borrar mensajes recientes del usuario (si están en caché)
  try {
    let borrados = 0;
    if (global.mensajes && global.mensajes[jid]) {
      const mensajesUsuario = global.mensajes[jid].filter(msg => msg.key.participant === mencionado || msg.key.remoteJid === mencionado);
      for (const msg of mensajesUsuario) {
        try {
          await sock.sendMessage(jid, { delete: msg.key });
          borrados++;
        } catch (err) {}
      }
    }
    if (borrados > 0) console.log(`🗑️ Se borraron ${borrados} mensajes de ${mencionado.split('@')[0]}`);
  } catch (e) {
    console.log('Error al intentar borrar mensajes:', e.message);
  }

  break;
}
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
  // --- TIMEOUT DE VINCULACION ---
  const senderCode = m.key.participant || m.key.remoteJid;
  let numCode = cuerpo.slice(cmd.length).trim().replace(/[^0-9]/g, '');
  if (!numCode) numCode = senderCode.split('@')[0];
  
  if (!global.pendingCodes) global.pendingCodes = {};
  if (global.pendingCodes[senderCode]) clearTimeout(global.pendingCodes[senderCode].timer);
  
  const timerCode = setTimeout(async () => {
    if (global.pendingCodes[senderCode]) {
      delete global.pendingCodes[senderCode];
      await sock.sendMessage(jid, { text: '❌ Lo siento, no te has podido vincular a tiempo. Vuelve a intentarlo.' });
    }
  }, 300000); // 5 minutos
  global.pendingCodes[senderCode] = { target: numCode, timer: timerCode };
  // ------------------------------
        
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
            await responder('Uso: #setupdate herramientas on|off\nActivado, el bot descarga yt-dlp --extractor-args "youtube:player_client=android" y ffmpeg (unos 120 MB). Solo para servidores con espacio.')
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
            await responder('ℹ️ En Termux se instalan con: pkg install yt-dlp --extractor-args "youtube:player_client=android" ffmpeg')
            break
          }
          if (libreH !== null && libreH < 300) {
            await responder('⚠️ Hay poco espacio (' + libreH + ' MB) y necesito unos 300 MB libres. Prueba con #limpiar y revisa #espacio.')
            break
          }
          cfgH.herramientas = true
          guardarConfig(cfgH)
          await responder('⏳ Instalando yt-dlp --extractor-args "youtube:player_client=android" y ffmpeg. Esto puede tardar uno o dos minutos...')
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

      case 'horario':
      case 'nombregrupo':
      case 'descripcion':
      case 'admins':
      case 'fantasmas': {
        const admEs = jid.endsWith('@g.us') ? await esAdmin(sock, m) : false
        const rAdm = await admin.ejecutar(sock, m, comando, {
          args,
          cuerpo: cuerpo.slice(cmd.length).trim(),
          esAdmin: admEs,
          actividad: typeof actividad !== 'undefined' ? (actividad[jid] || {}) : {}
        })
        if (rAdm.texto) {
          await sock.sendMessage(jid, { text: rAdm.texto, mentions: rAdm.mentions || [] }, { quoted: m })
        }
        break
      }

      case 'villancico': {
        const titulosVl = [
          'Noche de paz', 'Campana sobre campana', 'Los peces en el río', 'Mi burrito sabanero',
          'Ay del chiquirritín', 'Pastores venid', 'Arre borriquito', 'Din don dan',
          'La marimorena', 'Hacia Belén va una burra', 'Feliz Navidad'
        ]
        const pedidoVl = cuerpo.slice(cmd.length).trim()
        const buscarVl = 'villancico ' + (pedidoVl || titulosVl[Math.floor(Math.random() * titulosVl.length)])
        const rVl = await rapido.procesar({
          tipo: 'musica',
          entrada: buscarVl,
          usuario: m.key.participant || m.key.remoteJid,
          tarjeta: async (texto, miniatura) => {
            if (miniatura) await sock.sendMessage(jid, { image: miniatura, caption: texto }, { quoted: m })
            else await sock.sendMessage(jid, { text: texto }, { quoted: m })
          }
        })
        if (!rVl.ok) {
          await responder('❌ ' + rVl.error)
          break
        }
        try {
          await sock.sendMessage(jid, { audio: fs.readFileSync(rVl.ruta), mimetype: rVl.mimetype }, { quoted: m })
        } catch (e) {
          console.log('Error al enviar el villancico:', e.message)
          await responder('❌ Error al enviar el archivo.')
        } finally {
          try { fs.unlinkSync(rVl.ruta) } catch {}
        }
        break
      }

      case 'mapa': {
        const lugarMp = cuerpo.slice(cmd.length).trim()
        if (!lugarMp) {
          await responder('Uso: #mapa <lugar>. Ejemplo: #mapa Obelisco Buenos Aires')
          break
        }
        const rMp = await extras.buscarLugar(lugarMp)
        if (!rMp.ok) {
          await responder('❌ ' + rMp.error)
          break
        }
        try {
          await sock.sendMessage(jid, {
            location: { degreesLatitude: rMp.lat, degreesLongitude: rMp.lon, name: rMp.nombre, address: rMp.direccion }
          }, { quoted: m })
        } catch (e) {
          console.log('Error al enviar la ubicación:', e.message)
        }
        await sock.sendMessage(jid, {
          text: '📍 *' + rMp.nombre + '*\n' + rMp.direccion +
            '\n\n🗺️ Google Maps: https://maps.google.com/?q=' + rMp.lat + ',' + rMp.lon +
            '\n🌍 OpenStreetMap: https://www.openstreetmap.org/?mlat=' + rMp.lat + '&mlon=' + rMp.lon + '#map=16/' + rMp.lat + '/' + rMp.lon
        }, { quoted: m })
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
