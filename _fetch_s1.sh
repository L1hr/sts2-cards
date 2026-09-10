#!/bin/bash
# 分段抓取 StS1 (appid 646570) 官方补丁全文，带重试（代理偶发断连）
set -u
OUT_DIR="."
# enddate 从新到旧分段，确保覆盖 2017-11 ~ 2020-12 的全部补丁
SEGMENTS="1610000000 1590000000 1570000000 1555000000 1540000000 1525000000 1512000000"
i=0
for ED in $SEGMENTS; do
  i=$((i+1))
  F="${OUT_DIR}/_s1_seg${i}.json"
  OK=0
  for try in 1 2 3 4 5; do
    curl -s --max-time 120 --compressed \
      "https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=646570&count=20&maxlength=0&enddate=${ED}&format=json" \
      -o "$F"
    if [ -s "$F" ]; then OK=1; break; fi
    sleep 3
  done
  if [ "$OK" = "1" ]; then
    echo "seg${i} enddate=${ED} OK $(wc -c < "$F") bytes (try ${try})"
  else
    echo "seg${i} enddate=${ED} FAILED"
    rm -f "$F"
  fi
done
echo "done"
