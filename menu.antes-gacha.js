const BOT = {
  nombre: 'Shisui Bot',
  version: '1.5.0',
  creador: '50494874330',
  zona: 'America/Tegucigalpa',
  prefijos: '! # . / y otros'
}

function fechaHora() {
  const ahora = new Date()
  const fecha = ahora.toLocaleDateString('es-HN', { timeZone: BOT.zona })
  const hora = ahora.toLocaleTimeString('es-HN', { timeZone: BOT.zona, hour12: false })
  return { fecha, hora }
}

const secciones = [
  ['⚙️ CONFIGURACIÓN', [
    '#setmenu', '#setowner', '#delowner', '#owners', '#activarbot / #desactivarbot',
    '#setnombre', '#setdespedida', '#setperfil', '#setban', '#setred',
    '#key', '#setprotect', '#setnsfw (activa o desactiva el contenido +18)', '#fix (actualiza todo)', '#setupdate (conectar GitHub)'
  ]],
  ['✨ GENERALES', [
    '#link', '#menu', '#reglas', '#musica / #m / #play', '#video / #v',
    '#sticker / #s', '#random / #stik', '#reporte / #r', '#ping', '#piti',
    '#pfp / #perfil', '#fotogrupo / #gpfp', '#consejo', '#voz', '#fake / #fq',
    '#party', '#packname / #stickername', '#toqr', '#tomp3', '#tovideo / #a2v',
    '#tiktok / #tt', '#facebook / #fb', '#x', '#instagram / #ig', '#code', '#delcode', '#subs'
  ]],
  ['👥 GRUPOS / ADMIN', [
    '#cerrar', '#abrir', '#status', '#setpfp', '#mutear / #mute',
    '#desmutear / #unmute', '#del / #borrar', '#botlist', '#bot', '#antilink',
    '#promote', '#demote', '#bienvenida', '#despedida',
    '#cambiarenlace / #cambiarlink', '#tag', '#topactive / #topactivos',
    '#modoadmin', '#ban / #kick', '#advertencia / #adv', '#aviso', '#aprobartodo'
  ]],
  ['🔞 +18 (solo si #setnsfw está en on)', [
    '#verdad', '#reto', '#yonunca', '#piropo'
  ]]
]

function generarMenu(nsfw) {
  const { fecha, hora } = fechaHora()
  let red = 'https://whatsapp.com/channel/0029VbDBJk4BfxoCBx5ov41y'
  try { red = JSON.parse(require('fs').readFileSync('./config.json', 'utf8')).red || red } catch {}
  let nombre = BOT.nombre
  try { nombre = JSON.parse(require('fs').readFileSync('./config.json', 'utf8')).nombre || nombre } catch {}
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
    texto += `\n${titulo}\n` + comandos.map(c => `➺ ${c}`).join('\n') + '\n'
  }
  texto += '\nGracias por usar el bot'
  return texto
}

module.exports = { generarMenu }
