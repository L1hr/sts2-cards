'use strict';
/* 解析 StS1 官方补丁（appid 646570）：提取卡牌 / 遗物改动
   输入：_s1_news.json   输出：_s1_items.json
   格式特点：* Sever Soul+ card buffed. Damage increased from 20 -> 22.
*/
const fs = require('fs');
const news = JSON.parse(fs.readFileSync('_s1_news.json', 'utf8'));
const items = (news.appnews && news.appnews.newsitems) || [];

const NOISE = /\b(softlock|crash|issue|bug|error|fixed|localization|controller|resolution|ultrawide|save slot|sfx|vfx|art)\b/i;
const clean = t => String(t || '')
  .replace(/\[E\]/g, 'Energy')
  .replace(/\[b\](.+?)\[\/b\]/g, '$1')
  .replace(/\[\/?[a-z0-9]+\]/gi, '')
  .replace(/\[img\][\s\S]*?\[\/img\]/gi, '')
  .replace(/\s+/g, ' ').trim();

// 版本号：Weekly Patch 53 / Patch V2.0 / Hotfixes for V2.0 / V2.2: Hot Fix
function verOf(title) {
  const t = String(title || '');
  let m = t.match(/v?(\d+\.\d+(?:\.\d+)?)/i);
  let ver = m ? m[1] : '';
  let label = t.replace(/\s*-\s*/g, ' ').trim();
  if (/weekly patch\s*(\d+)/i.test(t)) {
    const n = t.match(/weekly patch\s*(\d+)/i)[1];
    ver = 'WP' + n;
    label = 'Weekly Patch ' + n;
  } else if (m) {
    label = 'V' + m[1];
  }
  return { ver, label };
}

const out = [];
for (const n of items) {
  const title = n.title || '';
  if (!/patch|hotfix|update/i.test(title)) continue;
  if (/board game|kickstarter|neowsletter|ios|android|coming|out now|releases|progress report|top sellers|review|mods|guide|best|gets|makes|just got|reverses|lifts|peaks|redesigns| slowing/i.test(title)) continue;
  const { ver, label } = verOf(title);
  if (!ver) continue;
  const date = new Date(n.date * 1000).toISOString().slice(0, 10);
  const lines = (n.contents || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  for (const ln of lines) {
    if (!/^(?:\*|\[\*\])\s*/.test(ln)) continue;
    const t = clean(ln.replace(/^(?:\*|\[\*\])\s*/, ''));
    if (!t || NOISE.test(t)) continue;
    // <Name> <card|relic|potion> <rest>
    const m = t.match(/^(?:the\s+)?(.+?)\s+(card|relic|potion|status)s?\b\s*(.*)$/i);
    if (!m) continue;
    let name = m[1].trim().replace(/[.,:]$/, '');
    const type = m[2].toLowerCase();
    let rest = (m[3] || '').trim();
    // "Bite is now a Colorless card" 之类：把对象名截断到动词前
    const cut = name.match(/^(.*?)\s+(?:is\s+now|are\s+now|now|no\s+longer|can\s+now|will\s+now|has\s+been|and|or)\b/i);
    if (cut && cut[1].trim().length >= 3) {
      const i2 = t.toLowerCase().indexOf(cut[1].toLowerCase());
      rest = (i2 >= 0 ? t.slice(i2 + cut[1].length) : rest).trim();
      name = cut[1].trim();
    }
    if (!rest) continue;
    // 过滤：必须是大写开头的专有名词，且不是功能/UI 类描述
    if (!/^[A-Z0-9]/.test(name)) continue;
    if (/^(Adding|Added|All|Any|Attack|Bonus|Can|Cannot|Card|Certain|Clicking|Compressing|Confirm|Consistency|Controllers|Copying|Correctly|Custom|Damage|Decreased|Diverse|Fixed|Hovering|Improved|Increasing|Moving|New|Now|Players|Removed|Reworded|Selecting|Some|The|These|This|Tooltip|Updated|Various|When|While|You)\b/.test(name)) continue;
    if (name.length > 34 || name.split(/\s+/).length > 5) continue;
    if (/\b(now|when|if|while|playing|using|pressing|clicking)\b/i.test(name)) continue;
    // 版本/类型归属
    let kind = 'change';
    if (/\brework/i.test(rest)) kind = 'rework';
    else if (/\bbuff/i.test(rest)) kind = 'buff';
    else if (/\bnerf/i.test(rest)) kind = 'nerf';
    else {
      // 隐式：cost increased -> nerf；damage/block/heal increased -> buff
      const up = /increase|raise|gain/i.test(rest), down = /decrease|reduce|lower/i.test(rest);
      if (/\bcost\b/i.test(rest)) kind = up ? 'nerf' : (down ? 'buff' : 'change');
      else if (up) kind = 'buff';
      else if (down) kind = 'nerf';
    }
    out.push({ ver, label, date, kind, objType: type, obj: name, en: rest.replace(/^[.;:]\s*/, '').trim() });
  }
}
// 去重（同一条可能在多个新闻里出现）
const seen = new Set();
const uniq = out.filter(o => {
  const k = o.ver + '|' + o.obj + '|' + o.en;
  if (seen.has(k)) return false; seen.add(k); return true;
});
console.log('补丁数：', [...new Set(uniq.map(o => o.ver))].length);
console.log('条目：', uniq.length, '｜卡牌：', uniq.filter(o => o.objType === 'card').length,
  '｜遗物：', uniq.filter(o => o.objType === 'relic').length);
console.log('对象数：', new Set(uniq.map(o => o.obj)).size);
fs.writeFileSync('_s1_items.json', JSON.stringify(uniq, null, 1));
console.log('\n按版本：');
const byVer = new Map();
uniq.forEach(o => byVer.set(o.ver, (byVer.get(o.ver) || 0) + 1));
[...byVer.entries()].sort((a, b) => a[0].localeCompare(b[0], { numeric: true })).forEach(([v, n]) => console.log('  ' + v + '：' + n));
