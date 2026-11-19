const BOT = {
  nombre: 'Shisui Bot',
  version: '1.5.0',
  creador: '50494874330',
  zona: 'America/Tegucigalpa',
  prefijos: '! # . / y otros'
}



function getNavidadCountdown() {
  const ahora = new Date();
  let navidad = new Date(ahora.getFullYear(), 11, 25, 0, 0, 0);
  if (ahora > navidad) navidad.setFullYear(navidad.getFullYear() + 1);
  const diff = navidad - ahora;
  const d = Math.floor(diff / (1000 * 60 * 60 * 24));
  const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const m = Math.floor((diff / (1000 * 60)) % 60);
  const s = Math.floor((diff / 1000) % 60);
  return `🎅 ${d} días
┃ 🕒 ${h} horas, ${m} minutos
┃ ⏱️ ${s} segundos`;
}



function fechaHora() {
  const ahora = new Date();
  return {
    fecha: ahora.toLocaleDateString('es-HN', { timeZone: 'America/Tegucigalpa' }),
    hora: ahora.toLocaleTimeString('es-HN', { timeZone: 'America/Tegucigalpa', hour12: true })
  };
}


const secciones = [
  ['📋 PERFILES', [
    '#perfil (#pr) — Ver tu perfil.',
    '#casarse (#cs) — Casarte con alguien.',
    '#divorcio (#div) — Divorciarte de tu pareja.',
    '#setdesc (#sd) — Establece tu descripción.',
    '#setgenero (#sg) — Establece tu género.',
    '#setcumple (#sc) — Establece tu cumpleaños.',
    '#deldesc (#dd) — Elimina tu descripción.',
    '#delgenero (#dg) — Elimina tu género.',
    '#delcumple (#dc) — Borra tu cumpleaños.',
    '#ship (#sp) — Calcula compatibilidad amorosa.',
    '#alquilarbot — Alquila el bot para tu grupo.'
  ]],


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
    '#x — Ejecuta herramientas para X.',
    '#buscar <nombre> — Busca y envía un video de TikTok.',
    '#play2 — Descarga música para iPhone (m4a).',
    '#spotify / #sp — Busca y descarga canciones de Spotify.',
    '#playvideo — Descarga videos de YouTube.',
    '#playdoc — Descarga video de YouTube como documento.',
    '#ytsearch — Busca videos en YouTube.',
    '#descargarapk — Descarga aplicaciones APK.',
    '#mediafire — Descarga archivos de MediaFire.',
    '#downloadlink — Descarga desde un link directo.'
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
    '#racha (#rc) — Invita a alguien a crear una racha.',
    '#aceptarracha (#ar) — Acepta una invitación.',
    '#miracha (#mr) — Consulta tu racha, nivel y récord.',
    '#rechazarracha (#rr) — Rechaza una invitación.',
    '#desactivarracha (#dr) — Desactiva la racha.'
  ]],

  ['🎮 SISTEMA GACHA', [
    '#gacha / #g / #roll — Realiza una invocación (50 monedas).',
    '#daily / #d — Reclama tu recompensa diaria (+100).',
    '#w / #work — Trabaja y gana monedas (+20 a 50).',
    '#monedas / #bal — Consulta tus monedas y nivel.',
    '#coleccion / #col — Consulta tus personajes y sus IDs.',
    '#gachaprof / #gprof — Perfil Gacha detallado.',
    '#apostar <cant> / #ap — Apuesta monedas (50/50).',
    '#vender <ID> / #sell — Vende un personaje.',
    '#topricos — Top 5 de los más ricos.',
    '#nivel — Consulta tu nivel.',
    '#xp — Consulta tu experiencia.',
    '#topnivel — Muestra el ranking de niveles.',
    '#misiones — Consulta tus misiones diarias.',
    '#recompensas — Consulta tus recompensas.',
    '#tiendagacha / #shop — Abre la tienda.',
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
    '#navidad — Mensaje especial (25 de dic).',
    '#nochebuena — Mensaje especial (24 de dic).',
    '#anonuevo — Mensaje especial (31 dic / 1 ene).',
    '#felicitar — Envía felicitaciones.',
    '#arbol — Arma un árbol de navidad (texto).',
    '#regalo @user — Envía un regalo a un amigo.',
    '#villancico — Canta un villancico.',
    '#nieve — Hace que nieve en el chat.',
    '#brindis — Envía un brindis para Año Nuevo.'
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
    '#aprobartodo — Gestiona solicitudes de ingreso.',
    '#horario 23:00 07:00 — Programa el cierre y apertura automáticos.',
    '#nombregrupo <texto> — Cambia el nombre del grupo.',
    '#descripcion <texto> — Cambia la descripción del grupo.',
    '#admins — Menciona a los administradores.',
    '#fantasmas — Muestra los miembros sin actividad registrada.',
    '#historia / #his — (Admin) Responde a una foto/video para enviarlo como historia.',
    '#invitar <enlace> — Cualquiera puede solicitar unir el bot a un grupo/canal (el owner aprueba).',
    '#antiaudio on/off (#aa) — Bloquea audios.',
    '#antivideos on/off (#av) — Bloquea videos.',
    '#antisticker on/off (#as) — Bloquea stickers.',
    '#antispam on/off (#aspam) — Bloquea spam (5 msgs/10s).',
    '#antibots on/off (#ab) — Expulsa bots por nombre.',
    '#antiestafas on/off (#ae) — Bloquea enlaces de estafa.',
    '#antistatus — Muestra el estado de todos los filtros.'
  ]],

  ['👑 COMANDOS DEL DUEÑO', [
    '#registrargrupo — Registra un grupo en el sistema.',
    '#setmenu — Personaliza el menú.',
    '#navidadmenu — Activa el diseño navideño del menú principal.',
    '#menunormal — Restaura el diseño normal del menú principal.',
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
    '#activarbot / #desactivarbot — Activa o desactiva el bot.',
    '#antiporno on/off — Activa o desactiva el filtro antiporno.',
    '#setoficial <enlace> — Configura el grupo oficial (subbots no responderán ahí).',
    '#setbotprincipal <número> — Define cuál es el bot principal.',
    '#aceptarinv <id> — Acepta una solicitud de invitación.',
    '#rechazarinv <id> — Rechaza una solicitud de invitación.',
    '#addmoney @user <cant> — Añade monedas a un usuario.',
    '#removemoney @user <cant> — Quita monedas a un usuario.',
    '#autoread on/off — Marca los mensajes como leídos automáticamente.',
    '#ram — Muestra el uso de memoria RAM del bot.',
    '#estado / #disco — Muestra el estado del sistema y espacio en disco.',
    '#error / #e — Muestra el último error capturado por el bot.',
    '#restart — Reinicia el bot.',
    '#setprimary <num> — Define cuál es el bot principal.',
    '#tbcookie <cookie> — Guarda una cookie en el sistema.',
    '#testvideo — Envía un video de prueba.',
    '#clear — Limpia la consola del servidor.',
    '#consola / #cmd / #sh — Ejecuta comandos de terminal (Solo owner).',
    '#logs / #errores — Muestra los últimos logs y errores del bot.',
    '#novedad / #anuncio <texto> — Anuncia una actualización (Solo owner).',
    '#apagarsubs / #subsoff — Apaga TODOS los subbots globalmente.',
    '#encendersubs / #subson — Enciende TODOS los subbots globalmente.',
    '#fixapi / #testapi — Actualiza yt-dlp y diagnostica las APIs (IA, TikTok, Roblox).',
    '#clearlogs — Borra los logs guardados en la memoria.'
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

  ['🎬 ANIME INTERACCIONES', [
    '#hug — Abrazar.', '#kiss — Besar.', '#pat — Acariciar.',
    '#slap — Bofetada.', '#punch — Puñetazo.', '#patear — Patear.',
    '#poke — Picar.', '#tickle — Cosquillas.', '#cuddle — Acurrucarse.',
    '#bite — Morder.', '#feed — Dar de comer.', '#nom — Comer.',
    '#smile — Sonreír.', '#wink — Guiñar.', '#blush — Sonrojarse.',
    '#smug — Presumir.', '#happy — Felicidad.', '#angry — Enojo.',
    '#bored — Aburrido.', '#cry — Llorar.', '#laugh — Reír.',
    '#pout — Puchero.', '#baka — Decir baka.', '#bonk — Golpecito.',
    '#wave — Saludar.', '#nod — Asentir.', '#shrug — Encogerse.',
    '#nope — Negarse.', '#thumbsup — Pulgar arriba.', '#handshake — Dar la mano.',
    '#handhold — Tomar de la mano.', '#highfive — Chocar los cinco.', '#dance — Bailar.',
    '#run — Correr.', '#sleep — Dormir.', '#yawn — Bostezar.',
    '#lurk — Espiar.', '#stare — Mirar fijamente.', '#think — Pensar.',
    '#facepalm — Palmada en la cara.', '#tableflip — Voltear la mesa.', '#shoot — Disparar.',
    '#yeet — Lanzar lejos.', '#peck — Besito corto.'
  ]],

  ['🎲 RANKINGS', [
    '#gay — Porcentaje gay.', '#feo — Porcentaje feo.',
    '#rankbromistas — Ranking bromistas.', '#rankgay — Ranking gay.',
    '#ranklindo — Ranking lindos.', '#rankcornudos — Ranking cornudos.',
    '#ranknazis — Ranking malos.', '#rankotaku — Ranking otaku.',
    '#ranklesbianas — Ranking lesbianas.', '#rankinfieles — Ranking infieles.',
    '#rankfieles — Ranking fieles.', '#ranktherian — Ranking therian.'
  ]],

  ['🎭 DIVERSIÓN', [
    '#piropo — Frases bonitas.',
    '#odio — Frases de odio (broma).',
    '#muerte — Predicción de muerte.',
    '#matar @user — Mata a alguien (broma).',
    '#adoptar @user — Adopta a alguien.',
    '#waifu / #neko / #husbando — Imágenes anime.',
    '#verperfil @user — Foto de perfil.',
    '#logos — Lista de logos.',
    '#menulogos — Montajes con foto.',
    '#infobot / #creador — Info del bot.',
    '#sugerencia — Envía sugerencia.',
    '#bug — Reporta un error.',
    '#moneda — Convierte divisas.',
    '#mareas — Tabla de mareas.',
    '#infocomando — Explica un comando.',
    '#pescar — Pesca para ganar dinero.',
    '#minar — Mina para ganar dinero.',
    '#tiendarpg — Tienda RPG.',
    '#niveles — Lista de niveles.'
  ]],

  ['🎮 JUEGOS', [
    '#juegospro — Menú de juegos avanzados.',
    '#ruleta / #ruletarusa — Juego de ruleta rusa con participantes.',
    '#unirme — Unirse a la ruleta rusa activa.',
    '#menuclan — Menú del clan Free Fire.',
    '#ppt — Piedra, papel o tijera.',
    '#dados — Lanza un dado.',
    '#flipp — Cara o sello.',
    '#casino <cant> — Apuesta monedas.',
    '#enigma — Resuelve un acertijo.',
    '#horca / #resphorca — Juego del ahorcado.',
    '#guerra @user — Reta a un duelo.',
    '#4vs4 / #6vs6 — Forma equipos.',
    '#sensibilidad — Sensibilidad FF.',
    '#card / #stats — Tarjeta de jugador.',
  ]],

  ['🛡️ ADMIN 2', [
    '#config — ⚙️ Panel de ajustes (Próximamente)',
    '#idgp — Muestra el ID del grupo.',
    '#listaadmins — Muestra a los administradores.',
    '#contadormensajes — Total de mensajes del grupo.',
    '#veractividad — Muestra los mensajes por persona.',
    '#rankactivos — Top 10 usuarios más activos.',
    '#reiniciarcontador — Reinicia el contador a cero.',
    '#ausente <motivo> — Te marca como ausente.',
    '#activo — Quita tu estado de ausente.',
    '#sorteo <premio> — (Admin) Inicia un sorteo rápido.',
    '#crearrespuesta <palabra> | <respuesta> — Respuesta automática.',
    '#listarrespuestas — Muestra las respuestas automáticas.',
    '#eliminarrespuesta <palabra> — Borra una respuesta.'
  ]],

  ['🎧 EFECTOS Y STICKERS', [
    '#alteradores — Lista de efectos disponibles.',
    '#audiolento — Audio lento.',
    '#audiorapido — Audio rápido.',
    '#grave — Voz grave.',
    '#ardilla — Voz ardilla.',
    '#bass — Aumentar bajos.',
    '#robot — Voz robot.',
    '#eco — Efecto eco.',
    '#reverse — Audio al revés.',
    '#videolento — Video lento.',
    '#videorapido — Video rápido.',
    '#videocontrario — Video al revés.',
    '#tomp3 — Video a audio.',
    '#togif — Video a sticker animado.',
    '#sticker2 — Sticker cuadrado.',
    '#sticker3 — Sticker circular.',
    '#attp4 / #attp5 / #attp6 / #ttp — Texto a sticker IA.',
    '#imagine — Genera imagen con IA.'
  ]],

  ['⚙️ HERRAMIENTAS', [
    '#simi — Habla con el bot.',
    '#chatgpt — Preguntas a una IA.',
    '#llama — Preguntas a Llama IA.',
    '#google — Busca en Google.',
    '#maps / #mapa — Busca una ubicación y envía el mapa.',
    '#wikipedia — Busca en Wikipedia.',
    '#clima — Clima de una ciudad.',
    '#sticker — Convierte imagen/video a sticker (ya existía).',
    '#attp — Texto a sticker (estilo 1).',
    '#attp2 — Texto a sticker (estilo 2).',
    '#attp3 — Texto a sticker (estilo 3).',
    '#horoscopo — Predicción de tu signo.',
    '#toimg — Convierte sticker a imagen.',
    '#hd — Mejora la calidad de una imagen.'
  ]],

  ['🎮 ROBLOX', [
    '#robloxuser <nombre> — Busca un usuario y muestra su ID e info.',
    '#robloxavatar <nombre> — Muestra la imagen del avatar.',
    '#robloxgroups <nombre> — Lista los grupos a los que pertenece.',
    '#robloxgame <nombre> — Busca un juego y muestra sus datos.',
    '#robloxplayers <ID> — Muestra los jugadores en línea de un juego.',
    '#robloxbadges <nombre> — Lista las insignias de un usuario.',
    '#robloxfriends <nombre> — Muestra la lista de amigos.',
    '#robloxfollowers <nombre> — Muestra el número de seguidores.',
    '#robloxstatus <nombre> — Muestra el estado de la cuenta.',
    '#robloxrandom — Muestra un juego aleatorio.'
  ]],

  ['🔞 +18 (solo si #setnsfw está activado)', [
    '#verdad — Inicia el juego de verdad.',
    '#reto — Propone un reto.',
    '#yonunca — Inicia el juego Yo Nunca.',
    '#piropo — Envía un piropo.'
  ]]
]

function generarMenu(nsfw, filtro = "") {
  const { fecha, hora } = fechaHora()
  let config = {}

  try {
    config = JSON.parse(require('fs').readFileSync('./config.json', 'utf8'))
  } catch {}

  const nombre = config.nombre || BOT.nombre
  const red = config.red || 'https://whatsapp.com/channel/0029VbDBJk4BfxoCBx5ov41y'

  const informacion = `╭━━━━━━━━━━━━━━━━━━━━╮
       🤖 *${nombre.toUpperCase()}*
       ✦ MENÚ PRINCIPAL ✦
╰━━━━━━━━━━━━━━━━━━━━╯

╭━━〔 INFORMACIÓN DEL BOT 〕
┃ 📦 Versión: ${BOT.version}
┃ 👑 Creador: ${BOT.creador}
┃ 📅 Fecha: ${fecha}
┃ 🕒 Hora: ${hora} (Honduras 🇭🇳)
┃ ⏳ ${getNavidadCountdown()}
┃ ⚡ Prefijos: ${BOT.prefijos}
┃ 📢 Canal: ${red}
╰━━━━━━━━━━━━━━━━━━━━
`

  const normalizar = t => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const buscar = normalizar(String(filtro || '').trim())

  if (!buscar) {
    const navidad = !!config.navidadMenu
    let texto = informacion

    if (navidad) {
      texto += `💡 ¿Quieres encontrar un comando más rápido?
Escribe #menu seguido de una categoría o número.
Ejemplos:
❄️ #menu perfiles
❄️ #menu 1

`
    }

    for (const [titulo, comandos] of secciones) {
      if (!nsfw && titulo.includes('+18')) continue

      if (navidad) {
        texto += `\n🎄┏━━「 ❄️ ${titulo} ❄️ 」━━🎄\n`
        texto += comandos.map(c => {
          const partes = c.split(' — ')
          const nombreComando = partes.shift() || c
          const explicacion = partes.join(' — ')
          return `┃ ❄️ ${nombreComando} 🌲${explicacion ? `\n┃ » ${explicacion}` : ''}`
        }).join('\n')
        texto += '\n🎄┗━━━━━━━━━━━━━━━━━━🎄\n'
      } else {
        texto += `\n┏━━「 ${titulo} 」\n`
        texto += comandos.map(c => `┃ ➳ ${c}`).join('\n')
        texto += '\n┗━━━━━━━━━━━━━━━━━━\n'
      }
    }

    texto += navidad
      ? '\n╭━━━━━━━━━━━━━━━━━━━━╮\n      🎄 *SHISUI BOT v1.5.0* 🎄\n       ¡Felices fiestas! ❄️\n╰━━━━━━━━━━━━━━━━━━━━╯'
      : '\n╭━━━━━━━━━━━━━━━━━━━━╮\n      ✦ *SHISUI BOT v1.5.0* ✦\n       Gracias por utilizarlo\n╰━━━━━━━━━━━━━━━━━━━━╯'

    return texto
  }

  const alias = [
    ['perfil', 'perfiles', '1'],
    ['info', 'informacion', 'ayuda', '2'],
    ['descargas', 'descarga', '3'],
    ['stickers', 'multimedia', '4'],
    ['ia', 'inteligencia', '5'],
    ['racha', 'rachas', '6'],
    ['gacha', '7'],
    ['eventos', '8'],
    ['admin', 'administracion', 'grupos', '9'],
    ['dueno', 'owner', 'dueño', '10'],
    ['subbots', '11'],
    ['mantenimiento', 'seguridad', '12'],
    ['anime', '13'],
    ['rankings', '14'],
    ['diversion', '15'],
    ['juegos', '16'],
    ['admin2', '17'],
    ['efectos', '18'],
    ['herramientas', '19'],
    ['roblox', '20'],
    ['18+', 'nsfw', '21']
  ]

  let indice = /^\d+$/.test(buscar) ? Number(buscar) - 1 : -1
  let seleccion = indice >= 0 ? secciones[indice] : null

  if (!seleccion) {
    seleccion = secciones.find(([titulo], i) =>
      normalizar(titulo).includes(buscar) ||
      (alias[i] || []).some(a => normalizar(a) === buscar)
    )
  }

  if (!seleccion) {
    return informacion + '\n❌ Categoría no encontrada.\nUsa #menu para ver las categorías.'
  }

  const [titulo, comandos] = seleccion
  if (!nsfw && titulo.includes('+18')) {
    return informacion + '\n❌ Esta categoría está desactivada.'
  }

  const icono = titulo.split(' ')[0]
  const nombreCategoria = titulo.replace(/^[^\p{L}\p{N}]+/u, '').trim()

  const letras = {
    a:'ᴀ', b:'ʙ', c:'ᴄ', d:'ᴅ', e:'ᴇ', f:'ꜰ', g:'ɢ',
    h:'ʜ', i:'ɪ', j:'ᴊ', k:'ᴋ', l:'ʟ', m:'ᴍ', n:'ɴ',
    o:'ᴏ', p:'ᴘ', q:'ǫ', r:'ʀ', s:'ꜱ', t:'ᴛ', u:'ᴜ',
    v:'ᴠ', w:'ᴡ', x:'x', y:'ʏ', z:'ᴢ'
  }

  const decorado = normalizar(nombreCategoria).split('').map(c => letras[c] || c).join('')
  const descripcion = titulo.includes('PERFILES')
    ? 'Perfil, información y comandos extra.'
    : `Comandos de ${nombreCategoria.toLowerCase()}.`

  let texto = `➮☆ ۣۜۜ ${icono} ${decorado} ꔷ㆒⸼݇҉ֻ᠂⃟✥
➮ ${descripcion}

╭─•
`

  for (const comando of comandos) {
    const partes = comando.split(' — ')
    const nombreComando = (partes[0] || '').replace(/\s*\(#[^)]+\)/g, '')
    const explicacion = partes.slice(1).join(' — ')
    texto += `❏ ${nombreComando}\n» ${explicacion}\n`
  }

  texto += '╰────┈ · ·'
  return informacion + '\n' + texto
}

module.exports = { generarMenu }
