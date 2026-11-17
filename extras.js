// extras.js - búsqueda de lugares para #mapa (OpenStreetMap, sin clave)
let ultimaConsulta = 0

async function buscarLugar(texto) {
  const espera = 1100 - (Date.now() - ultimaConsulta)
  if (espera > 0) await new Promise(r => setTimeout(r, espera))
  ultimaConsulta = Date.now()
  try {
    const control = new AbortController()
    const t = setTimeout(() => control.abort(), 15000)
    const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=es&q=' + encodeURIComponent(texto)
    const res = await fetch(url, { headers: { 'User-Agent': 'ShisuiBot/1.0 (bot de WhatsApp)' }, signal: control.signal })
    clearTimeout(t)
    if (!res.ok) return { ok: false, error: 'El servicio de mapas respondió HTTP ' + res.status }
    const lista = await res.json()
    if (!lista.length) return { ok: false, error: 'No encontré ese lugar. Prueba con más detalles, por ejemplo ciudad y país.' }
    const p = lista[0]
    const completo = String(p.display_name || texto)
    return {
      ok: true,
      lat: Number(p.lat),
      lon: Number(p.lon),
      nombre: String(p.name || completo.split(',')[0]).slice(0, 100),
      direccion: completo.slice(0, 200)
    }
  } catch (e) {
    return { ok: false, error: 'No pude consultar el mapa (' + e.message + ').' }
  }
}

module.exports = { buscarLugar }
