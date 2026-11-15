const fs = require('fs')
const readline = require('readline/promises')

async function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })

  try {
    console.log('\n=== CONFIGURAR SOCIALCRAWL ===')
    const api = (await rl.question('Pega tu API de SocialCrawl: ')).trim()

    if (!api.startsWith('sc_')) {
      console.log('Error: la API no tiene el formato esperado.')
      return
    }

    console.log('\nComprobando API...')
    const res = await fetch(
      'https://www.socialcrawl.dev/v1/credits/balance',
      {
        headers: { 'x-api-key': api },
        signal: AbortSignal.timeout(15000)
      }
    )

    const data = await res.json()

    if (!res.ok || data.success === false) {
      console.log('La API no fue aceptada. No se guardó.')
      return
    }

    const archivo = '.env'
    let contenido = fs.existsSync(archivo)
      ? fs.readFileSync(archivo, 'utf8')
      : ''

    const linea = `SOCIALCRAWL_API_KEY=${api}`
    if (/^SOCIALCRAWL_API_KEY=.*$/m.test(contenido)) {
      contenido = contenido.replace(
        /^SOCIALCRAWL_API_KEY=.*$/m,
        linea
      )
    } else {
      contenido += (contenido && !contenido.endsWith('\n') ? '\n' : '') + linea + '\n'
    }

    fs.writeFileSync(archivo, contenido, { mode: 0o600 })
    fs.chmodSync(archivo, 0o600)

    console.log('\nAPI comprobada y guardada correctamente.')
    if (data.credits_remaining !== undefined) {
      console.log('Créditos disponibles:', data.credits_remaining)
    }
    console.log('La clave quedó guardada en .env.')
  } finally {
    rl.close()
  }
}

main().catch(err => console.log('Error:', err.message))
