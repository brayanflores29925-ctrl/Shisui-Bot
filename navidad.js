// navidad.js - comandos de Navidad: cuenta regresiva y más
const ZONA = 'America/Argentina/Buenos_Aires'

const ALIAS = { navidad: 'navidad', nochebuena: 'nochebuena', anonuevo: 'anonuevo', felicitar: 'felicitar', arbol: 'arbol' }
const COMANDOS_NAVIDAD = Object.keys(ALIAS)

const FRASES = [
  'Que esta Navidad te llene de paz, amor y alegría. 🎄',
  'Te deseo una Navidad llena de risas, abrazos y buena comida. 🍗',
  'Que Santa te traiga todo lo que mereces, y un poquito más. 🎅',
  'Que la magia de la Navidad ilumine tu hogar y tu corazón. ✨',
  'Feliz Navidad y próspero año nuevo. Que todos tus sueños se cumplan. 🌟',
  'Gracias por ser parte de este grupo. ¡Feliz Navidad! 🎁',
  'Que no te falten salud, amor ni buenos momentos en estas fiestas. 💝',
  'Que esta Nochebuena sea el inicio de un año increíble. 🌙',
  'Brindo por ti: ¡feliz Navidad! 🥂',
  'Que la alegría de estos días te acompañe todo el año. ☃️'
]

function ahora() {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date())
  const g = t => Number(p.find(x => x.type === t).value)
  return { ms: Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second')), anio: g('year') }
}

function faltan(mes, dia) {
  const a = ahora()
  let objetivo = Date.UTC(a.anio, mes - 1, dia, 0, 0, 0)
  if (a.ms >= objetivo + 24 * 3600 * 1000) objetivo = Date.UTC(a.anio + 1, mes - 1, dia, 0, 0, 0)
  const dif = objetivo - a.ms
  return { dif, hoy: dif <= 0 }
}

const pl = (n, u) => n + ' ' + u + (n === 1 ? '' : 's')

function cuenta(titulo, emoji, mes, dia, fechaTexto, hoyTexto) {
  const f = faltan(mes, dia)
  if (f.hoy) return hoyTexto
  const d = Math.floor(f.dif / 86400000)
  const h = Math.floor((f.dif % 86400000) / 3600000)
  const m = Math.floor((f.dif % 3600000) / 60000)
  const s = Math.floor((f.dif % 60000) / 1000)
  return (
    emoji + ' *' + titulo + '* ' + emoji + '\n\n⏳ Faltan:\n' +
    '🎅 ' + pl(d, 'día') + '\n🕐 ' + pl(h, 'hora') + '\n⏱️ ' + pl(m, 'minuto') + '\n⌛ ' + pl(s, 'segundo') +
    '\n\n📅 ' + fechaTexto
  )
}

function arbol() {
  const esp = '\u3000'
  const adorno = () => (Math.random() < 0.18 ? ['🔴', '🟡', '🔵'][Math.floor(Math.random() * 3)] : '🎄')
  const filas = [esp.repeat(4) + '⭐']
  for (let n = 1; n <= 5; n++) {
    let fila = ''
    for (let i = 0; i < 2 * n - 1; i++) fila += adorno()
    filas.push(esp.repeat(5 - n) + fila)
  }
  filas.push(esp.repeat(4) + '🟫')
  filas.push(esp + '🎁🎁' + esp + '🎁' + esp + '🎁🎁')
  const f = faltan(12, 25)
  const falta = f.hoy ? '¡Hoy es Navidad!' : 'Faltan ' + pl(Math.floor(f.dif / 86400000), 'día') + ' para Navidad.'
  return '🎄 *Tu árbol de Navidad* 🎄\n\n' + filas.join('\n') + '\n\n🎅 ' + falta
}

function etiqueta(jid) {
  return '@' + String(jid).split('@')[0].split(':')[0]
}

function ejecutar(comando, ctx) {
  switch (ALIAS[comando]) {
    case 'navidad':
      return { texto: cuenta('Cuenta regresiva para Navidad', '🎄', 12, 25, 'Navidad: 25 de diciembre',
        '🎉🎄 *¡FELIZ NAVIDAD!* 🎄🎉\n\nHoy es 25 de diciembre. ¡Que la pases hermoso en familia! 🎁') }
    case 'nochebuena':
      return { texto: cuenta('Cuenta regresiva para Nochebuena', '🌟', 12, 24, 'Nochebuena: 24 de diciembre',
        '🌟 *¡HOY ES NOCHEBUENA!* 🌟\n\nQue esta noche esté llena de paz y de buena compañía. 🕯️') }
    case 'anonuevo':
      return { texto: cuenta('Cuenta regresiva para Año Nuevo', '🎆', 1, 1, 'Año Nuevo: 1 de enero',
        '🎆 *¡FELIZ AÑO NUEVO!* 🎆\n\nQue este año traiga todo lo bueno que esperas. 🥂') }
    case 'arbol':
      return { texto: arbol() }
    case 'felicitar': {
      const frase = FRASES[Math.floor(Math.random() * FRASES.length)]
      const objetivo = (ctx.mentions || [])[0] || ctx.citado
      if (objetivo) {
        return {
          texto: '🎅 *Mensaje navideño*\n\n' + etiqueta(objetivo) + '\n' + frase + '\n\n— con cariño, ' + etiqueta(ctx.jid),
          mentions: [objetivo, ctx.jid]
        }
      }
      return { texto: '🎄 *¡Feliz Navidad a todos!* 🎄\n\n' + frase + '\n\n— ' + etiqueta(ctx.jid), mentions: [ctx.jid] }
    }
    default:
      return { texto: '' }
  }
}

module.exports = { ejecutar, COMANDOS_NAVIDAD }
