/* Build cards1.json (StS1 card data) from scraped huijiwiki color pages + art scan.
   Usage: node build_cards1.js   (after _grab.js produced _color_*.html and _artscan.js produced _art.json)
   Output: cards1.json  (schema mirrors cards.json for StS2, plus per-card art full URLs)
*/
const fs = require('fs');

function stripTags(html) {
  return html.replace(/<br\s*\/?>/gi,'\n').replace(/<[^>]+>/g,'')
    .replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
    .replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&#0?39;/g,"'")
    .replace(/[ \t]+/g,' ').trim();
}
function parseFile(colorCn){
  const html=fs.readFileSync('_color_'+colorCn+'.html','utf8');
  const ti=html.indexOf('class="wikitable'); if(ti<0) return [];
  const table=html.slice(ti); const rows=[]; const trRe=/<tr[^>]*>([\s\S]*?)<\/tr>/g; let m;
  while((m=trRe.exec(table))){
    const inner=m[1]; const tds=inner.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g);
    if(!tds||tds.length<8) continue;
    const cells=tds.map(t=>t.replace(/^<t[dh][^>]*>/,'').replace(/<\/t[dh]>$/,''));
    const name=(cells[0].match(/<a[^>]*>([^<]*)<\/a>/)||[])[1] || stripTags(cells[0]);
    const en=stripTags(cells[1]); if(!en||/名称/.test(name)) continue;
    rows.push({name,en,rarity:stripTags(cells[3]),type:stripTags(cells[4]),
      cost:stripTags(cells[5]),desc:stripTags(cells[6]).replace(/\n+/g,'\n'),
      upcost:stripTags(cells[7]),updesc:stripTags(cells[8]).replace(/\n+/g,'\n')});
  }
  return rows;
}
const charByPage={'红色牌':'ironclad','绿色牌':'silent','蓝色牌':'defect','紫色牌':'watcher','无色牌':'colorless','诅咒牌':'curse','状态牌':'status'};
const typeMap={'攻击':'attack','技能':'skill','能力':'power','状态':'status','诅咒':'curse'};
const rarityMap={'普通':'common','罕见':'uncommon','稀有':'rare','初始':'starter','特殊':'special','诅咒':'curse'};
const cnSuffix = {'ironclad':'R','silent':'G','defect':'B','watcher':'P'};
const zhColor = {'ironclad':'红','silent':'绿','defect':'蓝','watcher':'紫'};
function normCost(c){ if(c==='-2') return ''; if(c==='-1') return 'X'; return c; }

let arts={}; try{ arts=JSON.parse(fs.readFileSync('_art.json','utf8')); }catch(_){}
let basicArts={}; try{ basicArts=JSON.parse(fs.readFileSync('_basic_art.json','utf8')); }catch(_){}
// 基础牌跨角色重名（打击/防御）艺术图按角色区分
const basicCnToArtKey = {'打击（红）':'ironclad|打击（红）','打击（绿）':'silent|打击（绿）','打击（蓝）':'defect|打击（蓝）','打击（紫）':'watcher|打击（紫）',
                         '防御（红）':'ironclad|防御（红）','防御（绿）':'silent|防御（绿）','防御（蓝）':'defect|防御（蓝）','防御（紫）':'watcher|防御（紫）'};
console.log('art map loaded:', Object.keys(arts).length, '+ basic', Object.keys(basicArts).length);

const order=['红色牌','绿色牌','蓝色牌','紫色牌','无色牌','诅咒牌','状态牌'];
const cards=[];
for(const p of order){
  let rows=parseFile(p);
  if(p==='无色牌'){ const st=new Set(parseFile('状态牌').map(r=>r.en)); rows=rows.filter(r=>!st.has(r.en)); }
  const char=charByPage[p];
  for(const r of rows){
    const desc=r.desc||'';
    const upRaw=r.updesc==='nil'?'':(r.updesc||'');
    const descUp=upRaw&&upRaw!==desc?upRaw:'';
    const cost=normCost(r.cost);
    const cu=normCost(r.upcost);
    const hasUp=!!descUp || (cu!=='' && cu!==cost);
    const costUp=hasUp?cu:cost;
    // 去重名后缀（打击（红）-> 打击）
    const display = r.name.replace(/（[红绿蓝紫]）$/,'');
    const base=r.en.replace(/[^A-Za-z0-9]+/g,'');
    const slug=(char==='colorless'||char==='curse'||char==='status')?base:(base+(cnSuffix[char]||''));
    // 基础牌（打击/防御）跨角色重名：优先用角色专属立绘
    const art = basicArts[char+'|'+r.name] || arts[r.en] || '';
    cards.push({ slug,name:display,en:r.en,char,type:typeMap[r.type]||r.type,
      rarity:rarityMap[r.rarity]||r.rarity,cost,costUp,desc,descUp,
      art, upgraded:!!descUp, cn:display, wikiRarity:r.rarity });
  }
}
function cnt(k){const m={};cards.forEach(c=>m[c[k]]=(m[c[k]]||0)+1);return m;}
const meta={ total:cards.length, game:'sts1', title:'杀戮尖塔 1 · 全卡牌图鉴',
  chars:{ironclad:'铁甲战士',silent:'静默猎手',defect:'故障机器人',watcher:'观者',colorless:'无色',curse:'诅咒',status:'状态'},
  types:{attack:'攻击',skill:'技能',power:'能力',status:'状态',curse:'诅咒'},
  rarities:{starter:'初始',common:'普通',uncommon:'罕见',rare:'稀有',special:'特殊',curse:'诅咒'},
  charOrder:['ironclad','silent','defect','watcher','colorless','curse','status'],
  typeOrder:['attack','skill','power','status','curse'],
  rareOrder:['starter','common','uncommon','rare','special','curse'],
  charCounts:cnt('char'),typeCounts:cnt('type'),rarityCounts:cnt('rarity'),
};
fs.writeFileSync('cards1.json', JSON.stringify({meta,cards},null,1));
const noArt=cards.filter(c=>!c.art).length;
console.log('cards1.json written:',cards.length,'cards | missing art:',noArt);
console.log('rarities:',JSON.stringify(meta.rarityCounts));
console.log('chars:',JSON.stringify(meta.charCounts));
console.log('types:',JSON.stringify(meta.typeCounts));
