// fixcmd.js - comando #fix: actualiza el código desde GitHub, las herramientas y las librerías
const fs = require('fs')
const { execFile } = require('child_process')
const { actualizarDesdeGithub, revertirActualizacion } = require('./actualizar')

let enCurso = false

function leerConfig() {
  try { return JSON.parse(fs.readFileSync('./config.json', 'utf8')) } catch { return {} }
}

function correr(cmd, args, opciones) {
  return new Promise(resolve => {
    execFile(
      cmd,
      args,
      { timeout: 600000, maxBuffer: 20 * 1024 * 1024, env: { ...process.env, DEBIAN_FRONTEND: 'noninteractive' }, ...(opciones || {}) },
      (err, stdout, stderr) => resolve({ ok: !err, salida: String(stdout || '') + String(stderr || '') })
    )
  })
}

async function ejecutar(ctx) {
  const { responder, args } = ctx
  if (!ctx.esDueno) {
    await responder('⛔ Solo el dueño del bot puede usar este comando.')
    return
  }
  if (enCurso) {
    await responder('⏳ Ya hay una actualización en curso.')
    return
  }
  enCurso = true
  try {
    const cfg = leerConfig()
    const puedeReiniciar = !!(process.env.BOT_LOOP || cfg.reinicioAuto)
    const terminar = async (lineas, reiniciar) => {
      if (reiniciar && puedeReiniciar) {
        lineas.push('', '♻️ Reiniciando el bot...')
        await responder(lineas.join('\n'))
        setTimeout(() => process.exit(42), 2000)
      } else if (reiniciar) {
        lineas.push('', 'ℹ️ Reinicia el bot para aplicar los cambios.')
        await responder(lineas.join('\n'))
      } else {
        await responder(lineas.join('\n'))
      }
    }
    if ((args[0] || '').toLowerCase() === 'revertir') {
      const rv = revertirActualizacion()
      if (!rv.ok) {
        await responder('❌ ' + rv.error)
        return
      }
      await terminar(['↩️ Volví a la versión anterior de: ' + rv.restaurados.join(', ')], true)
      return
    }
    await responder('🔧 Actualizando todo, esto puede tardar unos minutos...')
    const lineas = ['✅ Actualización terminada', '']
    let reiniciar = false
    try {
      const lim = require('./limpieza').limpiar()
      lineas.push('🧹 Limpieza: liberé ' + lim.liberadoMB + ' MB')
    } catch {}
    if (cfg.updateRepo) {
      const up = await actualizarDesdeGithub(cfg)
      if (!up.ok) {
        lineas.push('⚠️ Código: ' + up.error)
      } else if (!up.cambiados.length) {
        lineas.push('✅ Código: ya estaba al día')
      } else {
        reiniciar = true
        lineas.push('✅ Código actualizado: ' + up.cambiados.join(', '))
        if (up.npm) lineas.push((up.npm.ok ? '✅' : '⚠️') + ' Librerías nuevas instaladas')
      }
    } else {
      lineas.push('ℹ️ Código: GitHub sin configurar (usa #setupdate)')
    }
    if ((process.env.PREFIX || '').includes('com.termux')) {
      const v1 = (await correr('yt-dlp', ['--version'])).salida.trim()
      const pk = await correr('pkg', ['install', '-y', 'yt-dlp', 'ffmpeg'])
      const v2 = (await correr('yt-dlp', ['--version'])).salida.trim()
      lineas.push((pk.ok ? '✅' : '⚠️') + ' Herramientas (yt-dlp, ffmpeg): ' + (v1 === v2 ? 'ya estaban al día (' + v2 + ')' : v1 + ' → ' + v2))
    } else if (cfg.herramientas) {
      const yu = await correr('yt-dlp', ['-U'])
      lineas.push((yu.ok ? '✅' : '⚠️') + ' yt-dlp: ' + (/up to date|up-to-date/i.test(yu.salida) ? 'ya estaba al día' : (yu.ok ? 'actualizado' : 'no pude actualizarlo')))
    } else {
      lineas.push('ℹ️ Herramientas: desactivadas en este servidor')
    }
    for (const f of ['package.json', 'package-lock.json']) {
      try { fs.copyFileSync(f, f.replace('.json', '.backup.json')) } catch {}
    }
    const nm = await correr('npm', ['update', '--no-audit', '--no-fund'], { cwd: process.cwd() })
    const nmCambio = /\b(added|changed|removed) [0-9]+ packages?/.test(nm.salida)
    lineas.push((nm.ok ? '✅' : '⚠️') + ' Librerías del bot (npm)' + (nm.ok ? (nmCambio ? ' actualizadas' : ': ya estaban al día') : ': hubo un error'))
    if (nm.ok && nmCambio) reiniciar = true
    try {
      const sp = fs.statfsSync('.')
      lineas.push('💾 Espacio libre: ' + Math.round(sp.bavail * sp.bsize / 1048576) + ' MB')
    } catch {}
    await terminar(lineas, reiniciar)
  } catch (e) {
    console.log('Error en fix:', e.message)
    await responder('❌ Error al actualizar: ' + String(e.message || '').slice(0, 120))
  } finally {
    enCurso = false
  }
}

module.exports = { ejecutar }
