// actualizar.js - baja el código del bot desde GitHub (sin git), valida y reemplaza
const fs = require('fs')
const os = require('os')
const path = require('path')
const crypto = require('crypto')
const { execFile } = require('child_process')

const EXCLUIDOS = new Set(['config.json', 'actividad.json', 'package-lock.json'])
const PERMITIDO = /\.(js|json)$/i
const IGNORAR = /^(fix|ajuste|probar|guardar|diag|estado|menu-sub)|\.backup/i
const API = 'https://api.github.com/repos/'

function cabeceras(token, crudo) {
  const h = {
    Accept: crudo ? 'application/vnd.github.raw+json' : 'application/vnd.github+json',
    'User-Agent': 'shisui-bot',
    'X-GitHub-Api-Version': '2022-11-28'
  }
  if (token) h.Authorization = 'Bearer ' + token
  return h
}

async function pedir(url, token, crudo) {
  const res = await fetch(url, { headers: cabeceras(token, crudo) })
  if (res.status === 404) throw new Error('No encontré el repositorio o la rama (si es privado, falta el token).')
  if (res.status === 401 || res.status === 403) throw new Error('GitHub rechazó el acceso. Revisa el token.')
  if (!res.ok) throw new Error('GitHub respondió HTTP ' + res.status)
  return res
}

function shaGit(buf) {
  return crypto.createHash('sha1').update('blob ' + buf.length + '\0').update(buf).digest('hex')
}

function revisarSintaxis(nombre, buf) {
  return new Promise((resolve, reject) => {
    if (buf.length < 20) return reject(new Error(nombre + ' está vacío o incompleto'))
    if (/\.json$/i.test(nombre)) {
      try {
        JSON.parse(buf.toString('utf8'))
      } catch (e) {
        return reject(new Error(nombre + ' no es un JSON válido'))
      }
      return resolve()
    }
    const tmp = path.join(os.tmpdir(), 'chk_' + Date.now() + '_' + Math.floor(Math.random() * 1e6) + '.js')
    fs.writeFileSync(tmp, buf)
    execFile(process.execPath, ['--check', tmp], (err, stdout, stderr) => {
      try { fs.unlinkSync(tmp) } catch {}
      if (err) {
        const detalle = String(stderr || '').split('\n').filter(l => l.trim()).slice(0, 2).join(' ')
        return reject(new Error(nombre + ' tiene un error de sintaxis: ' + detalle.slice(0, 120)))
      }
      resolve()
    })
  })
}

async function actualizarDesdeGithub(cfg) {
  try {
    const repo = cfg.updateRepo
    const rama = cfg.updateRama || 'main'
    const token = cfg.updateToken
    const lista = await (await pedir(API + repo + '/contents?ref=' + encodeURIComponent(rama), token, false)).json()
    if (!Array.isArray(lista)) throw new Error('Respuesta inesperada de GitHub')
    const archivos = lista.filter(f =>
      f.type === 'file' && PERMITIDO.test(f.name) && !EXCLUIDOS.has(f.name) && !IGNORAR.test(f.name)
    )
    const nuevos = []
    for (const f of archivos) {
      let localSha = null
      try { localSha = shaGit(fs.readFileSync(f.name)) } catch {}
      if (localSha === f.sha) continue
      const res = await pedir(API + repo + '/contents/' + encodeURIComponent(f.name) + '?ref=' + encodeURIComponent(rama), token, true)
      nuevos.push({ nombre: f.name, buf: Buffer.from(await res.arrayBuffer()) })
    }
    if (!nuevos.length) return { ok: true, cambiados: [], npm: null }
    for (const n of nuevos) await revisarSintaxis(n.nombre, n.buf)
    const idxNuevo = nuevos.find(n => n.nombre === 'index.js')
    if (idxNuevo && !idxNuevo.buf.toString('utf8').includes("case 'fix'")) {
      throw new Error('El index.js nuevo no incluye #fix; no lo apliqué para no perder las actualizaciones.')
    }
    const carpeta = path.join('backup-update', String(Date.now()))
    fs.mkdirSync(carpeta, { recursive: true })
    for (const n of nuevos) {
      try { fs.copyFileSync(n.nombre, path.join(carpeta, n.nombre)) } catch {}
    }
    for (const n of nuevos) {
      fs.writeFileSync(n.nombre + '.nuevo', n.buf)
      fs.renameSync(n.nombre + '.nuevo', n.nombre)
    }
    try {
      const carpetas = fs.readdirSync('backup-update').sort()
      for (const c of carpetas.slice(0, Math.max(0, carpetas.length - 5))) {
        fs.rmSync(path.join('backup-update', c), { recursive: true, force: true })
      }
    } catch {}
    let npm = null
    if (nuevos.some(n => n.nombre === 'package.json')) {
      npm = await new Promise(resolve => {
        execFile('npm', ['install', '--no-audit', '--no-fund'], { timeout: 600000, maxBuffer: 20 * 1024 * 1024 }, err => resolve({ ok: !err }))
      })
    }
    return { ok: true, cambiados: nuevos.map(n => n.nombre), npm }
  } catch (e) {
    return { ok: false, error: String(e.message || e).slice(0, 200) }
  }
}

function revertirActualizacion() {
  try {
    const carpetas = fs.readdirSync('backup-update').sort()
    if (!carpetas.length) return { ok: false, error: 'No hay copias de seguridad.' }
    const ultima = carpetas[carpetas.length - 1]
    const archivos = fs.readdirSync(path.join('backup-update', ultima))
    for (const a of archivos) fs.copyFileSync(path.join('backup-update', ultima, a), a)
    fs.rmSync(path.join('backup-update', ultima), { recursive: true, force: true })
    return { ok: true, restaurados: archivos }
  } catch (e) {
    return { ok: false, error: 'No hay copias de seguridad para restaurar.' }
  }
}

module.exports = { actualizarDesdeGithub, revertirActualizacion }
