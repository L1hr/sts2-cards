'use strict';
/* 把英文改动说明译成中文：先走规则模板，剩下的留给人工 */
const fs = require('fs');
const m = JSON.parse(fs.readFileSync('_matched.json', 'utf8'));

// 术语表（长词优先）
const TERM = [
  ['Energy cost', '能量消耗'], ['Star cost', '星辰消耗'], ['Max HP', '最大生命值'],
  ['HP loss', '生命值损失'], ['Block gain', '格挡'], ['Base damage', '基础伤害'],
  ['Scaling damage', '成长伤害'], ['self-Strength', '自身力量'], ['self-Doom', '自身厄运'],
  ['Upgrade', '升级'], ['Energy', '能量'], ['Damage', '伤害'], ['damage', '伤害'],
  ['Block', '格挡'], ['Vulnerable', '易伤'], ['Weak', '虚弱'], ['Poison', '中毒'],
  ['Strength', '力量'], ['Dexterity', '敏捷'], ['Doom', '厄运'], ['Forge', '锻造值'],
  ['Souls', '灵魂'], ['souls', '灵魂'], ['Ethereal', '虚无'], ['Exhausts', '耗尽'],
  ['Exhaust', '耗尽'], ['Replay', '再施放'], ['Plating', '镀层'], ['Stars', '星辰'],
  ['Thorns', '尖刺'], ['Focus', '专注'], ['Health', '生命值'], ['Gold', '金币'],
  ['Cost', '消耗'], ['cost', '消耗'], ['Rarity', '稀有度'], ['Uncommon', '罕見'],
  ['Common', '普通'], ['Rare', '稀有'], ['Attack', '攻击'], ['Skill', '技能'],
  ['Power', '能力'], ['Status', '状态'], ['Curse', '诅咒'], ['card', '牌'],
  ['Hand', '手牌'], ['Draw Pile', '抽牌堆'], ['Discard Pile', '弃牌堆'],
  ['increased', '提升'], ['decreased', '降低'], ['reduced', '降低'],
  ['Additional', '额外'], ['instead of', '而非'], ['no longer', '不再'],
];
function terms(s) {
  let t = s;
  for (const [en, zh] of TERM) t = t.replace(new RegExp('\\b' + en.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'g'), zh);
  return t;
}

const UP = '提升至', DOWN = '降至';
function zhNumber(s) { return String(s).replace(/->/g, '→').trim(); }

function translate(en, kind) {
  let s = String(en || '').trim();
  if (!s) return '';
  let out = s;
  let hit = true;

  // 1) 数值增减：X increased/decreased from A -> B   或  X from A -> B
  out = out.replace(/([A-Za-z\u4e00-\u9fa5 \-]+?)\s+(increased|decreased|raised|lowered|reduced)\s+from\s+([0-9X()\-.]+)\s*(?:->|→)\s*([0-9X()\-.]+)/gi,
    (all, k, v, a, b) => {
      const dir = /increas|rais/i.test(v) ? UP : DOWN;
      return terms(k.trim()) + '从 ' + zhNumber(a) + ' ' + dir + ' ' + zhNumber(b);
    });
  out = out.replace(/([A-Za-z\u4e00-\u9fa5 \-]+?)\s+from\s+([0-9X()\-.]+)\s*(?:->|→)\s*([0-9X()\-.]+)/gi,
    (all, k, a, b) => {
      const dir = kind === 'nerf' ? DOWN : UP;
      return terms(k.trim()) + '从 ' + zhNumber(a) + ' ' + dir + ' ' + zhNumber(b);
    });

  // 2) 常见整句
  const PHRASES = [
    [/^now\s+Exhausts?\.?$/i, '新增耗尽效果'],
    [/^now\s+Ethereal\.?$/i, '新增虚无效果'],
    [/^Is now Ethereal\.?$/i, '现在具有虚无'],
    [/^now Exhausts?\s+and/i, '新增耗尽效果，且'],
    [/no longer (increases|increas)\s+(.+)$/i, (a, v, k) => '升级不再提升' + terms(k.trim())],
    [/Upgrade no longer (.+)$/i, (a, k) => '升级不再' + terms(k.trim())],
    [/Upgrade changed from (.+?) -> (.+)$/i, (a, x, y) => '升级效果从「' + terms(x.trim()) + '」改为「' + terms(y.trim()) + '」'],
    [/Now a (\w+) that no longer (.+)$/i, (a, t, k) => '改为' + terms(t) + '牌，不再' + terms(k.trim())],
    [/now creates? (.+?) instead of (.+)$/i, (a, x, y) => '改为生成' + terms(x.trim()) + '，而非' + terms(y.trim())],
    [/^(?:Energy )?[Cc]ost (?:increased|decreased) from ([0-9X()\-.]+) -> ([0-9X()\-.]+)$/i,
      (a, x, y) => '能量消耗从 ' + zhNumber(x) + ' ' + (/increas/i.test(a) ? UP : DOWN) + ' ' + zhNumber(y)],
  ];
  for (const [re, rep] of PHRASES) {
    if (re.test(out)) { out = out.replace(re, rep); hit = true; break; }
  }

  // 3) 剩余的英文：术语替换 + 标记待人工
  if (/[A-Za-z]{4,}/.test(out)) {
    out = terms(out);
    out = out.replace(/\s*->\s*/g, ' → ').replace(/\s+/g, ' ').trim();
    if (/[A-Za-z]{4,}/.test(out)) hit = false;   // 仍有英文单词 -> 需人工
  }
  return { zh: out, ok: hit };
}

let done = 0, todo = [];
const res = m.map(it => {
  const r = translate(it.en, it.kind);
  if (r.ok) done++;
  else todo.push(Object.assign({}, it, { partial: r.zh }));
  return Object.assign({}, it, { zh: r.zh, auto: r.ok });
});
console.log('自动翻译：' + done + '/' + res.length + '（' + Math.round(done / res.length * 100) + '%）');
console.log('待人工：' + todo.length);
fs.writeFileSync('_translated.json', JSON.stringify(res, null, 1));
fs.writeFileSync('_todo_translate.json', JSON.stringify(todo, null, 1));
console.log('\n=== 待人工条目（前 40）===');
todo.slice(0, 40).forEach((t, i) => console.log((i + 1) + '. [' + t.ver + '] ' + t.cn + ' (' + t.kind + ')\n   EN: ' + t.en.slice(0, 200) + '\n   部分: ' + t.partial.slice(0, 160)));
