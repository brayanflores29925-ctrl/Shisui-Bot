const fs = require('fs')
let t = fs.readFileSync('fix78.js', 'utf8')
const cambios = [
  [`l.includes("const { descargar, bajarMedia } = require('./descargas')")`, `l.includes("require('./descargas')")`],
  [`!d.includes('module.exports = { descargar, bajarMedia }')`, `!d.includes('module.exports = {')`],
  [`d = d.replace('module.exports = { descargar, bajarMedia }', 'module.exports = { descargar, bajarMedia, informacion }')`, `d = d.replace('module.exports = { ', 'module.exports = { informacion, ')`],
  [`idx[imp] = "const { descargar, bajarMedia, informacion } = require('./descargas')"`, `idx[imp] = idx[imp].replace('{ ', '{ informacion, ')`]
]
let n = 0
for (const [a, b] of cambios) {
  if (t.includes(a)) {
    t = t.split(a).join(b)
    n++
  }
}
fs.writeFileSync('fix78.js', t)
console.log('fix78.js ajustado (' + n + ' de 4 cambios)')
