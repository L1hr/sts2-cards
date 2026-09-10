'use strict';
/* StS1 改动说明中文化（术语与 StS1 官方中文保持一致，如 Exhaust=消耗） */
const fs = require('fs');
const items = JSON.parse(fs.readFileSync('_s1_matched.json', 'utf8'));

const TERM = [
  ['Energy cost', '能量消耗'], ['HP loss', '生命值损失'], ['Card draw', '抽牌数'],
  ['Energy gain', '获得能量'], ['Strength gain', '力量获得'], ['Focus loss', '专注损失'],
  ['Max HP', '最大生命值'], ['Additional damage', '额外伤害'],
  ['Damage', '伤害'], ['damage', '伤害'], ['Block', '格挡'], ['Energy', '能量'],
  ['Vulnerable', '易伤'], ['Weak', '虚弱'], ['Poison', '中毒'], ['Strength', '力量'],
  ['Dexterity', '敏捷'], ['Focus', '专注'], ['Frail', '脆弱'], ['Artifact', '神器'],
  ['Thorns', '尖刺'], ['Metallicize', '金属化'], ['Intangible', '无形'],
  ['Retain', '保留'], ['Innate', '固有'], ['Ethereal', '虚无'], ['Exhaust', '消耗'],
  ['shivs', '飞刀'], ['Shivs', '飞刀'], ['shiv', '飞刀'],
  ['Cost', '消耗'], ['cost', '消耗'], ['Rarity', '稀有度'], ['Rare', '稀有'],
  ['Uncommon', '罕见'], ['Common', '普通'], ['Boss', ' Boss'], ['Upgrade', '升级'],
  ['increased', '提升'], ['decreased', '降低'], ['reduced', '降低'],
  ['changed', '改为'], ['from', '从'], ['to', '至'],
];
function terms(s) {
  let t = String(s);
  for (const [en, zh] of TERM) t = t.replace(new RegExp('\\b' + en.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'g'), zh);
  return t;
}
const UP = '提升至', DOWN = '降至';

function translate(en, kind) {
  let s = String(en || '').trim();
  if (!s) return { zh: '', ok: true };
  // 去掉开头的状态动词（界面上已有「增强/削弱」标签）
  s = s.replace(/^(?:buffed|nerfed|reworked|changed|adjusted|updated|rebalanced)\s*[.:]?\s*/i, '');
  if (!s) return { zh: '整体改动', ok: true };
  let out = s;

  // X increased/decreased from A -> B
  out = out.replace(/([A-Za-z\u4e00-\u9fa5 ,]+?)\s+(increased|decreased|reduced|raised|lowered)\s+from\s+([0-9Xx()\-.+]+)\s*(?:->|→|to)\s*([0-9Xx()\-.+]+)/gi,
    (all, k, v, a, b) => terms(k.trim()) + '从 ' + a + ' ' + (/increas|rais/i.test(v) ? UP : DOWN) + ' ' + b);
  // X from A -> B
  out = out.replace(/([A-Za-z\u4e00-\u9fa5 ,]+?)\s+from\s+([0-9Xx()\-.+]+)\s*(?:->|→)\s*([0-9Xx()\-.+]+)/gi,
    (all, k, a, b) => terms(k.trim()) + '从 ' + a + ' ' + (kind === 'nerf' ? DOWN : UP) + ' ' + b);
  // A -> B shivs / X A -> B
  out = out.replace(/^([0-9]+)\s*(?:->|→)\s*([0-9]+)\s+([A-Za-z\u4e00-\u9fa5]+)/i,
    (all, a, b, k) => terms(k) + '数量从 ' + a + ' ' + UP + ' ' + b);
  // Energy cost 0 -> 1（无 from）
  out = out.replace(/^([A-Za-z\u4e00-\u9fa5 ]+?)\s+([0-9Xx()\-.+]+)\s*(?:->|→)\s*([0-9Xx()\-.+]+)$/i,
    (all, k, a, b) => terms(k.trim()) + '从 ' + a + ' ' + (kind === 'buff' ? DOWN : UP) + ' ' + b);

  if (/[A-Za-z]{4,}/.test(out)) {
    out = terms(out);
    out = out.replace(/\s*(?:->|→)\s*/g, ' → ').replace(/\s+/g, ' ').replace(/\s*([。.,])\s*/g, '$1').trim();
    if (/[A-Za-z]{4,}/.test(out)) return { zh: out, ok: false };
  }
  return { zh: out.replace(/\.$/, ''), ok: true };
}

let done = 0; const todo = [];
const res = items.map(it => {
  const r = translate(it.en, it.kind);
  if (r.ok) done++; else todo.push(Object.assign({}, it, { partial: r.zh }));
  return Object.assign({}, it, { zh: r.zh, auto: r.ok });
});
console.log('自动翻译：' + done + '/' + res.length + '（' + Math.round(done / res.length * 100) + '%）｜待人工：' + todo.length);
fs.writeFileSync('_s1_translated.json', JSON.stringify(res, null, 1));
fs.writeFileSync('_s1_todo.json', JSON.stringify(todo, null, 1));
console.log('\n=== 自动翻译样例 20 条 ===');
res.filter(r => r.auto).slice(0, 20).forEach(r => console.log('  [' + r.ver + '] ' + r.cn + '：' + r.zh.slice(0, 80)));
console.log('\n=== 待人工（前 45）===');
todo.slice(0, 45).forEach((t, i) => console.log((i + 1) + '|' + t.cn + '|' + t.kind + '|' + t.en.slice(0, 150)));
