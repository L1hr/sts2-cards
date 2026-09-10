'use strict';
/* 把补丁对象名匹配到本地卡库 slug */
const fs = require('fs');
const items = JSON.parse(fs.readFileSync('_patch_items.json', 'utf8'));
const cards = JSON.parse(fs.readFileSync('cards.json', 'utf8')).cards;

const CHARS = ['ironclad', 'silent', 'regent', 'necrobinder', 'defect', 'colorless', 'ancient', 'elder'];
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
function slugKeys(slug) {
  const parts = String(slug || '').split('-').filter(Boolean);
  const keys = new Set();
  keys.add(norm(parts.join('')));
  const noChar = parts.filter(p => !CHARS.includes(p));
  if (noChar.length && noChar.length !== parts.length) keys.add(norm(noChar.join('')));
  return keys;
}
const index = new Map();          // key -> [card]
for (const c of cards) {
  for (const k of slugKeys(c.slug)) {
    if (!index.has(k)) index.set(k, []);
    index.get(k).push(c);
  }
}
// 噪音过滤
const BAD = /(event:|and power|new multiplayer|portrait|peek button|wrapping navigation|placeholder|blessing pools|^\s*new\s|rarity$|turn and|^null$|^hotfix$|^deprecated$|^and |^up |^\d)/i;
// 拆分 "A and B"（两个独立对象）
function splitObjs(name) {
  const m = String(name).match(/^(.+?)\s+and\s+(.+)$/);
  if (!m) return [name];
  const a = m[1].trim(), b = m[2].trim();
  if (!/^[A-Z]/.test(a) || !/^[A-Z]/.test(b)) return [name];
  return [a, b];
}

// 一个英文名生成多个候选 key（处理 X's Y / the Y 等差异）
function candidates(nm) {
  const base = String(nm).trim();
  const list = new Set([base]);
  const poss = base.match(/^(.+?)'s\s+(.+)$/);       // Neow's Abundance -> Abundance
  if (poss) { list.add(poss[2]); list.add(poss[1]); }
  for (const b of [...list]) {
    if (/^the\s+/i.test(b)) list.add(b.replace(/^the\s+/i, ''));
    else list.add('the ' + b);
  }
  return [...list].map(norm).filter(Boolean);
}
function lookup(nm) {
  for (const k of candidates(nm)) {
    if (index.has(k)) return index.get(k);
  }
  // 模糊：互为子串（要求长度足够，避免误伤）
  for (const k of candidates(nm)) {
    if (k.length < 5) continue;
    for (const [kk, arr] of index) {
      if (kk.length >= 5 && (kk.startsWith(k) || kk.endsWith(k))) return arr;
    }
  }
  return null;
}

let matched = 0, unmatched = [];
const result = [];
for (const it of items) {
  if (BAD.test(it.obj) || it.obj.length > 36) continue;
  const parts = splitObjs(it.obj);
  for (const nm of parts) {
    const hit = lookup(nm);
    if (hit && hit.length) {
      matched++;
      for (const c of hit) result.push(Object.assign({}, it, { obj: nm, slug: c.slug, cn: c.name, char: c.char }));
    } else {
      unmatched.push({ obj: nm, ver: it.ver, type: it.objType, en: it.en.slice(0, 90) });
    }
  }
}
const uniqObj = [...new Set(unmatched.map(u => u.obj))];
console.log('匹配条目：', matched, '；未匹配条目：', unmatched.length, '（涉及', uniqObj.length, '个对象）');
console.log('\n未匹配对象清单：');
uniqObj.sort().forEach(o => console.log('  - ' + o));
fs.writeFileSync('_matched.json', JSON.stringify(result, null, 1));
fs.writeFileSync('_unmatched.json', JSON.stringify(unmatched, null, 1));
console.log('\n已写出 _matched.json / _unmatched.json');
