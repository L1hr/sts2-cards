#!/bin/bash
# 补抓 StS1 2017-12 ~ 2018-12 的 Weekly Patch（加密分段，避免补丁被外媒新闻挤出前 20 条）
set -u
SEGMENTS="1512086400 1515974400 1519862400 1523750400 1527811200 1531699200 1535760000 1539648000 1543622400 1548000000"
i=100
for ED in $SEGMENTS; do
  i=$((i+1))
  F="_s1_seg${i}.json"
  OK=0
  for try in 1 2 3 4 5; do
    curl -s --max-time 120 --compressed \
      "https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=646570&count=20&maxlength=0&enddate=${ED}&format=json" \
      -o "$F"
    if [ -s "$F" ]; then OK=1; break; fi
    sleep 3
  done
  if [ "$OK" = "1" ]; then echo "seg${i} OK $(wc -c < "$F") bytes"; else echo "seg${i} FAILED"; rm -f "$F"; fi
done
echo done
