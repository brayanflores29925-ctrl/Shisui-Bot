const fs = require('fs')
let t = fs.readFileSync('fix86.js', 'utf8')
const linea = "idx.splice(s, e - s + 1, ...bloque.split('\\n'))\n"
const ancla = 'const cupos = idx.findIndex('
if (!t.includes(linea) || !t.includes(ancla)) {
  console.log('No encontré las líneas a ajustar')
  process.exit()
}
t = t.replace(linea, '')
t = t.replace(ancla, () => linea + ancla)
fs.writeFileSync('fix86.js', t)
console.log('fix86.js ajustado')
