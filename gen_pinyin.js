// 从 cards.json 提取卡名中所有唯一汉字，生成不含声调的拼音音节映射。
// 输出 pinyin-map.js（window.PINYIN_MAP），供浏览器端同音字接龙使用。
// 服务端 server.js 直接 require('pinyin-pro') 计算，不依赖本文件。
const fs = require('fs');
const path = require('path');
const { pinyin } = require('pinyin-pro');

const ROOT = __dirname;
// 覆盖两款游戏（StS2 cards.json + StS1 cards1.json）的卡名汉字，保证同音字接龙在任一游戏下可用
const files = ['cards.json', 'cards1.json'];
const chars = new Set();
for (const f of files) {
  let data;
  try { data = JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch (_) { continue; }
  const list = Array.isArray(data) ? data : (data.cards || []);
  const names = [...new Set(list.map(c => c.name).filter(Boolean))];
  names.forEach(n => { for (const ch of n) { if (/[一-鿿]/.test(ch)) chars.add(ch); } });
}

const map = {};
for (const ch of chars) {
  // toneType:'none' 去掉声调，type:'array' 取首字母读音
  const py = pinyin(ch, { toneType: 'none', type: 'array' })[0] || '';
  map[ch] = py.toLowerCase();
}
// 多音字兜底：用首拼即可，游戏用途足够

const out = '/* 自动生成：卡名汉字 -> 拼音音节（无声调），用于同音字接龙。重新生成：node gen_pinyin.js */\n'
  + 'window.PINYIN_MAP = ' + JSON.stringify(map, null, 0) + ';\n';
fs.writeFileSync(path.join(ROOT, 'pinyin-map.js'), out, 'utf8');
console.log('[gen_pinyin] 字符数', chars.size, '-> pinyin-map.js 已生成');
