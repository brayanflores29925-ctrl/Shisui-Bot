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
  ['⚙️ CONFIGURACIÓN', [
    '#setmenu — Personaliza el menú.',
    '#setowner — Agrega un propietario.',
    '#delowner — Elimina un propietario.',
    '#owners — Muestra los propietarios.',
    '#activarbot / #desactivarbot — Activa o desactiva el bot.',
    '#setnombre — Cambia el nombre del bot.',
    '#setdespedida — Configura la despedida.',
    '#setperfil — Configura el perfil.',
    '#setban — Configura el sistema de bloqueos.',
    '#setred — Cambia el canal oficial.',
    '#key — Gestiona la clave de acceso.',
    '#setprotect — Configura las protecciones.',
    '#setnsfw — Activa o desactiva la sección +18.',
    '#fix — Actualiza los archivos del bot.',
    '#setupdate — Configura la conexión con GitHub.'
  ]],
  ['✨ GENERALES', [
    '#link — Muestra el enlace del grupo.',
    '#menu — Muestra el menú principal.',
    '#reglas — Muestra las reglas.',
    '#musica / #m / #play — Busca y descarga música.',
    '#video / #v — Busca y descarga videos.',
    '#sticker / #s — Crea stickers.',
    '#random / #stik — Envía stickers aleatorios.',
    '#reporte / #r — Envía un reporte.',
    '#ping — Comprueba la respuesta del bot.',
    '#piti — Ejecuta el comando Piti.',
    '#pfp / #perfil — Muestra una foto de perfil.',
    '#fotogrupo / #gpfp — Muestra la foto del grupo.',
    '#consejo — Muestra un consejo.',
    '#voz — Genera o envía audio.',
    '#fake / #fq — Genera contenido ficticio.',
    '#party — Ejecuta el comando Party.',
    '#packname / #stickername — Configura el nombre del paquete.',
    '#toqr — Convierte texto en código QR.',
    '#tomp3 — Convierte audio o video a MP3.',
    '#tovideo / #a2v — Convierte audio en video.',
    '#tiktok / #tt — Descarga contenido de TikTok.',
    '#facebook / #fb — Descarga contenido de Facebook.',
    '#x — Ejecuta herramientas para X.',
    '#instagram / #ig — Descarga contenido de Instagram.',
    '#pinterest — Descarga contenido de Pinterest.',
    '#code — Genera un código para vincular un subbot.',
    '#delcode — Elimina un código de vinculación.',
    '#subs — Muestra información de los subbots.'
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
  ['🎮 GACHA MENU', [
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
    '#topnivel — Ranking de niveles.',
    '#misiones — Consulta tus misiones diarias.',
    '#recompensas — Reclama tus premios.',
    '#tiendagacha — Abre la tienda y compra tickets.',
    '#inventario — Consulta tus objetos.',
    '#usar — Utiliza un ticket de invocación.',
    '#fusionar — Fusiona 3 copias de un personaje.',
    '#favorito — Selecciona tu personaje favorito.',
    '#regalar / #darpj / #dar — Regala un personaje.',
    '#darmonedas — Envía monedas.',
    '#intercambiar / #trade — Propone un intercambio.',
    '#aceptar — Acepta un intercambio.',
    '#rechazar — Rechaza un intercambio.',
    '#addpj — Agrega un personaje al sistema.'
  ]],
  ['🎄 NAVIDAD', [
    '#navidad', '#nochebuena', '#anonuevo', '#felicitar', '#arbol'
  ]],
  ['👥 GRUPOS / ADMIN', [
    '#cerrar — Restringe los mensajes del grupo.',
    '#abrir — Abre nuevamente el grupo.',
    '#status — Consulta el estado.',
    '#setpfp — Cambia la foto del grupo.',
    '#mutear / #mute — Silencia a un usuario.',
    '#desmutear / #unmute — Quita el silencio.',
    '#del / #borrar — Elimina un mensaje.',
    '#botlist — Muestra la lista de bots.',
    '#bot — Muestra información del bot.',
    '#antilink — Configura la protección contra enlaces.',
    '#promote — Promueve a un administrador.',
    '#demote — Quita el rango de administrador.',
    '#bienvenida — Configura la bienvenida.',
    '#despedida — Configura la despedida.',
    '#cambiarenlace / #cambiarlink — Cambia el enlace del grupo.',
    '#tag — Menciona a los participantes.',
    '#topactive / #topactivos — Muestra los usuarios activos.',
    '#modoadmin — Configura el modo administrador.',
    '#ban / #kick — Expulsa a un usuario.',
    '#advertencia / #adv — Gestiona advertencias.',
    '#aviso — Envía un aviso.',
    '#aprobartodo — Gestiona solicitudes de ingreso.'
  ]],
  ['🔞 +18 (solo si #setnsfw está en on)', [
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

  let texto = `VERSION ${BOT.version} • ONLINE
╭━━〔 INFORMACIÓN DEL BOT 〕
┃ 🤖 Nombre: ${nombre}
┃ 📦 Versión: ${BOT.version}
┃ 👑 Creador: ${BOT.creador}
┃ 📅 Fecha: ${fecha}
┃ 🕒 Hora: ${hora} (Honduras 🇭🇳)
┃ ⚡ Prefijos: ${BOT.prefijos}
┃ 📢 Canal oficial: ${red}
╰━━━━━━━━━━━━━\n`

  for (const [titulo, comandos] of secciones) {
    if (!nsfw && titulo.includes('+18')) continue
    texto += `\n${titulo}\n${comandos.map(c => `➺ ${c}`).join('\n')}\n`
  }

  texto += '\nGracias por usar el bot 🤖'
  return texto
}

module.exports = { generarMenu }
