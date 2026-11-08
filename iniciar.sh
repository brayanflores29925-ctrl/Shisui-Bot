#!/data/data/com.termux/files/usr/bin/bash
cd ~/bot
while true; do
  BOT_LOOP=1 node index.js
  codigo=$?
  if [ $codigo -eq 0 ]; then
    break
  fi
  echo "El bot se detuvo (código $codigo). Reiniciando en 3 segundos..."
  sleep 3
done
