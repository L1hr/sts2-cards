'use strict';
/* 合并自动翻译 + 人工翻译，产出 card-history.json / relic-history.json */
const fs = require('fs');
const tr = JSON.parse(fs.readFileSync('_translated.json', 'utf8'));
const todo = JSON.parse(fs.readFileSync('_todo_translate.json', 'utf8'));
const zhs = ['_zh_1.json', '_zh_2.json', '_zh_3.json'].map(f => JSON.parse(fs.readFileSync(f, 'utf8')));
const manual = Object.assign({}, ...zhs);

// 人工翻译回填
const key = o => o.slug + '|' + o.ver + '|' + o.en;
const map = new Map(tr.map(o => [key(o), o]));
let filled = 0;
todo.forEach((t, i) => {
  const zh = manual[String(i)];
  const o = map.get(key(t));
  if (!o) { console.log('  找不到对应条目：#' + i + ' ' + t.cn); return; }
  if (zh) { o.zh = zh; o.auto = false; filled++; }
  else console.log('  缺人工翻译：#' + i + ' ' + t.cn + ' | ' + t.en.slice(0, 60));
});
console.log('人工翻译回填：' + filled + '/' + todo.length);

const stillEn = tr.filter(o => /[A-Za-z]{4,}/.test(o.zh || ''));
if (stillEn.length) {
  console.log('\n仍含英文的条目 ' + stillEn.length + ' 条：');
  stillEn.slice(0, 15).forEach(o => console.log('  [' + o.ver + '] ' + o.cn + '：' + o.zh.slice(0, 90)));
}

const KIND_CN = { buff: '增强', nerf: '削弱', rework: '重做', change: '调整', new: '新增' };
// 按卡聚合
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
fs.writeFileSync('card-history.json', JSON.stringify({
  meta: {
    game: 'sts2', source: 'Steam 官方补丁说明 (Slay the Spire 2, appid 2868840)',
    versions: [...new Set(tr.map(o => o.ver))].sort((a, b) => a.localeCompare(b, { numeric: true })),
    updated: new Date().toISOString().slice(0, 10),
    count: Object.keys(hist).length, changes: tr.length,
  },
  cards: hist,
}, null, 1));
console.log('\ncard-history.json：' + Object.keys(hist).length + ' 张卡 / ' + tr.length + ' 条改动');
console.log('覆盖版本：' + [...new Set(tr.map(o => o.ver))].join(', '));

// 遗物单独存（暂无展示位）
const items = JSON.parse(fs.readFileSync('_patch_items.json', 'utf8'));
const relics = items.filter(o => o.objType === 'relic');
const byRelic = new Map();
for (const o of relics) {
  if (!byRelic.has(o.obj)) byRelic.set(o.obj, { obj: o.obj, list: [] });
  byRelic.get(o.obj).list.push({ ver: o.ver, date: o.date, kind: o.kind, kindCn: KIND_CN[o.kind] || '调整', zh: '', en: o.en });
}
const rh = {};
for (const [k, v] of byRelic) { v.list.sort((a, b) => b.ver.localeCompare(a.ver, { numeric: true })); rh[k] = v.list; }
fs.writeFileSync('relic-history.json', JSON.stringify({ meta: { game: 'sts2', count: Object.keys(rh).length, changes: relics.length, note: '图鉴暂无遗物页面，数据先存着' }, relics: rh }, null, 1));
console.log('relic-history.json：' + Object.keys(rh).length + ' 件遗物 / ' + relics.length + ' 条改动');
