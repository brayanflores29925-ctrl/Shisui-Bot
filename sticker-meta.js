const fs = require('fs')
const webp = require('node-webpmux')

function leerConfig() {
  try { return JSON.parse(fs.readFileSync('./config.json', 'utf8')) } catch { return {} }
}

async function conMetadatos(buffer) {
  try {
    const cfg = leerConfig()
    const pack = cfg.packname || cfg.nombre || 'Shisui Bot'
    const autor = cfg.packauthor || 'Shisui Bot'
    const json = {
      'sticker-pack-id': 'shisui-bot',
      'sticker-pack-name': pack,
      'sticker-pack-publisher': autor,
      emojis: ['']
    }
    const cabecera = Buffer.from([
      0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57,
      0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00
    ])
    const jsonBuf = Buffer.from(JSON.stringify(json), 'utf-8')
    const exif = Buffer.concat([cabecera, jsonBuf])
    exif.writeUIntLE(jsonBuf.length, 14, 4)
    const img = new webp.Image()
    await img.load(buffer)
    img.exif = exif
    return await img.save(null)
  } catch (e) {
    console.log('Sticker sin metadatos:', e.message)
    return buffer
  }
}

module.exports = { conMetadatos }
