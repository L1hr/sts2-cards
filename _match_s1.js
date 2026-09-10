'use strict';
/* StS1：补丁对象名 -> cards1.json（有 en 英文名，匹配比 S2 准） */
const fs = require('fs');
const items = JSON.parse(fs.readFileSync('_s1_items.json', 'utf8'));
const cards = JSON.parse(fs.readFileSync('cards1.json', 'utf8')).cards;

const norm = s => String(s || '').toLowerCase().replace(/\+/g, 'plus').replace(/[^a-z0-9]/g, '');
const index = new Map();
for (const c of cards) {
  const keys = new Set([norm(c.en), norm(c.cn || c.name), norm(c.slug)]);
  for (const k of keys) {
    if (!k) continue;
    if (!index.has(k)) index.set(k, []);
    index.get(k).push(c);
  }
}
function lookup(nm) {
  const k = norm(nm);
  if (index.has(k)) return index.get(k);
  // 去所有格 / the 前缀
  const alts = [];
  const p = String(nm).match(/^(.+?)'s\s+(.+)$/);
  if (p) { alts.push(p[2], p[1]); }
  if (/^the\s+/i.test(nm)) alts.push(nm.replace(/^the\s+/i, '')); else alts.push('the ' + nm);
  for (const a of alts) { const ak = norm(a); if (index.has(ak)) return index.get(ak); }
  if (k.length >= 5) {
    for (const [kk, arr] of index) {
      if (kk.length >= 5 && (kk.startsWith(k) || k.startsWith(kk))) return arr;
    }
  }
  return null;
}

let ok = 0; const res = [], miss = [];
for (const it of items) {
  const hit = lookup(it.obj);
  if (hit && hit.length) {
    ok++;
    for (const c of hit) res.push(Object.assign({}, it, { slug: c.slug, cn: c.cn || c.name, en2: c.en }));
  } else miss.push({ obj: it.obj, ver: it.ver, type: it.objType, en: it.en.slice(0, 80) });
}
const uniqMissObj = [...new Set(miss.map(m => m.obj))];
console.log('匹配：', ok, '｜未匹配：', miss.length, '（对象', uniqMissObj.length, '）');
console.log('其中卡牌未匹配：', miss.filter(m => m.type === 'card').length,
  '｜遗物未匹配：', miss.filter(m => m.type === 'relic').length);
console.log('\n卡牌类未匹配对象：');
[...new Set(miss.filter(m => m.type === 'card').map(m => m.obj))].sort().slice(0, 60).forEach(o => console.log('  - ' + o));
fs.writeFileSync('_s1_matched.json', JSON.stringify(res, null, 1));
fs.writeFileSync('_s1_missed.json', JSON.stringify(miss, null, 1));
console.log('\n涉及卡数：', new Set(res.filter(r => r.objType === 'card').map(r => r.slug)).size);
