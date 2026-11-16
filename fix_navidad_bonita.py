from pathlib import Path
import re

p = Path('menu.js')
s = p.read_text()

# 1. Crear la función con el formato de días/horas/minutos/segundos
nueva_funcion = """
function getNavidadCountdown() {
  const ahora = new Date();
  let navidad = new Date(ahora.getFullYear(), 11, 25, 0, 0, 0);
  if (ahora > navidad) navidad.setFullYear(navidad.getFullYear() + 1);
  const diff = navidad - ahora;
  const d = Math.floor(diff / (1000 * 60 * 60 * 24));
  const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const m = Math.floor((diff / (1000 * 60)) % 60);
  const s = Math.floor((diff / 1000) % 60);
  return `🎅 ${d} días\\n┃ 🕒 ${h} horas, ${m} minutos\\n┃ ⏱️ ${s} segundos`;
}
"""

# 2. Reemplazar la función vieja si existe
s = re.sub(r"function getNavidadCountdown\(\)\s*\{[\s\S]*?\n\}", nueva_funcion, s)

# 3. Insertar la llamada en el menú (debajo de la hora)
viejo_hora = "┃ 🕒 Hora: ${hora} (Honduras 🇭🇳)"
nuevo_hora = "┃ 🕒 Hora: ${hora} (Honduras 🇭🇳)\n┃ ⏳ ${getNavidadCountdown()}"

if "getNavidadCountdown()" not in s.split("const texto = ")[1]:
    s = s.replace(viejo_hora, nuevo_hora)

p.write_text(s)
print("✅ Menú actualizado con la cuenta regresiva de Navidad.")
