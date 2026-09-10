'use strict';
/* 从 Steam 官方补丁原文中提取「卡牌 / 遗物」改动条目
   输入：_news_full.json（StS2, appid 2868840）
   输出：_patch_items.json
*/
const fs = require('fs');
const news = JSON.parse(fs.readFileSync('_news_full.json', 'utf8'));
const items = (news.appnews && news.appnews.newsitems) || [];

const VERB = {
  Buffed: 'buff', Nerfed: 'nerf', Changed: 'change', Reworked: 'rework',
  Adjusted: 'change', Reverted: 'change', Removed: 'change', Added: 'new',
};
// 明显的 bug 修复 / 无关条目关键词
const NOISE = /\b(softlock|crash|issue|bug|error|fixed|state divergence|controller nav|localization|sfx|vfx|portrait art|art for|hovertip|tooltip)\b/i;
// 段落 -> 归属角色 / 分类
function scopeOf(sec) {
  const s = String(sec || '').toLowerCase();
  if (/^ironclad/.test(s)) return 'ironclad';
  if (/^silent/.test(s)) return 'silent';
  if (/^regent/.test(s)) return 'regent';
  if (/^necrobinder/.test(s)) return 'necrobinder';
  if (/^defect/.test(s)) return 'defect';
  if (/^colorless/.test(s)) return 'colorless';
  if (/^ancient/.test(s)) return 'ancient';
  if (/^enem/.test(s)) return 'enemy';
  if (/^event/.test(s)) return 'event';
  if (/^potion|relic/.test(s)) return 'relic';
  if (/^general/.test(s)) return 'general';
  if (/^multiplayer/.test(s)) return 'multiplayer';
  return '';
}
// 去掉 BBCode（[E] 是能量图标，先转成 Energy，避免数字丢失）
const clean = t => String(t || '')
  .replace(/\[E\]/g, 'Energy')
  .replace(/\[b\](.+?)\[\/b\]/g, '$1')
  .replace(/\[\/?[a-z0-9]+\]/gi, '')
  .replace(/\[img\][\s\S]*?\[\/img\]/gi, '')
  .replace(/\s+/g, ' ').trim();

const patches = items
  .filter(n => /Patch Notes|Hotfix Notes|Major Update/i.test(n.title || ''))
  .map(n => ({
    title: n.title,
    date: new Date(n.date * 1000).toISOString().slice(0, 10),
    ver: (String(n.title).match(/v?(\d+\.\d+(?:\.\d+)?)/) || [])[1] || '',
    contents: n.contents || '',
  }))
  .filter(p => p.ver)
  .sort((a, b) => a.ver.localeCompare(b.ver, undefined, { numeric: true }));

const out = [];
for (const p of patches) {
  const lines = p.contents.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  let sec = '', cur = null;
  const push = () => { if (cur) out.push(cur); cur = null; };
  for (const ln of lines) {
    // 段落标题：[b]xxx:[/b]  或 [h2]xxx[/h2]
    const mh = ln.match(/^(?:\[b\]|\[h1\]|\[h2\]|\[h3\])(.+?)(?:\[\/b\]|\[\/h1\]|\[\/h2\]|\[\/h3\])\s*:?\s*$/i);
    if (mh && !ln.startsWith('[*]') && !ln.startsWith('* ')) {
      push();
      sec = mh[1].replace(/:$/, '').trim();
      continue;
    }
    const mi = ln.match(/^(?:\[\*\]|\*)\s*(.*)$/);
    if (!mi) continue;
    const t = clean(mi[1]);
    if (!t) continue;
    const scope = scopeOf(sec);

    // 段落为敌人/事件/UI 等时，条目不是卡牌，跳过（避免 "Nerfed [b]Axebot[/b]:" 之类混入）
    if (/(enem|event|\bui\b|\bux\b|bug|local|modd|leaderboard|controller|\bart\b|writing|sound|misc|ascension|doormaker|performance)/i.test(sec)) { cur = null; continue; }

    // 父条目：Verb [b]Name[/b] (card|relic|potion...) [:] desc   ——对象类型可省略
    const m = t.match(/^(Buffed|Nerfed|Changed|Reworked|Adjusted|Reverted|Removed|Added)\s+(?:the\s+)?(.+?)\s*((?:card|relic|potion|status|curse)s?)?\s*:\s*(.*)$/i);
    if (m) {
      push();
      const verb = m[1][0].toUpperCase() + m[1].slice(1).toLowerCase();
      let name = m[2].replace(/^(the|a|an)\s+/i, '').trim();
      let kind = (m[3] || 'card').replace(/s$/i, '').toLowerCase();
      let desc = (m[4] || '').trim();
      if (NOISE.test(name) || NOISE.test(desc)) { cur = null; continue; }
      cur = {
        ver: p.ver, date: p.date, scope, kind: VERB[verb] || 'change',
        objType: kind, obj: name, en: desc,
        raw: t.slice(0, 400),
      };
      continue;
    }
    // 子条目：归属于上一个父条目
    if (cur) {
      if (/^(?:\[list\]|\[\/list\])/.test(ln)) continue;
      cur.en = (cur.en ? cur.en + ' ' : '') + t;
      cur.hasSub = true;
    }
  }
  push();
}

// 只保留卡牌与遗物
const keep = out.filter(o => (o.objType === 'card' || o.objType === 'relic') && o.en);
console.log('补丁数：', patches.length);
console.log('总条目：', out.length, '｜保留（卡+遗物）：', keep.length,
  '｜其中卡牌：', keep.filter(o => o.objType === 'card').length,
  '｜遗物：', keep.filter(o => o.objType === 'relic').length);
const byObj = new Map();
keep.forEach(o => { if (!byObj.has(o.obj)) byObj.set(o.obj, 0); byObj.set(o.obj, byObj.get(o.obj) + 1); });
console.log('涉及对象数：', byObj.size);
console.log('\n按版本：');
const byVer = new Map();
keep.forEach(o => byVer.set(o.ver, (byVer.get(o.ver) || 0) + 1));
[...byVer.entries()].forEach(([v, n]) => console.log('  ' + v + '：' + n + ' 条'));
fs.writeFileSync('_patch_items.json', JSON.stringify(keep, null, 1));
console.log('\n已写出 _patch_items.json');
