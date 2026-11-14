const fs = require('fs')
const path = require('path')
const os = require('os')
const { execFile } = require('child_process')
const { promisify } = require('util')
const pino = require('pino')
const nsfwjs = require('nsfwjs')
const tf = require('@tensorflow/tfjs')

const ejecutar = promisify(execFile)
const CONFIG = path.join(__dirname, 'config.json')
const logger = pino({ level: 'silent' })

let modelo = null
let cargando = null
let ocupado = false

const UMBRALES = {
  Porn: 0.70,
  Hentai: 0.75
}

function leer() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG, 'utf8'))
  } catch {
    return {}
  }
}

function guardar(cfg) {
  fs.writeFileSync(CONFIG, JSON.stringify(cfg, null, 2))
}

async function obtenerModelo() {
  if (modelo) return modelo
  if (!cargando) {
    cargando = (async () => {
      await tf.ready()
      modelo = await nsfwjs.load()
      console.log('[ANTIPORNO] Modelo cargado')
      return modelo
    })().catch(e => {
      cargando = null
      throw e
    })
  }
  return cargando
}

function contenido(msg) {
  let m = msg
  for (let i = 0; i < 5; i++) {
    const tipo = [
      'ephemeralMessage',
      'viewOnceMessage',
      'viewOnceMessageV2',
      'documentWithCaptionMessage'
    ].find(k => m?.[k]?.message)
    if (!tipo) break
    m = m[tipo].message
  }
  return m || {}
}

async function clasificar(archivo) {
  const temporal = path.join(
    os.tmpdir(),
    'shisui-' + Date.now() + '-' + Math.random().toString(16).slice(2)
  )

  const raw = temporal + '.rgb'

  try {
    await ejecutar('magick', [
      archivo,
      '-auto-orient',
      '-resize', '224x224!',
      '-depth', '8',
      'RGB:' + raw
    ], { timeout: 20000, maxBuffer: 1024 * 1024 })

    const pixeles = await fs.promises.readFile(raw)

    if (pixeles.length !== 224 * 224 * 3) {
      throw new Error('Tamaño de imagen incorrecto')
    }

    const model = await obtenerModelo()

    const tensor = tf.tensor3d(
      new Uint8Array(pixeles),
      [224, 224, 3],
      'int32'
    )

    let resultados
    try {
      resultados = await model.classify(tensor)
    } finally {
      tensor.dispose()
    }

    return resultados.reduce((peor, item) => {
      if ((item.className in UMBRALES) &&
          item.probability >= UMBRALES[item.className]) {
        return {
          nombre: item.className,
          confianza: item.probability
        }
      }
      return peor
    }, null)
  } finally {
    await fs.promises.unlink(raw).catch(() => {})
  }
}

async function revisarVideo(archivo, carpeta) {
  const patron = path.join(carpeta, 'fotograma-%02d.jpg')

  await ejecutar('ffmpeg', [
    '-hide_banner',
    '-loglevel', 'error',
    '-i', archivo,
    '-vf', 'fps=1/3',
    '-frames:v', '3',
    patron
  ], { timeout: 45000, maxBuffer: 2 * 1024 * 1024 })

  const fotos = (await fs.promises.readdir(carpeta))
    .filter(x => /^fotograma-\d+\.jpg$/.test(x))
    .sort()

  let resultado = null

  for (const foto of fotos) {
    const actual = await clasificar(path.join(carpeta, foto))
    if (actual && (!resultado ||
        actual.confianza > resultado.confianza)) {
      resultado = actual
    }
  }

  return resultado
}

async function procesar(sock, m, texto, esAdmin, downloadMediaMessage) {
  const jid = m.key.remoteJid

  if (!jid?.endsWith('@g.us') || m.key.fromMe) return false

  const comando = String(texto || '').trim().match(
    /^(?:[!#./]\s*)?antiporno(?:\s+(on|off|estado))?$/i
  )

  if (comando) {
    if (!(await esAdmin(sock, m))) {
      await sock.sendMessage(jid, {
        text: '⛔ Solo administradores pueden configurar ANTIPORNO.'
      })
      return true
    }

    const cfg = leer()
    cfg.antipornoGrupos = cfg.antipornoGrupos || {}
    const op = (comando[1] || 'estado').toLowerCase()

    if (op === 'on') {
      cfg.antipornoGrupos[jid] = true
      guardar(cfg)
      await sock.sendMessage(jid, {
        text: '🛡️ ANTIPORNO activado. Se analizarán imágenes, stickers y videos.'
      })
    } else if (op === 'off') {
      cfg.antipornoGrupos[jid] = false
      guardar(cfg)
      await sock.sendMessage(jid, {
        text: '✅ ANTIPORNO desactivado.'
      })
    } else {
      await sock.sendMessage(jid, {
        text: '🛡️ ANTIPORNO: ' +
          (cfg.antipornoGrupos[jid] ? 'ACTIVADO' : 'DESACTIVADO') +
          '\n\n#antiporno on\n#antiporno off'
      })
    }
    return true
  }

  const cfg = leer()
  if (!(cfg.antipornoGrupos || {})[jid]) return false

  if (await esAdmin(sock, m)) return false

  const msg = contenido(m.message)
  let tipo = null
  let media = null

  if (msg.imageMessage) {
    tipo = 'imagen'
    media = msg.imageMessage
  } else if (msg.stickerMessage) {
    tipo = 'sticker'
    media = msg.stickerMessage
  } else if (msg.videoMessage) {
    tipo = 'video'
    media = msg.videoMessage
  }

  if (!tipo) return false

  if (ocupado) return false
  ocupado = true

  const carpeta = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), 'shisui-antiporno-')
  )

  try {
    const tamano = Number(media.fileLength || 0)
    if (tamano > 18 * 1024 * 1024) return false

    const buffer = Buffer.from(await downloadMediaMessage(m, 'buffer', {}, {
      logger,
      reuploadRequest: sock.updateMediaMessage
    }))
    if (!buffer.length || buffer.length > 18 * 1024 * 1024) return false

    const extension = tipo === 'sticker' ? '.webp' :
      tipo === 'video' ? '.mp4' : '.jpg'

    const archivo = path.join(carpeta, 'archivo' + extension)
    await fs.promises.writeFile(archivo, buffer)

    const resultado = tipo === 'video'
      ? await revisarVideo(archivo, carpeta)
      : await clasificar(archivo)

    if (!resultado) return false

    await sock.sendMessage(jid, { delete: m.key })

    const autor = m.key.participant || m.key.participantAlt
    const numero = String(autor || '')
      .split('@')[0].split(':')[0].replace(/\D/g, '')

    cfg.antipornoAvisos = cfg.antipornoAvisos || {}
    cfg.antipornoAvisos[jid] = cfg.antipornoAvisos[jid] || {}
    const avisos = cfg.antipornoAvisos[jid]

    avisos[numero] = (Number(avisos[numero]) || 0) + 1
    guardar(cfg)

    const faltas = avisos[numero]

    await sock.sendMessage(jid, {
      text: '🚫 *ANTIPORNO — CONTENIDO DETECTADO*\n\n' +
        'Tipo: ' + tipo + '\n' +
        'Infracciones: ' + faltas + '/3\n' +
        (faltas >= 3
          ? '⛔ Se aplicará la expulsión.'
          : '⚠️ Respeta las reglas del grupo.')
    })

    if (faltas >= 3 && autor) {
      try {
        await sock.groupParticipantsUpdate(jid, [autor], 'remove')
        delete avisos[numero]
        guardar(cfg)
      } catch (e) {
        console.log('[ANTIPORNO] No se pudo expulsar:', e.message)
      }
    }

    return true
  } catch (e) {
    console.error('[ANTIPORNO]', e.message)
    return false
  } finally {
    ocupado = false
    await fs.promises.rm(carpeta, {
      recursive: true,
      force: true
    }).catch(() => {})
  }
}

module.exports = { procesar }
