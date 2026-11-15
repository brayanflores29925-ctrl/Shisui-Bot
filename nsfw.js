const tf = require('@tensorflow/tfjs')
const nsfw = require('nsfwjs')
const Jimp = require('jimp')

let modelo = null

async function cargarModelo () {
  if (modelo) return modelo
  console.log('[antiporno] Cargando modelo NSFW...')
  modelo = await nsfw.load('https://nsfwjs.com/quant_nsfw_mobilenet/model.json', { size: 224 })
  console.log('[antiporno] Modelo NSFW listo.')
  return modelo
}

async function clasificar (buffer) {
  const m = await cargarModelo()
  const imagen = await Jimp.read(buffer)
  imagen.resize(224, 224)
  const { data, width, height } = imagen.bitmap
  const rgb = new Uint8Array(width * height * 3)
  for (let i = 0; i < width * height; i++) {
    rgb[i * 3] = data[i * 4]
    rgb[i * 3 + 1] = data[i * 4 + 1]
    rgb[i * 3 + 2] = data[i * 4 + 2]
  }
  const tensor = tf.tensor3d(rgb, [height, width, 3])
  const predicciones = await m.classify(tensor)
  tensor.dispose()
  const mapa = {}
  for (const p of predicciones) mapa[p.className] = p.probability
  return mapa
}

async function esNSFW (buffer) {
  try {
    const p = await clasificar(buffer)
    const porn = p.Porn || 0
    const sexy = p.Sexy || 0
    const hentai = p.Hentai || 0
    console.log('[antiporno] Probabilidades:', { porn, sexy, hentai })
    return porn > 0.5 || (sexy + hentai) > 0.7
  } catch (e) {
    console.log('[antiporno] Error clasificando:', e.message)
    return false
  }
}

module.exports = { esNSFW, cargarModelo }
