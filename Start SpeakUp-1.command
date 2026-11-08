#!/bin/zsh
cd "$(dirname "$0")"
lsof -ti:8761 | xargs kill 2>/dev/null
(sleep 1; open "http://localhost:8761") &
python3 -m http.server 8761
