# SHISUI BOT 1.5.0

## Instalacion en Termux

1. Instala Node.js, Git y FFmpeg:
   pkg update
   pkg install nodejs git ffmpeg

2. Entra a la carpeta del bot:
   cd ~/bot

3. Instala las dependencias:
   npm install

4. Inicia el bot:
   node index.js

5. Sigue las instrucciones para vincular el WhatsApp del numero que usara el bot.

6. Configura el numero del administrador en index.js,
   en las variables DUENOS y DUENO_JID, si existen.

Importante:
- Cada usuario debe vincular su propia cuenta.
- No compartas archivos de sesion ni contrasenas.
- No cierres Termux mientras quieras mantener el bot activo.
