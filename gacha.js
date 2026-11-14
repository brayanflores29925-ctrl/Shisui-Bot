// gacha.js - gacha de personajes de anime (solo texto)
const fs = require('fs')

const ARCHIVO = './gacha.json'
const PRECIO_TIRADA = 50
const MONEDAS_INICIALES = 200
const DAILY_BASE = 200
const DAILY_BONO = 25
const DAILY_BONO_MAX = 175
const ESPERA_DAILY = 24 * 60 * 60 * 1000
const VENTANA_RACHA = 48 * 60 * 60 * 1000
const TIEMPO_RECLAMO = 2 * 60 * 1000
const TIEMPO_OFERTA = 2 * 60 * 1000

const RAREZAS = {
  comun: { nombre: 'Común', icono: '⚪', puntos: 1, peso: 55 },
  raro: { nombre: 'Raro', icono: '🔵', puntos: 3, peso: 30 },
  epico: { nombre: 'Épico', icono: '🟣', puntos: 8, peso: 12 },
  legendario: { nombre: 'Legendario', icono: '🟡', puntos: 25, peso: 3 }
}
const ORDEN = ['legendario', 'epico', 'raro', 'comun']

const BASE = [
  ['Goku', 'Dragon Ball', 'legendario'],
  ['Naruto Uzumaki', 'Naruto', 'legendario'],
  ['Monkey D. Luffy', 'One Piece', 'legendario'],
  ['Levi Ackerman', 'Shingeki no Kyojin', 'legendario'],
  ['Light Yagami', 'Death Note', 'legendario'],
  ['Itachi Uchiha', 'Naruto', 'legendario'],
  ['Saitama', 'One Punch Man', 'legendario'],
  ['Satoru Gojo', 'Jujutsu Kaisen', 'legendario'],
  ['Sasuke Uchiha', 'Naruto', 'epico'],
  ['Roronoa Zoro', 'One Piece', 'epico'],
  ['Eren Yeager', 'Shingeki no Kyojin', 'epico'],
  ['Mikasa Ackerman', 'Shingeki no Kyojin', 'epico'],
  ['Tanjiro Kamado', 'Kimetsu no Yaiba', 'epico'],
  ['Nezuko Kamado', 'Kimetsu no Yaiba', 'epico'],
  ['Killua Zoldyck', 'Hunter x Hunter', 'epico'],
  ['Gon Freecss', 'Hunter x Hunter', 'epico'],
  ['Edward Elric', 'Fullmetal Alchemist', 'epico'],
  ['Rem', 'Re:Zero', 'epico'],
  ['Zero Two', 'Darling in the Franxx', 'epico'],
  ['Asuka Langley', 'Neon Genesis Evangelion', 'epico'],
  ['Rei Ayanami', 'Neon Genesis Evangelion', 'epico'],
  ['Vegeta', 'Dragon Ball', 'epico'],
  ['Kakashi Hatake', 'Naruto', 'epico'],
  ['Shisui Uchiha', 'Naruto', 'epico'],
  ['Sakura Haruno', 'Naruto', 'raro'],
  ['Hinata Hyuga', 'Naruto', 'raro'],
  ['Nami', 'One Piece', 'raro'],
  ['Sanji', 'One Piece', 'raro'],
  ['Usopp', 'One Piece', 'raro'],
  ['Tony Tony Chopper', 'One Piece', 'raro'],
  ['Natsu Dragneel', 'Fairy Tail', 'raro'],
  ['Lucy Heartfilia', 'Fairy Tail', 'raro'],
  ['Erza Scarlet', 'Fairy Tail', 'raro'],
  ['Izuku Midoriya', 'Boku no Hero Academia', 'raro'],
  ['Katsuki Bakugo', 'Boku no Hero Academia', 'raro'],
  ['Shoto Todoroki', 'Boku no Hero Academia', 'raro'],
  ['Ochaco Uraraka', 'Boku no Hero Academia', 'raro'],
  ['Inuyasha', 'Inuyasha', 'raro'],
  ['Kagome Higurashi', 'Inuyasha', 'raro'],
  ['Rukia Kuchiki', 'Bleach', 'raro'],
  ['Ichigo Kurosaki', 'Bleach', 'raro'],
  ['Spike Spiegel', 'Cowboy Bebop', 'raro'],
  ['Rin Tohsaka', 'Fate/stay night', 'raro'],
  ['Saber', 'Fate/stay night', 'raro'],
  ['Megumin', 'Konosuba', 'raro'],
  ['Aqua', 'Konosuba', 'raro'],
  ['Kazuma Satou', 'Konosuba', 'raro'],
  ['Yuji Itadori', 'Jujutsu Kaisen', 'raro'],
  ['Piccolo', 'Dragon Ball', 'raro'],
  ['Hisoka Morow', 'Hunter x Hunter', 'raro'],
  ['Konohamaru', 'Naruto', 'comun'],
  ['Rock Lee', 'Naruto', 'comun'],
  ['Tenten', 'Naruto', 'comun'],
  ['Krillin', 'Dragon Ball', 'comun'],
  ['Yamcha', 'Dragon Ball', 'comun'],
  ['Androide 18', 'Dragon Ball', 'comun'],
  ['Armin Arlert', 'Shingeki no Kyojin', 'comun'],
  ['Connie Springer', 'Shingeki no Kyojin', 'comun'],
  ['Sasha Blouse', 'Shingeki no Kyojin', 'comun'],
  ['Mob', 'Mob Psycho 100', 'comun'],
  ['Genos', 'One Punch Man', 'comun'],
  ['Tsuyu Asui', 'Boku no Hero Academia', 'comun'],
  ['Kirito', 'Sword Art Online', 'comun'],
  ['Asuna', 'Sword Art Online', 'comun'],
  ['Pikachu', 'Pokémon', 'comun'],
  ['Ash Ketchum', 'Pokémon', 'comun'],
  ['Misty', 'Pokémon', 'comun'],
  ['Brock', 'Pokémon', 'comun'],
  ['Shin-chan', 'Crayon Shin-chan', 'comun'],
  ['Doraemon', 'Doraemon', 'comun'],
  ['Nobita Nobi', 'Doraemon', 'comun'],
  ['Totoro', 'Mi vecino Totoro', 'comun'],
  ['Usagi Tsukino', 'Sailor Moon', 'comun'],
  ['Yusuke Urameshi', 'Yu Yu Hakusho', 'comun'],
  ['Happy', 'Fairy Tail', 'comun']
]

const ALIAS = {
  daily: 'daily', diario: 'daily',
  monedas: 'monedas', balance: 'monedas', cartera: 'monedas',
  tirar: 'tirar', gacha: 'tirar', roll: 'tirar',
  reclamar: 'reclamar', claim: 'reclamar',
  coleccion: 'coleccion', col: 'coleccion', mispj: 'coleccion',
  topgacha: 'top', rankgacha: 'top',
  regalar: 'regalar', darpj: 'regalar',
  dar: 'dar', darmonedas: 'dar',
  intercambiar: 'intercambiar', trade: 'intercambiar',
  aceptar: 'aceptar', rechazar: 'rechazar',
  addpj: 'addpj',
  tiendagacha: 'tienda',
  inventario: 'inventario',
  usar: 'usar',
  fusionar: 'fusionar',
  favorito: 'favorito',
  w: 'trabajar', trabajar: 'trabajar',
  nivel: 'nivel', xp: 'xp',
  topnivel: 'topnivel',
  misiones: 'misiones', recompensas: 'recompensas',
  gachamenu: 'menu', ayudagacha: 'menu'
}
const COMANDOS_GACHA = Object.keys(ALIAS)

const EMOJIS_GACHA = {
  daily: '🎁', diario: '🎁',
  monedas: '💰', balance: '💰', cartera: '💰',
  tirar: '🎲', gacha: '🎲', roll: '🎲',
  reclamar: '✅', claim: '✅',
  coleccion: '📚', col: '📚', mispj: '📚',
  topgacha: '🏆', rankgacha: '🏆',
  regalar: '🎁', darpj: '🎁',
  dar: '💸', darmonedas: '💸',
  intercambiar: '🔄', trade: '🔄',
  aceptar: '🤝', rechazar: '❌',
  addpj: '➕', tiendagacha: '🛒',
  inventario: '🎒', usar: '🧪',
  fusionar: '🔥', favorito: '⭐',
  w: '💼', trabajar: '💼',
  nivel: '📈', xp: '📈', topnivel: '🏆',
  misiones: '🎯', recompensas: '🎁',
  gachamenu: '📜', ayudagacha: '📜'
}

const ofertas = []

function sinTildes(t) {
  return String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
}
function digitos(j) {
  return String(j || '').split('@')[0].split(':')[0].replace(/\D/g, '')
}
function cargar() {
  try {
    const db = JSON.parse(fs.readFileSync(ARCHIVO, 'utf8'))
    db.usuarios = db.usuarios || []
    db.extras = db.extras || []
    return db
  } catch {
    return { usuarios: [], extras: [] }
  }
}
function guardar(db) {
  fs.writeFileSync(ARCHIVO, JSON.stringify(db))
}
function personajes(db) {
  return BASE.concat((db.extras || []).map(e => [e.nombre, e.serie, e.rareza])).map(([nombre, serie, rareza]) => ({
    nombre, serie, rareza, clave: sinTildes(nombre + '|' + serie)
  }))
}
function porClave(db, clave) {
  return personajes(db).find(p => p.clave === clave)
}
function buscarUsuario(db, ids) {
  return db.usuarios.find(u => u.ids.some(i => ids.includes(i)))
}
function obtenerUsuario(db, ids, jid, nombre) {
  ids = (ids || []).filter(Boolean)
  let u = buscarUsuario(db, ids)
  if (!u) {
    u = { ids: [], jid: jid || null, nombre: nombre || '', monedas: MONEDAS_INICIALES, ultimoDaily: 0, racha: 0, pj: {}, pendiente: null }
    db.usuarios.push(u)
  }
  for (const i of ids) if (!u.ids.includes(i)) u.ids.push(i)
  if (jid) u.jid = jid
  if (nombre) u.nombre = nombre
  return u
}
function etiqueta(u) {
  return u.jid ? '@' + digitos(u.jid) : (u.nombre || 'alguien')
}
function jidsDe(...us) {
  return us.map(x => x.jid).filter(Boolean)
}
function tiempo(ms) {
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  return h + 'h ' + m + 'm'
}
function puntos(db, u) {
  let t = 0
  for (const [k, n] of Object.entries(u.pj)) {
    const p = porClave(db, k)
    if (p) t += n * RAREZAS[p.rareza].puntos
  }
  return t
}
function sortear(db) {
  const lista = personajes(db)
  const total = Object.values(RAREZAS).reduce((s, r) => s + r.peso, 0)
  let x = Math.random() * total
  let rar = 'comun'
  for (const [k, r] of Object.entries(RAREZAS)) {
    if (x < r.peso) {
      rar = k
      break
    }
    x -= r.peso
  }
  const pool = lista.filter(p => p.rareza === rar)
  const fuente = pool.length ? pool : lista
  return fuente[Math.floor(Math.random() * fuente.length)]
}
function limpiarTexto(t) {
  return String(t || '').split(/\s+/).filter(x => x && !x.startsWith('@') && !/^\d{8,}$/.test(x)).join(' ')
}
function resolverObjetivo(ctx) {
  const jidObj = (ctx.mentions || [])[0] || ctx.citado
  if (jidObj) return { ids: [digitos(jidObj)], jid: jidObj }
  const num = (String(ctx.cuerpo || '').match(/\b\d{8,15}\b/) || [])[0]
  if (num) return { ids: [num], jid: num + '@s.whatsapp.net' }
  return null
}
function buscarEnColeccion(db, u, consulta) {
  const q = sinTildes(consulta)
  if (!q) return { error: 'Escribe el nombre del personaje.' }
  const poseidos = Object.keys(u.pj).filter(k => u.pj[k] > 0).map(k => porClave(db, k)).filter(Boolean)
  const exactos = poseidos.filter(p => sinTildes(p.nombre) === q)
  if (exactos.length === 1) return { p: exactos[0] }
  const parecidos = poseidos.filter(p => sinTildes(p.nombre).includes(q))
  if (parecidos.length === 1) return { p: parecidos[0] }
  if (!parecidos.length) return { error: 'No encontré a "' + consulta + '" en esa colección.' }
  return { error: 'Hay varios que coinciden: ' + parecidos.slice(0, 5).map(p => p.nombre).join(', ') + '. Sé más específico.' }
}
function quitarUno(u, clave) {
  u.pj[clave] = (u.pj[clave] || 0) - 1
  if (u.pj[clave] <= 0) delete u.pj[clave]
}
function darUno(u, clave) {
  u.pj[clave] = (u.pj[clave] || 0) + 1
}
function nombreConIcono(db, clave) {
  const p = porClave(db, clave)
  return p ? RAREZAS[p.rareza].icono + ' *' + p.nombre + '*' : '*personaje*'
}

function ejecutar(comando, args, ctx) {
  const db = cargar()
  const ahora = Date.now()
  const u = obtenerUsuario(db, ctx.ids, ctx.jid, ctx.nombre)
  u.xp = Number(u.xp) || 0
  u.ultimoTrabajo = Number(u.ultimoTrabajo) || 0
  u.trabajosFecha = u.trabajosFecha || ''
  u.trabajosHoy = Number(u.trabajosHoy) || 0
  u.recompensaFecha = u.recompensaFecha || ''
  u.objetos = u.objetos || {}
  u.favorito = u.favorito || ''
  const salida = (texto, mentions) => {
    guardar(db)
    return { texto, mentions: mentions || [] }
  }
  switch (ALIAS[comando]) {
    case 'daily': {
      if (u.ultimoDaily && ahora - u.ultimoDaily < ESPERA_DAILY) {
        return salida('⏳ Ya reclamaste tu recompensa diaria. Vuelve en ' + tiempo(ESPERA_DAILY - (ahora - u.ultimoDaily)) + '.')
      }
      const sigue = u.ultimoDaily && ahora - u.ultimoDaily < VENTANA_RACHA
      u.racha = sigue ? (u.racha || 0) + 1 : 1
      const bono = Math.min((u.racha - 1) * DAILY_BONO, DAILY_BONO_MAX)
      const total = DAILY_BASE + bono
      u.monedas += total
      u.ultimoDaily = ahora
      return salida(
        '🎁 *Recompensa diaria*\n💰 +' + total + ' monedas' + (bono ? ' (bono de racha +' + bono + ')' : '') +
        '\n🔥 Racha: ' + u.racha + ' día' + (u.racha === 1 ? '' : 's') + '\n💰 Tienes ' + u.monedas + ' monedas.'
      )
    }
    case 'monedas': {
      const unicos = Object.keys(u.pj).length
      return salida('💰 Tienes ' + u.monedas + ' monedas\n🎴 Personajes únicos: ' + unicos + '\n🔥 Racha diaria: ' + (u.racha || 0))
    }
    case 'tirar': {
      if (u.monedas < PRECIO_TIRADA) {
        return salida('💸 Te faltan monedas. Cada tirada cuesta ' + PRECIO_TIRADA + ' y tienes ' + u.monedas + '. Usa #daily.')
      }
      u.monedas -= PRECIO_TIRADA
      const p = sortear(db)
      const habia = u.pendiente && u.pendiente.hasta > ahora
      u.pendiente = { clave: p.clave, hasta: ahora + TIEMPO_RECLAMO }
      const r = RAREZAS[p.rareza]
      return salida(
        '🎴 *Tirada de gacha*\n\n' + r.icono + ' ' + r.nombre.toUpperCase() + '\n*' + p.nombre + '*\n📺 ' + p.serie +
        '\n\nEscribe #reclamar en los próximos 2 minutos para quedártelo.' +
        (habia ? '\n⚠️ El personaje anterior sin reclamar se perdió.' : '') +
        '\n💰 Te quedan ' + u.monedas + ' monedas.'
      )
    }
    case 'reclamar': {
      if (!u.pendiente || u.pendiente.hasta < ahora) {
        u.pendiente = null
        return salida('❌ No tienes ningún personaje por reclamar. Usa #tirar.')
      }
      const p = porClave(db, u.pendiente.clave)
      u.pendiente = null
      if (!p) return salida('❌ Ese personaje ya no existe.')
      darUno(u, p.clave)
      return salida('✅ ' + etiqueta(u) + ' reclamó a ' + nombreConIcono(db, p.clave) + ' (' + p.serie + ')', jidsDe(u))
    }
    case 'coleccion': {
      const obj = resolverObjetivo(ctx)
      let dueno = u
      if (obj) {
        dueno = buscarUsuario(db, obj.ids)
        if (!dueno) return salida('📚 Esa persona aún no tiene colección.')
      }
      const items = Object.keys(dueno.pj)
        .filter(k => dueno.pj[k] > 0)
        .map(k => ({ p: porClave(db, k), n: dueno.pj[k] }))
        .filter(x => x.p)
      if (!items.length) return salida('📚 ' + etiqueta(dueno) + ' todavía no tiene personajes. Usa #tirar.', jidsDe(dueno))
      items.sort((x, y) => ORDEN.indexOf(x.p.rareza) - ORDEN.indexOf(y.p.rareza) || x.p.nombre.localeCompare(y.p.nombre))
      const total = items.reduce((s, x) => s + x.n, 0)
      const lineas = items.slice(0, 40).map(x =>
        RAREZAS[x.p.rareza].icono + ' ' + x.p.nombre + ' (' + x.p.serie + ')' + (x.n > 1 ? ' x' + x.n : '')
      )
      if (items.length > 40) lineas.push('... y ' + (items.length - 40) + ' más')
      return salida(
        '🎴 *Colección de ' + etiqueta(dueno) + '*\nÚnicos: ' + items.length + ' · Total: ' + total + ' · Puntos: ' + puntos(db, dueno) +
        '\n\n' + lineas.join('\n'),
        jidsDe(dueno)
      )
    }
    case 'top': {
      const ranking = db.usuarios
        .map(x => ({ x, pts: puntos(db, x) }))
        .filter(r => r.pts > 0)
        .sort((a, b) => b.pts - a.pts)
        .slice(0, 10)
      if (!ranking.length) return salida('🏆 Todavía nadie tiene puntos. Usa #tirar.')
      const medallas = ['🥇', '🥈', '🥉']
      const lineas = ranking.map((r, i) => (medallas[i] || (i + 1) + '.') + ' ' + etiqueta(r.x) + ' — ' + r.pts + ' pts')
      return salida('🏆 *Ranking de gacha*\n\n' + lineas.join('\n'), ranking.map(r => r.x.jid).filter(Boolean))
    }
    case 'regalar': {
      const obj = resolverObjetivo(ctx)
      if (!obj) return salida('Uso: #regalar @persona <personaje>')
      if (obj.ids.some(i => u.ids.includes(i))) return salida('😅 No puedes regalarte a ti mismo.')
      const r = buscarEnColeccion(db, u, limpiarTexto(ctx.cuerpo))
      if (r.error) return salida('❌ ' + r.error)
      const dest = obtenerUsuario(db, obj.ids, obj.jid, '')
      quitarUno(u, r.p.clave)
      darUno(dest, r.p.clave)
      return salida('🎁 ' + etiqueta(u) + ' le regaló a ' + etiqueta(dest) + ' a ' + nombreConIcono(db, r.p.clave), jidsDe(u, dest))
    }
    case 'dar': {
      const obj = resolverObjetivo(ctx)
      if (!obj) return salida('Uso: #dar @persona <monedas>')
      const monto = Number(limpiarTexto(ctx.cuerpo).split(/\s+/).find(t => /^\d{1,7}$/.test(t)))
      if (!monto || monto < 1) return salida('Uso: #dar @persona <monedas>')
      if (obj.ids.some(i => u.ids.includes(i))) return salida('😅 No puedes darte monedas a ti mismo.')
      if (u.monedas < monto) return salida('💸 No te alcanzan las monedas. Tienes ' + u.monedas + '.')
      const dest = obtenerUsuario(db, obj.ids, obj.jid, '')
      u.monedas -= monto
      dest.monedas += monto
      return salida('💸 ' + etiqueta(u) + ' le dio ' + monto + ' monedas a ' + etiqueta(dest) + '.', jidsDe(u, dest))
    }
    case 'intercambiar': {
      const obj = resolverObjetivo(ctx)
      const partes = limpiarTexto(ctx.cuerpo).split('|').map(s => s.trim())
      if (!obj || partes.length !== 2 || !partes[0] || !partes[1]) {
        return salida('Uso: #intercambiar @persona <mi personaje> | <su personaje>')
      }
      if (obj.ids.some(i => u.ids.includes(i))) return salida('😅 No puedes intercambiar contigo mismo.')
      const dest = buscarUsuario(db, obj.ids)
      if (!dest) return salida('❌ Esa persona aún no ha jugado al gacha.')
      const r1 = buscarEnColeccion(db, u, partes[0])
      if (r1.error) return salida('❌ Tú: ' + r1.error)
      const r2 = buscarEnColeccion(db, dest, partes[1])
      if (r2.error) return salida('❌ Ella o él: ' + r2.error)
      for (let i = ofertas.length - 1; i >= 0; i--) {
        if (ofertas[i].de === u.ids[0]) ofertas.splice(i, 1)
      }
      ofertas.push({ de: u.ids[0], para: dest.ids[0], a: r1.p.clave, b: r2.p.clave, hasta: ahora + TIEMPO_OFERTA })
      return salida(
        '🔄 ' + etiqueta(u) + ' ofrece ' + nombreConIcono(db, r1.p.clave) + ' por ' + nombreConIcono(db, r2.p.clave) +
        '\n' + etiqueta(dest) + ', escribe #aceptar o #rechazar (2 minutos).',
        jidsDe(u, dest)
      )
    }
    case 'aceptar': {
      const i = ofertas.findIndex(o => o.para === u.ids[0] && o.hasta > ahora)
      if (i === -1) return salida('❌ No tienes ofertas de intercambio pendientes.')
      const o = ofertas[i]
      ofertas.splice(i, 1)
      const origen = db.usuarios.find(x => x.ids[0] === o.de)
      if (!origen || !(origen.pj[o.a] > 0) || !(u.pj[o.b] > 0)) {
        return salida('❌ El intercambio ya no es posible: alguien ya no tiene el personaje.')
      }
      quitarUno(origen, o.a)
      quitarUno(u, o.b)
      darUno(origen, o.b)
      darUno(u, o.a)
      return salida(
        '✅ Intercambio hecho: ' + etiqueta(origen) + ' recibió ' + nombreConIcono(db, o.b) + ' y ' + etiqueta(u) + ' recibió ' + nombreConIcono(db, o.a),
        jidsDe(origen, u)
      )
    }
    case 'rechazar': {
      const antes = ofertas.length
      for (let i = ofertas.length - 1; i >= 0; i--) {
        if (ofertas[i].para === u.ids[0] || ofertas[i].de === u.ids[0]) ofertas.splice(i, 1)
      }
      return salida(antes === ofertas.length ? '❌ No tienes ofertas pendientes.' : '✅ Oferta cancelada.')
    }
    case 'addpj': {
      if (!ctx.esDueno) return salida('⛔ Solo el dueño del bot puede usar este comando.')
      const partes = String(ctx.cuerpo || '').split('|').map(s => s.trim())
      const rar = { comun: 'comun', raro: 'raro', epico: 'epico', legendario: 'legendario' }[sinTildes(partes[2] || '')]
      if (partes.length !== 3 || !partes[0] || !partes[1] || !rar) {
        return salida('Uso: #addpj Nombre | Serie | rareza\nRarezas: comun, raro, epico, legendario')
      }
      if (personajes(db).some(p => p.clave === sinTildes(partes[0] + '|' + partes[1]))) {
        return salida('ℹ️ Ese personaje ya existe.')
      }
      db.extras.push({ nombre: partes[0], serie: partes[1], rareza: rar })
      return salida('✅ Personaje agregado: ' + RAREZAS[rar].icono + ' ' + partes[0] + ' (' + partes[1] + ')')
    }
    case 'trabajar': {
      const ahora = Date.now()
      const espera = 30 * 60 * 1000
      if (ahora - u.ultimoTrabajo < espera) {
        return salida('⏳ Debes esperar ' + tiempo(espera - (ahora - u.ultimoTrabajo)) + ' para volver a trabajar.')
      }

      const trabajos = [
        ['🍔 Trabajaste en un restaurante', 40, 80],
        ['🚕 Trabajaste como conductor', 50, 100],
        ['💻 Hiciste un trabajo de programación', 60, 120],
        ['📦 Trabajaste repartiendo paquetes', 45, 90],
        ['🏪 Ayudaste en una tienda', 40, 85],
        ['🔧 Trabajaste como técnico', 55, 110]
      ]
      const trabajo = trabajos[Math.floor(Math.random() * trabajos.length)]
      const ganancia = Math.floor(Math.random() * (trabajo[2] - trabajo[1] + 1)) + trabajo[1]
      const experiencia = Math.floor(Math.random() * 16) + 15
      const fecha = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Tegucigalpa',
        year: 'numeric', month: '2-digit', day: '2-digit'
      }).format(new Date())

      if (u.trabajosFecha !== fecha) {
        u.trabajosFecha = fecha
        u.trabajosHoy = 0
      }

      u.monedas += ganancia
      u.xp += experiencia
      u.ultimoTrabajo = ahora
      u.trabajosHoy++

      return salida(
        trabajo[0] +
        '\\n\\n💰 Ganancia: +' + ganancia + ' monedas' +
        '\\n⭐ Experiencia: +' + experiencia + ' XP' +
        '\\n📊 XP total: ' + u.xp +
        '\\n💵 Saldo: ' + u.monedas +
        '\\n📋 Misión diaria: ' + Math.min(u.trabajosHoy, 3) + '/3 trabajos'
      )
    }
    case 'nivel': {
      let nivel = 1
      let restante = u.xp
      while (restante >= nivel * 100) {
        restante -= nivel * 100
        nivel++
      }
      return salida(
        '🏅 *TU NIVEL GACHA*\\n\\n' +
        '👤 ' + (u.nombre || 'Jugador') +
        '\\n⭐ Nivel: ' + nivel +
        '\\n✨ XP: ' + restante + '/' + (nivel * 100) +
        '\\n📈 XP total: ' + u.xp
      )
    }
    case 'xp': {
      return salida('✨ *EXPERIENCIA*\\n\\n⭐ XP acumulada: ' + u.xp)
    }
    case 'topnivel': {
      const ranking = db.usuarios.slice().sort((a, b) =>
        (Number(b.xp) || 0) - (Number(a.xp) || 0)
      ).slice(0, 10)

      if (!ranking.length) return salida('Todavía no hay jugadores en el ranking.')

      const lineas = ranking.map((x, i) => {
        let nivel = 1
        let restante = Number(x.xp) || 0
        while (restante >= nivel * 100) {
          restante -= nivel * 100
          nivel++
        }
        return (i + 1) + '. ' + (x.nombre || 'Jugador') +
          ' — Nivel ' + nivel + ' (' + (Number(x.xp) || 0) + ' XP)'
      })
      return salida('🏆 *TOP 10 NIVELES*\\n\\n' + lineas.join('\\n'))
    }
    case 'misiones': {
      const fecha = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Tegucigalpa',
        year: 'numeric', month: '2-digit', day: '2-digit'
      }).format(new Date())

      const trabajos = u.trabajosFecha === fecha ? u.trabajosHoy : 0
      return salida(
        '📋 *MISIONES DIARIAS*\\n\\n' +
        (trabajos >= 3 ? '✅' : '🔲') +
        ' Trabajar 3 veces: ' + Math.min(trabajos, 3) + '/3' +
        '\\n\\n🎁 Recompensa: 150 monedas' +
        '\\nUsa #recompensas cuando completes la misión.'
      )
    }
    case 'recompensas': {
      const fecha = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Tegucigalpa',
        year: 'numeric', month: '2-digit', day: '2-digit'
      }).format(new Date())

      const trabajos = u.trabajosFecha === fecha ? u.trabajosHoy : 0
      if (trabajos < 3) {
        return salida('❌ Necesitas completar 3 trabajos. Progreso: ' + trabajos + '/3.')
      }
      if (u.recompensaFecha === fecha) {
        return salida('ℹ️ Ya reclamaste la recompensa de hoy.')
      }

      u.monedas += 150
      u.recompensaFecha = fecha
      return salida('🎁 *MISIÓN COMPLETADA*\\n\\n💰 Recibiste 150 monedas.\\n💵 Saldo: ' + u.monedas)
    }
    case 'tienda': {
      const texto = sinTildes(limpiarTexto(ctx.cuerpo))
      if (texto.startsWith('comprar ')) {
        const objeto = texto.slice(8).trim()
        if (objeto !== 'ticket' && objeto !== 'tickets') {
          return salida('❌ Ese objeto no existe. Usa #tiendagacha.')
        }
        const precio = 250
        if (u.monedas < precio) {
          return salida('💸 Necesitas ' + precio + ' monedas. Tienes ' + u.monedas + '.')
        }
        u.monedas -= precio
        u.objetos.ticket = (Number(u.objetos.ticket) || 0) + 1
        return salida('🛒 ¡Compra realizada!\\n🎟️ Ticket: +1\\n💰 Saldo: ' + u.monedas)
      }
      return salida(
        '🏪 *TIENDA GACHA*\\n\\n' +
        '🎟️ Ticket de invocación\\n' +
        '💰 Precio: 250 monedas\\n' +
        '🛒 Compra: #tiendagacha comprar ticket\\n\\n' +
        'Usa #inventario para ver tus objetos.'
      )
    }
    case 'inventario': {
      return salida(
        '🎒 *TU INVENTARIO*\\n\\n' +
        '🎟️ Tickets: ' + (Number(u.objetos.ticket) || 0) +
        '\\n💰 Monedas: ' + u.monedas +
        '\\n⭐ Favorito: ' +
        (porClave(db, u.favorito) ? porClave(db, u.favorito).nombre : 'Ninguno')
      )
    }
    case 'usar': {
      const objeto = sinTildes(limpiarTexto(ctx.cuerpo))
      if (objeto !== 'ticket' && objeto !== 'tickets') {
        return salida('Uso: #usar ticket')
      }
      if ((Number(u.objetos.ticket) || 0) < 1) {
        return salida('❌ No tienes tickets. Compra uno en #tiendagacha.')
      }
      u.objetos.ticket--
      const p = sortear(db)
      darUno(u, p.clave)
      return salida(
        '🎟️ *TICKET UTILIZADO*\\n\\n' +
        nombreConIcono(db, p.clave) + '\\n📺 ' + p.serie +
        '\\n\\n🎒 Tickets restantes: ' + u.objetos.ticket
      )
    }
    case 'fusionar': {
      const consulta = limpiarTexto(ctx.cuerpo)
      const r = buscarEnColeccion(db, u, consulta)
      if (r.error) return salida('❌ ' + r.error)
      const cantidad = Number(u.pj[r.p.clave]) || 0
      if (cantidad < 3) {
        return salida(
          '❌ Necesitas 3 copias de ' + r.p.nombre +
          '.\\nTienes: ' + cantidad + '/3.'
        )
      }
      quitarUno(u, r.p.clave)
      quitarUno(u, r.p.clave)
      quitarUno(u, r.p.clave)
      u.objetos.ticket = (Number(u.objetos.ticket) || 0) + 1
      return salida(
        '✨ *FUSIÓN COMPLETADA*\\n\\n' +
        r.p.nombre + ' x3 se fusionaron.\\n' +
        '🎟️ Recibiste 1 ticket.\\n' +
        '🎟️ Tickets disponibles: ' + u.objetos.ticket
      )
    }
    case 'favorito': {
      const consulta = limpiarTexto(ctx.cuerpo)
      if (!consulta) {
        const p = porClave(db, u.favorito)
        return salida(
          p
            ? '⭐ *TU PERSONAJE FAVORITO*\\n\\n' + nombreConIcono(db, p.clave) + '\\n📺 ' + p.serie
            : '⭐ Todavía no tienes un favorito.\\nUsa #favorito nombre.'
        )
      }
      const r = buscarEnColeccion(db, u, consulta)
      if (r.error) return salida('❌ ' + r.error)
      u.favorito = r.p.clave
      return salida('⭐ ¡' + r.p.nombre + ' ahora es tu personaje favorito!')
    }
    case 'menu': {
      return salida(
        '🎴 *GACHA DE PERSONAJES*\n\n' +
        '🎁 #daily — recompensa diaria\n' +
        '💰 #monedas — ver tus monedas\n' +
        '🎲 #tirar — tirar un personaje (' + PRECIO_TIRADA + ' monedas)\n' +
        '✅ #reclamar — quedarte el personaje (2 minutos)\n' +
        '📚 #coleccion [@persona] — ver colección\n' +
        '🏆 #topgacha — ranking\n' +
        '🎁 #regalar @persona <personaje>\n' +
        '💸 #dar @persona <monedas>\n' +
        '🔄 #intercambiar @persona <mi personaje> | <su personaje>\n' +
        '    (la otra persona responde #aceptar o #rechazar)\n\n' +
        'Rarezas: ⚪ Común · 🔵 Raro · 🟣 Épico · 🟡 Legendario'
      )
    }
    default:
      return { texto: '' }
  }
}

module.exports = { ejecutar, COMANDOS_GACHA, EMOJIS_GACHA }
