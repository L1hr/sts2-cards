'use strict';
/* 合并 S1 自动翻译 + 人工翻译，产出 history-sts1.json（结构与 history-sts2.json 一致） */
const fs = require('fs');
const tr = JSON.parse(fs.readFileSync('_s1_translated.json', 'utf8'));
const todo = JSON.parse(fs.readFileSync('_s1_todo.json', 'utf8'));
const manual = JSON.parse(fs.readFileSync('_zh_s1.json', 'utf8'));

const key = o => o.slug + '|' + o.ver + '|' + o.en;
const map = new Map(tr.map(o => [key(o), o]));
let filled = 0, missing = 0;
todo.forEach((t, i) => {
  const zh = manual[String(i)];
  const o = map.get(key(t));
  if (!o) { console.log('  找不到对应条目：#' + i + ' ' + t.cn); return; }
  if (zh) { o.zh = zh; o.auto = false; filled++; }
  else { missing++; console.log('  缺人工翻译：#' + i + ' ' + t.cn + ' | ' + t.en.slice(0, 60)); }
});
console.log('人工翻译回填：' + filled + '/' + todo.length + (missing ? '（缺 ' + missing + '）' : ''));

const stillEn = tr.filter(o => /[A-Za-z]{4,}/.test(o.zh || ''));
if (stillEn.length) {
  console.log('\n仍含英文的条目 ' + stillEn.length + ' 条：');
  stillEn.slice(0, 15).forEach(o => console.log('  [' + o.ver + '] ' + o.cn + '：' + o.zh.slice(0, 90)));
}

const KIND_CN = { buff: '增强', nerf: '削弱', rework: '重做', change: '调整', new: '新增' };
const bySlug = new Map();
for (const o of tr) {
  if (!o.slug) continue;
  if (!bySlug.has(o.slug)) bySlug.set(o.slug, { slug: o.slug, cn: o.cn, char: o.char, list: [] });
  bySlug.get(o.slug).list.push({
    ver: o.ver, date: o.date, kind: o.kind, kindCn: KIND_CN[o.kind] || '调整',
    zh: o.zh, en: o.en,
  });
}
const hist = {};
for (const [slug, v] of bySlug) {
  v.list.sort((a, b) => b.ver.localeCompare(a.ver, undefined, { numeric: true }));
  hist[slug] = { cn: v.cn, char: v.char, list: v.list };
}
fs.writeFileSync('history-sts1.json', JSON.stringify({
  meta: {
    game: 'sts1', source: 'Steam 官方补丁说明 (Slay the Spire, appid 646570)',
    versions: [...new Set(tr.map(o => o.ver))].sort((a, b) => a.localeCompare(b, { numeric: true })),
    updated: new Date().toISOString().slice(0, 10),
    count: Object.keys(hist).length, changes: tr.length,
  },
  cards: hist,
}, null, 1));
console.log('\nhistory-sts1.json：' + Object.keys(hist).length + ' 张卡 / ' + tr.length + ' 条改动');
console.log('覆盖版本：' + [...new Set(tr.map(o => o.ver))].join(', '));
