const BOT = {
  nombre: 'Shisui Bot',
  version: '1.5.0',
  creador: '50494874330',
  zona: 'America/Tegucigalpa',
  prefijos: '! # . / y otros'
}

function fechaHora() {
  const ahora = new Date()
  return {
    fecha: ahora.toLocaleDateString('es-HN', { timeZone: BOT.zona }),
    hora: ahora.toLocaleTimeString('es-HN', { timeZone: BOT.zona, hour12: false })
  }
}

const secciones = [
  ['📌 INFORMACIÓN Y AYUDA', [
    '#menu — Muestra el menú principal.',
    '#bot — Muestra información del bot.',
    '#ping — Comprueba la respuesta del bot.',
    '#reglas — Muestra las reglas del grupo.',
    '#reporte / #r — Envía un reporte.',
    '#consejo — Muestra un consejo.',
    '#link — Muestra el enlace del grupo.'
  ]],

  ['📥 DESCARGAS', [
    '#play / #musica / #m — Busca y descarga música.',
    '#video / #v — Busca y descarga videos.',
    '#tiktok / #tt — Descarga contenido de TikTok.',
    '#facebook / #fb — Descarga contenido de Facebook.',
    '#instagram / #ig — Descarga contenido de Instagram.',
    '#pinterest — Descarga contenido de Pinterest.',
    '#x — Ejecuta herramientas para X.'
  ]],

  ['🎭 STICKERS Y MULTIMEDIA', [
    '#sticker / #s — Crea stickers.',
    '#random / #stik — Envía stickers aleatorios.',
    '#packname / #stickername — Configura el nombre del paquete.',
    '#toqr — Convierte texto en código QR.',
    '#tomp3 — Convierte audio o video a MP3.',
    '#tovideo / #a2v — Convierte audio en video.',
    '#voz — Genera o envía audio.',
    '#fake / #fq — Genera contenido ficticio.',
    '#pfp / #perfil — Muestra una foto de perfil.',
    '#fotogrupo / #gpfp — Muestra la foto del grupo.',
    '#party — Ejecuta el comando Party.'
  ]],

  ['🤖 INTELIGENCIA ARTIFICIAL', [
    '#ia — Pregunta a la inteligencia artificial.',
    '#chatgpt — Consulta al asistente de IA.',
    '#gpt — Envía una pregunta a la IA.'
  ]],

  ['🔥 RACHAS DE AMISTAD', [
    '#racha @persona — Invita a alguien a crear una racha.',
    '#aceptarracha — Acepta una invitación.',
    '#miracha — Consulta tu racha y récord.',
    '#rechazarracha — Rechaza una invitación.',
    '#desactivarracha — Desactiva la racha.'
  ]],

  ['🎮 SISTEMA GACHA', [
    '#gachamenu / #ayudagacha — Muestra la ayuda Gacha.',
    '#gacha / #roll / #tirar — Realiza una invocación.',
    '#daily / #diario — Reclama la recompensa diaria.',
    '#monedas / #balance / #cartera — Consulta tus monedas.',
    '#reclamar / #claim — Reclama una recompensa.',
    '#coleccion / #col / #mispj — Consulta tus personajes.',
    '#topgacha / #rankgacha — Consulta el ranking.',
    '#w — Trabaja y gana monedas.',
    '#nivel — Consulta tu nivel.',
    '#xp — Consulta tu experiencia.',
    '#topnivel — Muestra el ranking de niveles.',
    '#misiones — Consulta tus misiones diarias.',
    '#recompensas — Consulta tus recompensas.',
    '#tiendagacha — Abre la tienda.',
    '#inventario — Consulta tus objetos.',
    '#usar — Utiliza un objeto.',
    '#fusionar — Fusiona personajes.',
    '#favorito — Selecciona tu personaje favorito.',
    '#regalar / #darpj / #dar — Regala un personaje.',
    '#darmonedas — Envía monedas.',
    '#intercambiar / #trade — Propone un intercambio.',
    '#aceptar — Acepta una propuesta.',
    '#rechazar — Rechaza una propuesta.',
    '#addpj — Agrega un personaje al sistema.'
  ]],

  ['🎉 EVENTOS ESPECIALES', [
    '#navidad — Accede al evento de Navidad.',
    '#nochebuena — Accede al evento de Nochebuena.',
    '#anonuevo — Accede al evento de Año Nuevo.',
    '#felicitar — Envía felicitaciones.',
    '#arbol — Interactúa con el árbol.'
  ]],

  ['👥 ADMINISTRACIÓN DE GRUPOS', [
    '#cerrar — Restringe los mensajes del grupo.',
    '#abrir — Abre nuevamente el grupo.',
    '#status — Consulta el estado del grupo.',
    '#setpfp — Cambia la foto del grupo.',
    '#mutear / #mute — Silencia a un usuario.',
    '#desmutear / #unmute — Quita el silencio.',
    '#del / #borrar — Elimina un mensaje.',
    '#botlist — Muestra la lista de bots.',
    '#antilink — Configura la protección contra enlaces.',
    '#promote — Promueve a un administrador.',
    '#demote — Quita el rango de administrador.',
    '#bienvenida — Configura el mensaje de bienvenida.',
    '#despedida — Configura el mensaje de despedida.',
    '#cambiarenlace / #cambiarlink — Cambia el enlace del grupo.',
    '#tag — Menciona a los participantes.',
    '#topactive / #topactivos — Muestra los usuarios activos.',
    '#modoadmin — Configura el modo administrador.',
    '#ban / #kick — Expulsa a un usuario.',
    '#advertencia / #adv — Gestiona advertencias.',
    '#aviso — Envía un aviso.',
    '#aprobartodo — Gestiona solicitudes de ingreso.'
  ]],

  ['👑 COMANDOS DEL DUEÑO', [
    '#registrargrupo — Registra un grupo en el sistema.',
    '#setmenu — Personaliza el menú.',
    '#setowner — Agrega un propietario.',
    '#delowner — Elimina un propietario.',
    '#owners — Muestra los propietarios.',
    '#setnombre — Cambia el nombre del bot.',
    '#setdespedida — Configura la despedida.',
    '#setperfil — Configura el perfil.',
    '#setban — Configura el sistema de bloqueos.',
    '#setred — Cambia el canal oficial.',
    '#setprotect — Configura las protecciones.',
    '#setnsfw — Activa o desactiva el filtro NSFW.',
    '#activarbot / #desactivarbot — Activa o desactiva el bot.'
  ]],

  ['📱 SISTEMA DE SUBBOTS', [
    '#code — Genera un código para vincular un subbot.',
    '#delcode — Elimina un código de vinculación.',
    '#subs — Muestra información de los subbots.'
  ]],

  ['⚙️ MANTENIMIENTO Y SEGURIDAD', [
    '#fix — Actualiza los archivos del bot.',
    '#setupdate — Configura la conexión con GitHub.',
    '#key — Gestiona la clave de acceso.'
  ]],

  ['🔞 +18 (solo si #setnsfw está activado)', [
    '#verdad — Inicia el juego de verdad.',
    '#reto — Propone un reto.',
    '#yonunca — Inicia el juego Yo Nunca.',
    '#piropo — Envía un piropo.'
  ]]
]

function generarMenu(nsfw) {
  const { fecha, hora } = fechaHora()
  let config = {}

  try {
    config = JSON.parse(require('fs').readFileSync('./config.json', 'utf8'))
  } catch {}

  const nombre = config.nombre || BOT.nombre
  const red = config.red || 'https://whatsapp.com/channel/0029VbDBJk4BfxoCBx5ov41y'

  let texto = `╭━━━━━━━━━━━━━━━━━━━━╮
       🤖 *${nombre.toUpperCase()}*
       ✦ MENÚ PRINCIPAL ✦
╰━━━━━━━━━━━━━━━━━━━━╯

╭━━〔 INFORMACIÓN DEL BOT 〕
┃ 📦 Versión: ${BOT.version}
┃ 👑 Creador: ${BOT.creador}
┃ 📅 Fecha: ${fecha}
┃ 🕒 Hora: ${hora} (Honduras 🇭🇳)
┃ ⚡ Prefijos: ${BOT.prefijos}
┃ 📢 Canal: ${red}
╰━━━━━━━━━━━━━━━━━━━━\n`

  for (const [titulo, comandos] of secciones) {
    if (!nsfw && titulo.includes('+18')) continue
    texto += `\n┏━━「 ${titulo} 」\n`
    texto += comandos.map(c => `┃ ➳ ${c}`).join('\n')
    texto += '\n┗━━━━━━━━━━━━━━━━━━\n'
  }

  texto += '\n╭━━━━━━━━━━━━━━━━━━━━╮\n'
  texto += '      ✦ *SHISUI BOT v1.5.0* ✦\n'
  texto += '       Gracias por utilizarlo\n'
  texto += '╰━━━━━━━━━━━━━━━━━━━━╯'

  return texto
}

module.exports = { generarMenu }
