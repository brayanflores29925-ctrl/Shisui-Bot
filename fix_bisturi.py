from pathlib import Path
import re

p = Path('index.js')
s = p.read_text()

# 1. Eliminar CUALQUIER bloque que sea playvideo, play2 o playdoc
# Buscamos desde el 'case' hasta el 'break;' o '}' que lo cierre
patrones = [
    r"case 'playvideo':[\s\S]*?break;\s*\n?\}?",
    r"case 'play2':[\s\S]*?break;\s*\n?\}?",
    r"case 'playdoc':[\s\S]*?break;\s*\n?\}?"
]

for patron in patrones:
    s = re.sub(patron, "", s)

# 2. Insertar el bloque nuevo y limpio (usando ytArgs y const fs2)
nuevo_play = """
case 'playvideo': case 'play2': case 'playdoc': {
  const query = cuerpo.slice(cmd.length).trim();
  if (!query) { await responder('Uso: #' + cmd + ' <nombre o enlace>'); break; }
  
  await responder('🔍 Buscando y preparando: ' + query + '...');
  
  try {
    const { exec } = require('child_process');
    const esDoc = cmd === 'playdoc';
    const esAudio = cmd === 'play2';
    const target = query.startsWith('http') ? query : 'ytsearch1:"' + query + '"';
    
    const jsonCmd = 'yt-dlp --extractor-args "youtube:player_client=android" --dump-json --no-warnings "' + target + '"';
    
    exec(jsonCmd, { timeout: 30000, maxBuffer: 1024 * 1024 * 10 }, async (err, stdout) => {
      let title = query, thumb = null, channel = 'Desconocido', duration = 'Desconocido', views = 0, url = query;
      
      if (!err && stdout) {
        try {
          const info = JSON.parse(stdout.trim().split('\\n')[0]);
          title = info.title;
          thumb = info.thumbnail;
          channel = info.channel || info.uploader;
          duration = info.duration_string || (info.duration + 's');
          views = info.view_count || 0;
          url = info.webpage_url || info.url;
        } catch(e) {}
      }

      const txt = '➩ Descargando › *' + title + '*\\n\\n' +
                  '❖ Canal › *' + channel + '*\\n' +
                  '⧖ Duración › *' + duration + '*\\n' +
                  (views ? '❀ Vistas › *' + views.toLocaleString() + '*\\n' : '') +
                  '❐ Enlace › ' + url + '\\n\\n' +
                  '⏳ Espera un momento mientras preparo tu ' + (esAudio ? 'audio' : 'video') + '...';
                  
      if (thumb) await sock.sendMessage(jid, { image: { url: thumb }, caption: txt }, { quoted: m });
      else await sock.sendMessage(jid, { text: txt }, { quoted: m });

      const fileName = 'media_' + Date.now();
      const ext = esAudio ? 'm4a' : 'mp4';
      const filePath = '/tmp/' + fileName + '.' + ext;
      
      const ytArgs = esAudio ? '-f "ba[ext=m4a]/ba" -x --audio-format m4a' : '-f "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]"';
      const dlCmd = 'yt-dlp --extractor-args "youtube:player_client=android" ' + ytArgs + ' -o "' + filePath + '" "' + url + '"';
      
      exec(dlCmd, { timeout: 120000, maxBuffer: 1024 * 1024 * 50 }, async (dlErr) => {
        if (dlErr) {
          console.log('Error yt-dlp:', dlErr.message);
          return responder('❌ Error descargando el archivo.');
        }
        try {
          const fs2 = require('fs');
          if (!fs2.existsSync(filePath)) throw new Error('Archivo no encontrado');
          const buffer = fs2.readFileSync(filePath);
          
          if (esDoc) {
            await sock.sendMessage(jid, { document: buffer, mimetype: 'video/mp4', fileName: title.substring(0,20) + '.mp4' }, { quoted: m });
          } else if (esAudio) {
            await sock.sendMessage(jid, { audio: buffer, mimetype: 'audio/mp4' }, { quoted: m });
          } else {
            await sock.sendMessage(jid, { video: buffer, caption: '✅ ' + title }, { quoted: m });
          }
          fs2.unlinkSync(filePath);
        } catch (e) {
          console.log('Error enviando:', e.message);
          await responder('❌ Error enviando el archivo.');
        }
      });
    });
  } catch (e) {
    console.log('Error .' + cmd + ':', e.message);
    await responder('❌ Error procesando la descarga.');
  }
  break;
}
"""

# Insertar antes de 'musica'
s = s.replace("case 'musica':", nuevo_play + "\ncase 'musica':")

# 3. ARREGLAR VALIDACIÓN DE ADMIN EN BAN Y DEL
def fix_admin_block(bloque):
    # Reemplaza toda la lógica de validación por una infalible
    val = """
    const groupMetadata = await sock.groupMetadata(jid);
    const botNumber = sock.user.id.split(':')[0].split('@')[0];
    const botParticipant = groupMetadata.participants.find(p => p.id.split('@')[0].split(':')[0] === botNumber);
    const isBotAdmin = botParticipant && (botParticipant.admin === 'admin' || botParticipant.admin === 'superadmin');
    
    if (!isBotAdmin) {
      await responder('❌ Necesito ser administrador del grupo para hacer esto.');
      break;
    }
    """
    # Quitamos la validación vieja
    bloque = re.sub(r"const groupMetadata = await sock\.groupMetadata\(jid\);[\s\S]*?(?=let mencionado|let target|await responder\('❌)', val, bloque)
    return bloque

start_ban = s.find("case 'ban':")
if start_ban != -1:
    next_ban = s.find("case '", start_ban + 10)
    if next_ban != -1:
        bloque_ban = s[start_ban:next_ban]
        bloque_ban = fix_admin_block(bloque_ban)
        s = s[:start_ban] + bloque_ban + s[next_ban:]

start_del = s.find("case 'del':")
if start_del != -1:
    next_del = s.find("case '", start_del + 10)
    if next_del != -1:
        bloque_del = s[start_del:next_del]
        bloque_del = fix_admin_block(bloque_del)
        s = s[:start_del] + bloque_del + s[next_del:]

p.write_text(s)
print("✅ ¡Código limpiado con bisturí! Error de 'args' eliminado y Admin arreglado.")
