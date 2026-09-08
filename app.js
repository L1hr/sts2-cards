/* ===========================================================
   杀戮尖塔 2 · 全卡牌图鉴  v2
   - 数据：从 cards.json 拉取
   - 修复了图标文本：能量/星辰的"N点X"会被渲染为彩色标签
   - 角色/类型/稀有度/费用 多选筛选 + 收藏
   - 搜索（按 / 聚焦、Esc 清空）
   - 详情弹窗：立绘 + 基础/升级对比 + 上一张/下一张 + 收藏 + 复制链接 + 哈希直链
   - 卡名接龙：保留原 WebSocket 逻辑
   =========================================================== */

const APP = {
  CARDS: [],
  meta: null,
  results: [],
  shown: 0,
  currentIndex: -1, // current open card index in `results`
};

let CHAR_CN = {ironclad:'铁甲战士',silent:'静默猎手',defect:'故障机器人',necrobinder:'亡灵契约师',regent:'储君',watcher:'观者',colorless:'无色',event:'事件',status:'状态',curse:'诅咒',quest:'任务',derivative:'衍生'};
let TYPE_CN = {attack:'攻击',skill:'技能',power:'能力',status:'状态',curse:'诅咒',quest:'任务'};
let RARE_CN = {starter:'初始',common:'普通',uncommon:'罕见',rare:'稀有',special:'特殊',event:'事件',elder:'先古之民',status:'状态',curse:'诅咒',quest:'任务',token:'衍生'};
let CHAR_ORDER = ['ironclad','silent','regent','necrobinder','defect','colorless','event','status','curse','quest','derivative'];
let TYPE_ORDER = ['attack','skill','power','status','curse','quest'];
let RARE_ORDER = ['starter','common','uncommon','rare','special','event','elder','status','curse','quest','token'];
let RARE_RANK = {}; RARE_ORDER.forEach((k,i)=>RARE_RANK[k]=i);
const ART_BASE = ''; // StS2 立绘改为本地托管（art/<slug>.webp）；StS1 用绝对 http 不受影响
// 当前游戏与数据文件注册
let CUR = 'sts2';   // 当前游戏 id（sts2 / sts1）
const GAMES = {
  sts2: { file:'cards.json',  label:'杀戮尖塔 2', short:'2', logo:'S2', artBase:ART_BASE,
          footer:'STS2 中文 Wiki（sts2front） · Slay the Spire Wiki · 卡图：sts2front' },
  sts1: { file:'cards1.json', label:'杀戮尖塔 1', short:'1', logo:'S1', artBase:'',
          footer:'灰机wiki 杀戮尖塔 · sts.huijiwiki.com' },
};
const DATA = { sts2: null, sts1: null };   // 两款图鉴数据缓存（接龙对战名集合取二者并集）
// 应用某款游戏的自定义显示字典（角色/类型/稀有度标签、筛选顺序）——从该游戏 meta 读取
function applyGameMeta(meta){
  if(meta){
    if(meta.chars){ CHAR_CN = Object.assign({}, meta.chars); }
    if(meta.types){ TYPE_CN = Object.assign({}, meta.types); }
    if(meta.rarities){ RARE_CN = Object.assign({}, meta.rarities); }
    if(meta.charOrder){ CHAR_ORDER = meta.charOrder.filter(k=>CHAR_CN[k]); }
    if(meta.typeOrder){ TYPE_ORDER = meta.typeOrder.filter(k=>TYPE_CN[k]); }
    if(meta.rareOrder){ RARE_ORDER = meta.rareOrder.filter(k=>RARE_CN[k]); }
    RARE_RANK = {}; RARE_ORDER.forEach((k,i)=>RARE_RANK[k]=i);
  }
}

const state = {
  q: '',
  chars: new Set(),
  types: new Set(),
  rares: new Set(),
  costs: new Set(),
  extra: new Set(),     // 预留（已无筛选项）
  ver: 'base',
  sort: 'default',
  density: 'comfort',
  favOnly: false,
};

const CHUNK = 90;
let results = [];

/* ---------------- safe storage ---------------- */
const store = {
  get(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } },
  set(k,v){ try{ localStorage.setItem(k,v); }catch(e){} },
};
const $ = s => document.querySelector(s);
const qsa = s => Array.from(document.querySelectorAll(s));
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

/* ---------------- token-aware description renderer ---------------- */
function descHTML(t){
  if(!t) return '<span class="muted">（无描述）</span>';
  let s = esc(t);
  // 能量图标：杀戮尖塔1 用 [R][G][B][P] 表示红/绿/蓝/紫 能量点
  s = s.replace(/\[([RGBP])\]/g, '<b class="orb en-$1" title="能量"></b>');
  s = s.replace(/(\d+)点?能量/g, '<b class="orb en" title="能量">$1</b><i class="unit">能量</i>');
  s = s.replace(/(\d+)辉星/g, '<b class="orb star" title="辉星">$1</b><i class="unit">辉星</i>');
  s = s.replace(/(\d+)点?星辰/g, '<b class="orb star" title="星辰">$1</b><i class="unit">星辰</i>');
  s = s.replace(/(\d+)(点?)伤害/g, '<span class="n dmg">$1</span>$2伤害');
  s = s.replace(/(\d+)(点?)格挡/g, '<span class="n blk">$1</span>$2格挡');
  s = s.replace(/(\d+)(点?)生命/g, '<span class="n hp">$1</span>$2生命');
  s = s.replace(/(\d+)层易伤/g, '<span class="n vuln">$1</span>层易伤');
  s = s.replace(/(\d+)层虚弱/g, '<span class="n weak">$1</span>层虚弱');
  s = s.replace(/(\d+)层覆甲/g, '<span class="n ar">$1</span>层覆甲');
  s = s.replace(/(\d+)点力量/g, '<span class="n str">$1</span>点力量');
  s = s.replace(/(\d+)点敏捷/g, '<span class="n dex">$1</span>点敏捷');
  s = s.replace(/(\d+)(点?)活力/g, '<span class="n vig">$1</span>$2活力');
  s = s.replace(/(\d+)(点?)铸造/g, '<span class="n forge">$1</span>$2铸造');
  // 杀戮尖塔1 补充：获得/给予 N 点某种数值 / 造成N伤害 的宽泛匹配
  s = s.replace(/(\d+)点?生命/g, '<span class="n hp">$1</span>$2生命');
  s = s.replace(/(\d+)点?力量/g, '<span class="n str">$1</span>点力量');
  s = s.replace(/(\d+)点?敏捷/g, '<span class="n dex">$1</span>点敏捷');
  s = s.replace(/(\d+)点?格挡/g, '<span class="n blk">$1</span>点格挡');
  return s.split('\n').filter(l=>l.trim()).map(l=>`<span class="ln">${l.trim()}</span>`).join('');
}

/* ---------------- favorites ---------------- */
const FAV_BASE = 'sts-favs-';            // 收藏按游戏隔离
function favKey(){ return FAV_BASE + CUR; }
function getFavs(){
  try{ return new Set(JSON.parse(store.get(favKey()) || '[]')); }catch(e){ return new Set(); }
}
function setFavs(s){ store.set(favKey(), JSON.stringify([...s])); }
function isFav(slug){ return getFavs().has(slug); }
function toggleFav(slug){
  const s = getFavs();
  s.has(slug) ? s.delete(slug) : s.add(slug);
  setFavs(s);
  return s.has(slug);
}

/* ---------------- theme ---------------- */
(function initTheme(){
  const saved = store.get('sts2-theme');
  if (saved === 'dark' || saved === 'light') document.documentElement.dataset.theme = saved;
})();
$('#themeBtn').addEventListener('click', () => {
  const cur = document.documentElement.dataset.theme;
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  store.set('sts2-theme', next);
});

/* ---------------- density ---------------- */
(function initDensity(){
  const saved = store.get('sts2-density');
  if (saved === 'compact' || saved === 'comfort') state.density = saved;
  document.body.classList.toggle('density-compact', state.density === 'compact');
  const seg = $('#densitySeg');
  [...seg.children].forEach(b => b.classList.toggle('on', b.dataset.d === state.density));
})();
$('#densitySeg').addEventListener('click', e => {
  const b = e.target.closest('button'); if(!b) return;
  state.density = b.dataset.d;
  store.set('sts2-density', state.density);
  document.body.classList.toggle('density-compact', state.density === 'compact');
  [...e.currentTarget.children].forEach(x => x.classList.toggle('on', x === b));
});

/* ---------------- filter chips ---------------- */
function countBy(fn){ const m={}; APP.CARDS.forEach(c => { const k=fn(c); m[k]=(m[k]||0)+1; }); return m; }
function mkChip(container, key, label, colorVar, count, group){
  const b = document.createElement('button');
  b.className = 'chip'; b.dataset.k = key;
  b.innerHTML = (colorVar ? `<span class="dot" style="background:${colorVar}"></span>` : '')
              + esc(label) + (count != null ? `<span class="cnt">${count}</span>` : '');
  if (colorVar) b.style.setProperty('--cc', colorVar);
  b.addEventListener('click', () => toggleFilter(group, key, b));
  container.appendChild(b);
}
function toggleFilter(group, key, el){
  const s = state[group];
  s.has(key) ? s.delete(key) : s.add(key);
  el.classList.toggle('on', s.has(key));
  apply();
}
function buildFilters(){
  const cc = countBy(c=>c.char), tc = countBy(c=>c.type), rc = countBy(c=>c.rarity);
  const co = {}; APP.CARDS.forEach(c=>{ const k=c.cost; if(k!=='') co[k]=(co[k]||0)+1; });
  const costs = Object.keys(co).sort((a,b)=>{
    if(a==='X') return 1; if(b==='X') return -1; return (+a)-(+b);
  });
  const fC = $('#fChar'); fC.innerHTML = '';
  CHAR_ORDER.filter(k=>cc[k]).forEach(k => mkChip(fC, k, CHAR_CN[k], `var(--char-${k})`, cc[k], 'chars'));
  const fT = $('#fType'); fT.innerHTML = '';
  TYPE_ORDER.filter(k=>tc[k]).forEach(k => mkChip(fT, k, TYPE_CN[k], null, tc[k], 'types'));
  const fR = $('#fRare'); fR.innerHTML = '';
  RARE_ORDER.filter(k=>rc[k]).forEach(k => mkChip(fR, k, RARE_CN[k], `var(--r-${k})`, rc[k], 'rares'));
  const fCost = $('#fCost'); fCost.innerHTML = '';
  costs.forEach(k => mkChip(fCost, k, k==='X'?'X 费':(k+' 费'), null, co[k], 'costs'));
  // "更多" 状态类筛选
  const fMore = $('#fMore'); fMore.innerHTML = '';
  const favCnt = getFavs().size;
  const favBtn = document.createElement('button');
  favBtn.className = 'chip fav toggle'; favBtn.dataset.k = 'fav';
  favBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/></svg>收藏 <span class="cnt">${favCnt}</span>`;
  favBtn.addEventListener('click', () => {
    state.favOnly = !state.favOnly;
    favBtn.classList.toggle('on', state.favOnly);
    apply();
  });
  fMore.appendChild(favBtn);
}

/* ---------------- active filter summary ---------------- */
function renderActive(){
  const row = $('#activeRow');
  row.innerHTML = '';
  const addTag = (group, key, label) => {
    const tag = document.createElement('span');
    tag.className = 'active-tag';
    tag.innerHTML = `<span>${esc(label)}</span><button title="移除">×</button>`;
    tag.querySelector('button').addEventListener('click', () => {
      state[group].delete(key);
      // sync chip
      const btn = document.querySelector(`.chip[data-k="${CSS.escape(key)}"]`);
      if (btn) btn.classList.remove('on');
      apply();
    });
    row.appendChild(tag);
  };
  state.chars.forEach(k => addTag('chars', k, CHAR_CN[k] || k));
  state.types.forEach(k => addTag('types', k, TYPE_CN[k] || k));
  state.rares.forEach(k => addTag('rares', k, RARE_CN[k] || k));
  state.costs.forEach(k => addTag('costs', k, k === 'X' ? 'X 费' : k+' 费'));
  if (state.favOnly){
    const tag = document.createElement('span');
    tag.className = 'active-tag';
    tag.innerHTML = `<span>仅收藏</span><button title="移除">×</button>`;
    tag.querySelector('button').addEventListener('click', () => {
      state.favOnly = false;
      document.querySelector('.chip.fav')?.classList.remove('on');
      apply();
    });
    row.appendChild(tag);
  }
  if (state.q){
    const tag = document.createElement('span');
    tag.className = 'active-tag';
    tag.innerHTML = `<span>关键词「${esc(state.q)}」</span><button title="移除">×</button>`;
    tag.querySelector('button').addEventListener('click', () => {
      state.q = ''; $('#q').value = '';
      $('#searchBox').classList.remove('has-val');
      apply();
    });
    row.appendChild(tag);
  }
  if (row.children.length > 1){
    const clr = document.createElement('button');
    clr.className = 'clear-all';
    clr.textContent = '清除全部';
    clr.onclick = resetAll;
    row.appendChild(clr);
  }
}

/* ---------------- filter & sort ---------------- */
function apply(){
  const q = state.q.trim().toLowerCase();
  const favs = getFavs();
  results = APP.CARDS.filter(c => {
    if (state.favOnly && !favs.has(c.slug)) return false;
    if (state.chars.size && !state.chars.has(c.char)) return false;
    if (state.types.size && !state.types.has(c.type)) return false;
    if (state.rares.size && !state.rares.has(c.rarity)) return false;
    if (state.costs.size && !state.costs.has(c.cost)) return false;
    if (q){
      const hay = (c.name + ' ' + c.desc + ' ' + (c.descUp||'') + ' ' + c.slug).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  if (state.sort === 'cost'){
    results.sort((a,b)=>{
      const f = v => v==='X' ? 99 : +v;
      return f(a.cost) - f(b.cost) || a.name.localeCompare(b.name,'zh');
    });
  } else if (state.sort === 'name'){
    results.sort((a,b)=>a.name.localeCompare(b.name,'zh'));
  } else if (state.sort === 'rarity'){
    results.sort((a,b)=>(RARE_RANK[a.rarity]-RARE_RANK[b.rarity]) || a.name.localeCompare(b.name,'zh'));
  }
  $('#count').innerHTML = `显示 <b>${results.length}</b> / ${APP.CARDS.length} 张卡牌`;
  $('#empty').style.display = results.length ? 'none' : 'flex';
  $('#grid').innerHTML = '';
  state.shown = 0;
  renderActive();
  renderMore();
}

/* ---------------- progressive render ---------------- */
function renderMore(){
  if (state.shown >= results.length) return;
  const frag = document.createDocumentFragment();
  const end = Math.min(state.shown + CHUNK, results.length);
  for (let i = state.shown; i < end; i++){
    const c = results[i];
    const up = state.ver === 'up';
    const cost = up ? (c.costUp ?? c.cost) : c.cost;
    const desc = up ? (c.descUp || c.desc) : c.desc;
    const isFavCard = isFav(c.slug);
    const d = document.createElement('div');
    d.className = 'card';
    d.tabIndex = 0;
    d.dataset.slug = c.slug;
    d.style.setProperty('--cc', `var(--char-${c.char})`);
    d.style.setProperty('--rc', `var(--r-${c.rarity})`);
    d.style.animationDelay = Math.min((i - state.shown) * 8, 260) + 'ms';
    d.innerHTML = `
      <button class="c-fav ${isFavCard?'on':''}" title="${isFavCard?'取消收藏':'收藏'}" aria-label="收藏">${isFavCard?'★':'☆'}</button>
      <div class="c-top">
        ${cost!=='' ? `<div class="c-cost${String(cost)==='X'?' x':''}">${esc(cost)}</div>` : '<div class="c-cost none"></div>'}
        <div class="c-name">${esc(c.name)}</div>
      </div>
      <div class="c-badges">
        <span class="badge b-type">${esc(TYPE_CN[c.type]||c.type)}</span>
        <span class="badge b-rare">${esc(RARE_CN[c.rarity]||c.rarity)}</span>
        <span class="badge">${esc(CHAR_CN[c.char]||c.char)}</span>
      </div>
      <div class="c-desc">${descHTML(desc)}</div>`;
    d.addEventListener('click', e => {
      if (e.target.closest('.c-fav')) return;
      openCardBySlug(c.slug);
    });
    d.querySelector('.c-fav').addEventListener('click', e => {
      e.stopPropagation();
      const on = toggleFav(c.slug);
      e.currentTarget.classList.toggle('on', on);
      e.currentTarget.textContent = on ? '★' : '☆';
      e.currentTarget.title = on ? '取消收藏' : '收藏';
      if (state.favOnly) apply();
    });
    d.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); openCardBySlug(c.slug); }
    });
    frag.appendChild(d);
  }
  $('#grid').appendChild(frag);
  state.shown = end;
}

/* infinite scroll */
if ('IntersectionObserver' in window){
  new IntersectionObserver(es => {
    if (es[0].isIntersecting) renderMore();
  }, {rootMargin:'600px'}).observe($('#sentinel'));
} else {
  window.addEventListener('scroll', () => {
    if (window.innerHeight + window.scrollY > document.body.offsetHeight - 800) renderMore();
  });
  while (state.shown < 180 && state.shown < APP.CARDS.length) renderMore();
}

/* ---------------- modal ---------------- */
function openCardBySlug(slug){
  // ensure card is in current results; if filtered out, clear filters to show it
  let idx = results.findIndex(c => c.slug === slug);
  if (idx < 0){
    const c = APP.CARDS.find(x => x.slug === slug);
    if (!c) return;
    // relax filters? we just open the modal anyway with that card
    APP.CARDS.find(x => x.slug === slug); // noop
    openModal(c, -1);
    return;
  }
  openModal(results[idx], idx);
}
function openModal(c, idx){
  APP.currentIndex = idx;
  const cc = `var(--char-${c.char})`;
  const sheet = $('#sheet');
  sheet.style.setProperty('--cc', cc);
  sheet.style.setProperty('--rc', `var(--r-${c.rarity})`);
  const sameText = !c.descUp || c.descUp === c.desc;
  const sameCost = String(c.costUp) === String(c.cost);
  const artUrl = /^https?:/i.test(c.art||'') ? c.art : (ART_BASE + (c.art||''));
  const fav = isFav(c.slug);
  const hasPrev = idx > 0;
  const hasNext = idx >= 0 && idx < results.length - 1;
  sheet.innerHTML = `
    <div class="sheet-hd">
      <button class="prev" title="上一张 (←)" ${hasPrev?'':'disabled'}>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
      </button>
      <div style="flex:1;min-width:0">
        <h2>${esc(c.name)}</h2>
        <div class="sub">${esc(CHAR_CN[c.char]||c.char)} · ${esc(TYPE_CN[c.type]||c.type)} · ${esc(RARE_CN[c.rarity]||c.rarity)}</div>
      </div>
      <div class="sheet-actions">
        <button class="fav-btn ${fav?'on':''}" id="modalFav" title="${fav?'取消收藏':'收藏'}">${fav?'★':'☆'}</button>
        <button class="copy-link" id="copyLink" title="复制直链">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>
          复制链接
        </button>
        <button class="x-btn icon-btn" onclick="APP.closeModal()" aria-label="关闭" title="关闭 (Esc)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      </div>
      <button class="next" title="下一张 (→)" ${hasNext?'':'disabled'} style="margin-left:-2px">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>
      </button>
    </div>
    <div class="sheet-art">
      <div class="art">
        <img loading="lazy" referrerpolicy="no-referrer" alt="" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'ph',textContent:'立绘暂不可用'}))" src="${artUrl}">
        ${CUR==='sts2'
          ? '<a class="src" href="https://sts2front.com/zh-cn/cards/" target="_blank" rel="noopener">图片来源</a>'
          : '<a class="src" href="https://sts.huijiwiki.com/" target="_blank" rel="noopener">图片来源</a>'}
      </div>
      <div>
        <div class="sheet-tags">
          <span class="badge b-type">${esc(TYPE_CN[c.type]||c.type)}</span>
          <span class="badge b-rare">${esc(RARE_CN[c.rarity]||c.rarity)}</span>
          <span class="badge" style="color:${cc};background:color-mix(in srgb, var(--char-${c.char}) 12%, transparent);border-color:color-mix(in srgb, var(--char-${c.char}) 28%, transparent)">${esc(CHAR_CN[c.char]||c.char)}</span>
        </div>
        <p style="font-size:12px;color:var(--text-mute);margin:14px 0 0;line-height:1.6">
          升级前后对照：${sameText && sameCost ? '该卡升级后 <b>数值无变化</b>' : '查看右侧橙色框的升级版'}.
          <br>卡牌 ID：<code style="background:var(--surface-2);padding:1px 6px;border-radius:5px">${esc(c.slug)}</code>
        </p>
      </div>
    </div>
    <div class="sheet-body">
      <div class="vers">
        <div class="ver">
          <div class="ver-hd"><span class="t">基础版</span>${c.cost!==''?`<span class="cost${String(c.cost)==='X'?' x':''}">${esc(c.cost)}</span>`:''}</div>
          <div class="ver-desc">${descHTML(c.desc)}</div>
        </div>
        <div class="ver up">
          <div class="ver-hd"><span class="t">升级版</span>${c.costUp!==''?`<span class="cost${String(c.costUp)==='X'?' x':''}">${esc(c.costUp ?? c.cost)}</span>`:''}</div>
          <div class="ver-desc">${descHTML(c.descUp)}</div>
        </div>
      </div>
      ${(sameText && sameCost) ? '<div class="note-line">该卡牌升级后数值无变化</div>' : ''}
    </div>`;
  $('#modal').classList.add('open');
  document.body.style.overflow = 'hidden';
  // bind actions
  sheet.querySelector('.prev')?.addEventListener('click', () => stepModal(-1));
  sheet.querySelector('.next')?.addEventListener('click', () => stepModal(+1));
  sheet.querySelector('#modalFav')?.addEventListener('click', e => {
    const on = toggleFav(c.slug);
    e.currentTarget.classList.toggle('on', on);
    e.currentTarget.textContent = on ? '★' : '☆';
    e.currentTarget.title = on ? '取消收藏' : '收藏';
    // update grid card star if visible
    const cardStar = document.querySelector(`.card[data-slug="${CSS.escape(c.slug)}"] .c-fav`);
    if (cardStar){
      cardStar.classList.toggle('on', on);
      cardStar.textContent = on ? '★' : '☆';
    }
    if (state.favOnly) apply();
  });
  sheet.querySelector('#copyLink')?.addEventListener('click', async e => {
    const url = location.origin + location.pathname + '#card/' + c.slug;
    try{
      await navigator.clipboard.writeText(url);
      const b = e.currentTarget;
      b.classList.add('copied');
      b.lastChild.textContent = '已复制';
      setTimeout(() => { b.classList.remove('copied'); b.lastChild.textContent = '复制链接'; }, 1500);
    }catch(_){
      // fallback: select
      const ta = document.createElement('textarea');
      ta.value = url; document.body.appendChild(ta); ta.select();
      try{ document.execCommand('copy'); }catch(_){}
      ta.remove();
    }
  });
  // update hash without triggering handler
  if (location.hash !== '#card/' + c.slug){
    history.replaceState(null, '', '#card/' + c.slug);
  }
}
function stepModal(d){
  const i = APP.currentIndex + d;
  if (i < 0 || i >= results.length) return;
  openModal(results[i], i);
}
APP.openCardBySlug = openCardBySlug;
APP.closeModal = function(){
  $('#modal').classList.remove('open');
  document.body.style.overflow = '';
  APP.currentIndex = -1;
  if (location.hash.startsWith('#card/')){
    history.replaceState(null, '', location.pathname);
  }
};
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') APP.closeModal(); });

/* ---------------- global keys ---------------- */
document.addEventListener('keydown', e => {
  // ignore when typing in inputs (except our shortcuts)
  const ae = document.activeElement;
  const inField = ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable);
  if (e.key === 'Escape'){
    if ($('#modal').classList.contains('open')){ APP.closeModal(); return; }
    if (inField && ae.id === 'q' && state.q){
      ae.value = ''; state.q = ''; $('#searchBox').classList.remove('has-val'); apply(); return;
    }
    if (inField && ae.id === 'q'){ ae.blur(); return; }
  }
  if (!inField){
    if (e.key === '/'){ e.preventDefault(); $('#q').focus(); $('#q').select(); return; }
    if ($('#modal').classList.contains('open')){
      if (e.key === 'ArrowLeft'){ e.preventDefault(); stepModal(-1); return; }
      if (e.key === 'ArrowRight'){ e.preventDefault(); stepModal(+1); return; }
    }
  }
});

/* ---------------- search events ---------------- */
let _qTimer;
$('#q').addEventListener('input', e => {
  clearTimeout(_qTimer);
  const v = e.target.value;
  $('#searchBox').classList.toggle('has-val', !!v);
  _qTimer = setTimeout(() => { state.q = v; apply(); }, 140);
});
$('#qClear').addEventListener('click', () => {
  $('#q').value = ''; $('#q').focus();
  $('#searchBox').classList.remove('has-val');
  state.q = ''; apply();
});
$('#sort').addEventListener('change', e => { state.sort = e.target.value; apply(); });
$('#verSeg').addEventListener('click', e => {
  const b = e.target.closest('button'); if(!b) return;
  [...e.currentTarget.children].forEach(x => x.classList.toggle('on', x === b));
  state.ver = b.dataset.v; apply();
});
function resetAll(){
  state.q=''; state.chars.clear(); state.types.clear(); state.rares.clear(); state.costs.clear();
  state.extra.clear(); state.favOnly = false;
  state.sort='default'; state.ver='base';
  $('#q').value=''; $('#searchBox').classList.remove('has-val'); $('#sort').value='default';
  [...$('#verSeg').children].forEach((x,i)=>x.classList.toggle('on', i===0));
  document.querySelectorAll('.chip.on').forEach(x=>x.classList.remove('on'));
  apply(); window.scrollTo({top:0,behavior:'smooth'});
}
APP.resetAll = resetAll;
$('#reset').addEventListener('click', resetAll);

/* ---------------- random FAB ---------------- */
$('#fabLink').addEventListener('click', e => {
  e.preventDefault();
  if (!results.length) return;
  const idx = Math.floor(Math.random() * results.length);
  openModal(results[idx], idx);
});
window.addEventListener('scroll', () => {
  const show = window.scrollY > 300 && results.length > 0;
  $('#fab').classList.toggle('show', show);
}, {passive:true});

/* ---------------- hash deep link ---------------- */
function handleHash(){
  const m = location.hash.match(/^#card\/([\w-]+)/);
  if (m){
    const slug = m[1];
    const c = APP.CARDS.find(x => x.slug === slug);
    if (c){
      // ensure shown
      const idx = results.findIndex(x => x.slug === slug);
      openModal(c, idx);
    }
  }
}
window.addEventListener('hashchange', () => { apply(); handleHash(); });

/* ==========================================================
   卡名接龙对战
   ========================================================== */
const G = { ws:null, connected:false, mode:null, me:0, state:null, last:null, used:new Set(), inGame:false, timerInt:null, acIndex:-1, rules:{ban:false, homo:false, gen1:false} };
let NAMES = [];
let NAMESET = new Set();
const HAN = new Map();        // 卡名 -> 汉字集合（精确接龙）
const PIN = new Map();        // 卡名 -> 拼音音节集合（同音接龙）
const GAMEOF = new Map();     // 卡名 -> 'sts1'（仅一代独有的卡，用于「禁用一代卡牌」规则）
const PINYIN_MAP = (typeof window !== 'undefined' && window.PINYIN_MAP) || {};
const isBanned = (n) => /打击/.test(n) || /形态/.test(n);
const shareChar = (a,b) => { const ha=HAN.get(a), hb=HAN.get(b); if(!ha||!hb) return false; for(const c of ha) if(hb.has(c)) return true; return false; };
const syllablesOf = (n) => { const s = new Set(); for (const ch of n){ const p = PINYIN_MAP[ch]; if (p) s.add(p); } return s; };
const shareSyllable = (a,b) => { const ha=PIN.get(a), hb=PIN.get(b); if(!ha||!hb) return false; for(const p of ha) if(hb.has(p)) return true; return false; };
// 接龙判定：rules.homo 开启时读音相同即可（仍兼容完全相同汉字），否则需相同汉字
const canChain = (a,b,rules) => {
  if (rules && rules.homo) return shareSyllable(a,b) || shareChar(a,b);
  return shareChar(a,b);
};
// 接龙对战名集合需覆盖两款图鉴（StS2 + StS1），故从已加载的两份数据并集合成
function initBattleNames(){
  const all = [...(DATA.sts2 ? DATA.sts2.cards : []), ...(DATA.sts1 ? DATA.sts1.cards : [])];
  NAMES = [...new Set(all.map(c => c.name).filter(Boolean))];
  NAMESET = new Set(NAMES);
  HAN.clear(); PIN.clear();
  NAMES.forEach(n => {
    HAN.set(n, new Set([...n].filter(c => /[一-鿿]/.test(c))));
    PIN.set(n, syllablesOf(n));
  });
  // 仅一代（StS1）独有的卡标记为 sts1（与二代重名的如「打击」不计入，禁用一代规则放行）
  const s2 = new Set((DATA.sts2 ? DATA.sts2.cards : []).map(c => c.name));
  GAMEOF.clear();
  (DATA.sts1 ? DATA.sts1.cards : []).forEach(c => { if (c.name && !s2.has(c.name)) GAMEOF.set(c.name, 'sts1'); });
}

let _sendQ = [];
function connect(){
  if (G.ws && (G.ws.readyState === 1 || G.ws.readyState === 0)) return;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  let ws;
  try { ws = new WebSocket(proto + '://' + location.host); } catch(e){ return; }
  G.ws = ws;
  ws.onopen = () => { G.connected = true; const q=_sendQ; _sendQ=[]; q.forEach(o => { try{ ws.send(JSON.stringify(o)); }catch(_){} }); };
  ws.onmessage = e => { try { handle(JSON.parse(e.data)); } catch(_) {} };
  ws.onclose = () => { G.connected = false; _sendQ=[]; if (G.inGame) setHint('✗ 与服务器断开连接', 'bad'); };
  ws.onerror = () => { $('#setup-hint').textContent = '⚠ 无法连接对战服务器（请确认通过服务器访问本页，而非本地双击打开）'; };
}
function send(o){
  if (G.ws && G.ws.readyState === 1) { try { G.ws.send(JSON.stringify(o)); } catch(_){ _sendQ.push(o); } }
  else _sendQ.push(o);
}
function getNick(){ try{ return localStorage.getItem('sts2-nick') || ''; }catch(e){ return ''; } }
function setNick(v){ try{ localStorage.setItem('sts2-nick', v); }catch(e){} }
function switchPanel(id){
  ['p-setup','p-lobby','p-game','p-over'].forEach(p => $('#'+p).classList.toggle('on', p===id));
}
function lobby(title, sub, code){
  $('#lobby-title').textContent = title;
  $('#lobby-sub').textContent = sub;
  if (code){ $('#lobby-code').style.display='flex'; $('#lobby-code-val').textContent = code; }
  else { $('#lobby-code').style.display='none'; }
  switchPanel('p-lobby');
}
function setHint(t, cls){ const h=$('#hint'); h.className='hint '+(cls||'info'); h.innerHTML=t; }
function handle(m){
  switch(m.type){
    case 'waiting': lobby('正在匹配对手…','请稍候，系统正在为你寻找其他玩家', null); break;
    case 'created': lobby('已创建房间','把房间码发给朋友即可对战', m.code); break;
    case 'joined': lobby('已加入房间','等待房主开始对战…', null); break;
    case 'start':
    case 'update': G.me = (m.state.you!==null && m.state.you!==undefined) ? m.state.you : G.me; renderGame(m.state); break;
    case 'error':
      if (G.inGame) setHint('✗ '+esc(m.msg), 'bad');
      else { $('#setup-hint').textContent = '⚠ '+m.msg; }
      break;
    case 'over': showOver(m); break;
  }
}
function renderGame(s){
  G.inGame = true; G.state = s; G.last = s.last; G.used = new Set(s.log.map(x => x.word));
  if (s.rules) G.rules = s.rules;
  switchPanel('p-game');
  s.players.forEach((p,i) => {
    const card = $('#pc-'+i);
    card.querySelector('.nm-t').textContent = p.name;
    card.classList.toggle('turn', i === s.turn);
    const yt = card.querySelector('.you-tag'); if (yt) yt.style.display = (i === s.you) ? 'inline-block' : 'none';
    card.querySelector('.role').textContent = (i === s.you) ? '（你）' : '';
  });
  const cc = $('#chain-card');
  if (!s.last){ $('#chain-lbl').textContent = (s.turn === s.you) ? '你先手！随意出一张卡牌' : '对手先手'; $('#chain-word').textContent = '—'; cc.classList.remove('first'); }
  else { $('#chain-lbl').textContent = G.rules.homo ? '需要接龙（读音相同即可）' : '需要接龙（含相同汉字）'; $('#chain-word').textContent = s.last; cc.classList.add('first'); }
  // 规则标签
  const rl = $('#rules-line'); const chips = [];
  if (G.rules.ban) chips.push('禁用 打击/形态 牌');
  if (G.rules.homo) chips.push('同音字可接龙');
  if (G.rules.gen1) chips.push('禁用一代卡牌');
  rl.innerHTML = chips.map(c => `<span class="rule-chip">${esc(c)}</span>`).join('');
  const myTurn = s.turn === s.you;
  const inp = $('#play-input');
  inp.disabled = !myTurn; $('#submit-btn').disabled = !myTurn;
  $('#turn-who').innerHTML = myTurn ? '<b style="color:var(--accent)">轮到你出牌</b>' : ('等待「'+esc(s.players[s.turn].name)+'」出牌…');
  renderLog(s.log, s.you);
  if (myTurn) setTimeout(() => inp.focus(), 60); else { inp.value=''; closeAC(); }
  validateInput();
  startTimer(s.deadline);
}
function renderLog(log, you){
  const el = $('#log'); el.innerHTML='';
  log.forEach((e,i) => {
    const mine = e.who === you;
    const row = document.createElement('div');
    row.className = 'log-row ' + (mine ? 'mine' : 'opp');
    row.innerHTML = `<span class="who">${mine?'你':(G.state.players[e.who] ? G.state.players[e.who].name.slice(0,1) : '?')}</span><span class="w">${esc(e.word)}</span>`;
    el.appendChild(row);
  });
  el.scrollTop = el.scrollHeight;
}
function startTimer(deadline){
  if (G.timerInt) clearInterval(G.timerInt);
  const C = 169.6, RING = $('#ring'), FG = $('#ring-fg'), NUM = $('#ring-num');
  const tick = () => {
    const remain = Math.max(0, (deadline - Date.now())/1000);
    const frac = remain/30;
    FG.setAttribute('stroke-dashoffset', (C*(1-frac)).toFixed(1));
    NUM.textContent = Math.ceil(remain);
    RING.classList.toggle('low', remain <= 10);
    if (remain <= 0){ clearInterval(G.timerInt); G.timerInt=null; }
  };
  tick(); G.timerInt = setInterval(tick, 250);
}
function validateInput(){
  const inp = $('#play-input'); const v = inp.value.trim();
  if (!G.state) return false;
  if (G.state.turn !== G.state.you){
    setHint('等待对手出牌…', 'info'); return false;
  }
  if (!v){ setHint(G.rules.homo ? '输入卡牌名，读音与上家相同即可接龙（杀戮尖塔1 / 2 均可）' : '输入卡牌名，需与上家共享汉字（杀戮尖塔1 / 2 均可）', 'info'); return false; }
  if (!NAMESET.has(v)){ setHint('✗ 这张卡不在本图鉴收录中', 'bad'); return false; }
  if (G.rules.ban && isBanned(v)){ setHint('✗ 当前规则禁用含「打击」「形态」的卡牌', 'bad'); return false; }
  if (G.rules.gen1 && GAMEOF.has(v)){ setHint('✗ 当前规则禁用一代（杀戮尖塔1）卡牌', 'bad'); return false; }
  if (G.used.has(v)){ setHint('✗ 这张牌本局已经出过了', 'bad'); return false; }
  if (G.last && !canChain(v, G.last, G.rules)){ setHint(G.rules.homo ? ('✗ 需与「'+esc(G.last)+'」读音相同') : ('✗ 需与「'+esc(G.last)+'」至少有一个相同汉字'), 'bad'); return false; }
  setHint(G.last ? ('✓ 可接「'+esc(G.last)+'」') : '✓ 出牌有效', 'ok'); return true;
}
function openAC(){
  const inp = $('#play-input'); const q = inp.value.trim().toLowerCase();
  const ac = $('#ac');
  if (!q || G.state.turn !== G.state.you){ closeAC(); return; }
  let pool = NAMES.filter(n => n.toLowerCase().includes(q));
  pool = pool.filter(n => !G.used.has(n) && (!G.rules.ban || !isBanned(n)) && (!G.rules.gen1 || !GAMEOF.has(n)) && (!G.last || canChain(n, G.last, G.rules)));
  pool = pool.slice(0, 8);
  if (!pool.length){ closeAC(); return; }
  G.acPool = pool;
  if (G.acIndex >= pool.length) G.acIndex = pool.length - 1;
  ac.innerHTML = pool.map((n,i) => {
    const t = TYPE_CN[ (APP.CARDS.find(c=>c.name===n)||{}).type ] || '';
    return `<div class="ac-item${i===G.acIndex?' kbd':''}" data-name="${esc(n)}"><span>${esc(n)}</span><span class="badge b-type">${esc(t)}</span></div>`;
  }).join('');
  [...ac.children].forEach(ch => ch.onclick = () => { inp.value = ch.dataset.name; closeAC(); validateInput(); inp.focus(); });
  ac.classList.add('on');
}
function closeAC(){ $('#ac').classList.remove('on'); G.acIndex=-1; }
function submit(){
  const inp = $('#play-input'); const v = inp.value.trim();
  if (!validateInput()) return;
  send({ type:'play', word:v });
  inp.value=''; closeAC(); validateInput();
}
function showOver(m){
  G.inGame = false; if (G.timerInt){ clearInterval(G.timerInt); G.timerInt=null; }
  const win = m.winner === G.me;
  const REASON = {
    timeout: win ? '对手在 30 秒内未能接上' : '你未在 30 秒内接上',
    left:    win ? '对手离开了房间' : '你离开了房间',
  };
  const reasonTxt = REASON[m.reason] || '对局结束';
  const badge = $('#over-badge');
  badge.textContent = win ? '胜 利' : (m.reason === 'left' ? '对手离开' : '失 败');
  badge.className = 'badge-big ' + (win ? 'win' : 'lose');
  $('#over-title').textContent = win ? '🎉 你赢了！' : (m.reason === 'left' ? '对手离开了' : '惜败');
  $('#over-sub').textContent = reasonTxt;
  if (m.state){
    $('#over-mine').textContent = m.state.log.filter(x => x.who === G.me).length;
    $('#over-opp').textContent = m.state.log.filter(x => x.who !== G.me).length;
    $('#over-used').textContent = m.state.usedCount;
  }
  switchPanel('p-over');
}
function bindPlay(){
  document.querySelectorAll('.mode-btn').forEach(b => b.onclick = () => {
    G.mode = b.dataset.mode;
    document.querySelectorAll('.mode-btn').forEach(x => x.classList.toggle('on', x===b));
    $('#join-field').style.display = (G.mode==='join') ? 'block' : 'none';
    $('#setup-hint').textContent = '';
  });
  $('#go-btn').onclick = () => {
    const nick = $('#nick').value.trim() || ('玩家'+Math.floor(Math.random()*900+100));
    setNick(nick); connect();
    const rules = { ban: !!$('#rule-ban').checked, homo: !!$('#rule-homo').checked, gen1: !!$('#rule-gen1').checked };
    if (!G.mode){ $('#setup-hint').textContent='请先选择一种对战模式'; return; }
    if (G.mode === 'join'){
      const code = $('#roomcode').value.trim().toUpperCase();
      if (!code){ $('#setup-hint').textContent='请输入要加入的房间码'; return; }
      send({ type:'join', code, name:nick, rules }); lobby('正在加入房间…','等待房主开始对战…', null); return;
    }
    if (G.mode === 'quick'){ send({ type:'quick', name:nick, rules }); lobby('正在匹配对手…','请稍候，系统正在为你寻找其他玩家', null); return; }
    if (G.mode === 'create'){ send({ type:'create', name:nick, rules }); lobby('已创建房间','把房间码发给朋友即可对战', null); return; }
  };
  $('#copy-code').onclick = () => { const t=$('#lobby-code-val').textContent; try{ navigator.clipboard.writeText(t); $('#copy-code').textContent='已复制'; setTimeout(()=>$('#copy-code').textContent='复制',1200);}catch(e){} };
  $('#cancel-btn').onclick = () => { send({ type:'leave' }); switchPanel('p-setup'); };
  $('#leave-btn').onclick = () => { send({ type:'leave' }); G.inGame=false; switchPanel('p-setup'); };
  $('#again-btn').onclick = () => { send({ type:'again' }); };
  $('#back-btn').onclick = () => { send({ type:'leave' }); switchPanel('p-setup'); };
  const inp = $('#play-input');
  inp.addEventListener('input', () => { G.acIndex=-1; validateInput(); openAC(); });
  inp.addEventListener('keydown', e => {
    const ac = $('#ac');
    if (e.key === 'Enter'){ e.preventDefault(); if (ac.classList.contains('on')){ const first=ac.querySelector('.ac-item'); if(first){ inp.value=first.dataset.name; closeAC(); validateInput(); return; } } submit(); }
    else if (e.key === 'Escape'){ closeAC(); }
  });
  $('#submit-btn').addEventListener('mousedown', closeAC);
  $('#submit-btn').onclick = submit;
  document.addEventListener('click', e => { if (!e.target.closest('#ac') && e.target !== inp) closeAC(); });
}
function showView(v){
  document.querySelectorAll('.tab').forEach(x => x.classList.toggle('on', x.dataset.view===v));
  document.querySelectorAll('.view').forEach(el => el.classList.toggle('active', el.id==='view-'+v));
  if (v === 'play') connect();
  if (v === 'quiz') qzInfo();
}
function bindNav(){
  const tabs = document.querySelectorAll('.tab');
  tabs.forEach(t => t.onclick = () => showView(t.dataset.view));
}

/* ================= 二选一答题 ================= */
const QZ = { cur:null, seen:new Set(), ids:[], deck:[], pos:0, idx:0, answered:0, agree:0, mino:0, busy:false };
function shuffle(arr){ const a = arr.slice(); for (let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
const qzEl = id => document.getElementById(id);
function qzHint(msg, kind){
  const h = qzEl('qz-hint'); if(!h) return;
  h.textContent = msg || '';
  h.className = 'hint' + (kind ? ' ' + kind : ' info');
}
function qzPanel(which){
  qzEl('qz-start').style.display = which==='start' ? '' : 'none';
  qzEl('qz-play').style.display  = which==='play'  ? '' : 'none';
  qzEl('qz-over').style.display  = which==='over'  ? '' : 'none';
  const ad = qzEl('qz-admin'); if (ad) ad.style.display = which==='admin' ? '' : 'none';
  if (which === 'admin'){ admRender(); if (ADM.token) admLoad(); }
}
async function qzInfo(){
  const el = qzEl('qz-stat'); if(!el) return;
  try{
    const r = await fetch('/api/quiz/info', {cache:'no-store'});
    const j = await r.json();
    const el2 = qzEl('qz-stat'); if (el2) el2.style.color = '';
    if (j.ok){ el.textContent = `题库 ${j.count} 题 · 累计 ${j.votes} 次选择`; QZ.ids = j.ids || []; }
    else el.textContent = '题库暂无数据';
  }catch(e){ el.textContent = '题库 — 题 · 累计 — 次选择'; }
}
// 整轮会话内持续去重：用一副洗好的牌堆依次发牌，抽完才重新洗牌
function qzReset(){
  QZ.seen.clear(); QZ.deck = []; QZ.pos = 0; QZ.idx = 0; QZ.answered = 0; QZ.agree = 0; QZ.mino = 0; QZ.cur = null;
}
// 「再来一轮」：只重置本轮得分统计，保留牌堆进度，继续去重不重复
function qzResetRound(){
  QZ.idx = 0; QZ.answered = 0; QZ.agree = 0; QZ.mino = 0; QZ.cur = null;
}
async function qzNext(){
  if (QZ.busy) return;
  QZ.busy = true; qzHint('加载中…', 'info');
  try{
    let url;
    if (QZ.ids.length){
      // 牌堆模式：依次取洗好的题目，抽完自动重洗（避免与上一张立刻重复）
      if (QZ.pos >= QZ.deck.length){
        const total = QZ.ids.length;
        QZ.deck = shuffle(QZ.ids);
        if (QZ.cur && QZ.deck[0] === QZ.cur.id) QZ.deck.push(QZ.deck.shift()); // 上一张不立刻重来
        QZ.pos = 0;
      }
      const id = QZ.deck[QZ.pos++];
      url = '/api/quiz/next?id=' + encodeURIComponent(id);
    } else {
      // 兜底：服务端随机 + ex 去重
      const ex = [...QZ.seen].slice(-300).join(',');
      url = '/api/quiz/next?ex=' + encodeURIComponent(ex);
    }
    const r = await fetch(url, {cache:'no-store'});
    const j = await r.json();
    if (!j.ok){
      qzPanel('start');
      const st = qzEl('qz-stat');
      if (st){ st.textContent = (j.msg || '题库是空的') + ' —— 在 quiz.txt 里加几行题目吧'; st.style.color = 'var(--r-curse)'; }
      return;
    }
    QZ.cur = j.q; QZ.seen.add(j.q.id); QZ.idx++;
    qzPanel('play');
    const total = j.total || QZ.ids.length || 0;
    qzEl('qz-prog').textContent = '第 ' + QZ.idx + ' / ' + total + ' 题（去重）';
    const tag = qzEl('qz-tag'); tag.textContent = j.q.tag || ''; tag.style.display = j.q.tag ? '' : 'none';
    qzEl('qz-q').textContent = j.q.q;
    qzEl('qz-a').querySelector('.qz-t').textContent = j.q.a;
    qzEl('qz-b').querySelector('.qz-t').textContent = j.q.b;
    [qzEl('qz-a'), qzEl('qz-b')].forEach(b => { b.classList.remove('picked','win','lose'); b.disabled = false; });
    qzEl('qz-result').style.display = 'none'; qzEl('qz-result').innerHTML = '';
    qzEl('qz-next').style.display = 'none'; qzEl('qz-skip').style.display = '';
    qzHint('选一个吧', 'info');
  }catch(e){ qzHint('加载失败：' + e.message, 'bad'); }
  QZ.busy = false;
}
async function qzChoose(i){
  if (!QZ.cur || QZ.busy) return;
  QZ.busy = true;
  const btns = [qzEl('qz-a'), qzEl('qz-b')];
  btns.forEach(b => b.disabled = true);
  btns[i].classList.add('picked');
  try{
    const r = await fetch('/api/quiz/vote', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ id: QZ.cur.id, choice: i }),
    });
    const j = await r.json();
    if (!j.ok){
      btns.forEach(b => b.disabled = false); btns[i].classList.remove('picked');
      qzHint(j.msg || '提交失败', 'bad'); QZ.busy = false; return;
    }
    QZ.answered++;
    const winIdx = j.more === 'tie' ? -1 : (j.more === 'a' ? 0 : 1);
    if (winIdx === -1) { /* 平局不计数 */ }
    else if (winIdx === j.mine) QZ.agree++;
    else QZ.mino++;
    qzRenderResult(j, i, winIdx);
    btns.forEach((b, k) => { if (k === winIdx) b.classList.add('win'); else if (winIdx !== -1) b.classList.add('lose'); });
    qzEl('qz-next').style.display = ''; qzEl('qz-skip').style.display = 'none';
    qzHint('', 'info');
  }catch(e){
    btns.forEach(b => b.disabled = false); btns[i].classList.remove('picked');
    qzHint('提交失败：' + e.message, 'bad');
  }
  QZ.busy = false;
}
function qzRenderResult(j, mine, winIdx){
  const labels = [QZ.cur.a, QZ.cur.b];
  const counts = [j.a, j.b], pcts = [j.pa, j.pb];
  let html = '';
  if (winIdx === -1){
    html += '<div class="qz-verdict tie">两边打平了，各 ' + j.pa + '%</div>';
  } else {
    const same = (winIdx === mine);
    html += '<div class="qz-verdict ' + (same ? 'same' : 'diff') + '">'
      + (same ? '你和多数人想的一样 🎉' : '你是少数派 🤔')
      + '　更多人（<b>' + pcts[winIdx] + '%</b>）选择了「' + esc(labels[winIdx]) + '」</div>';
  }
  for (let k = 0; k < 2; k++){
    const isWin = (winIdx === k), isMine = (mine === k);
    html += '<div class="qz-bar' + (isWin ? ' win' : '') + (isMine ? ' mine' : '') + '">'
      + '<div class="qz-bar-top"><span class="qz-bar-lbl">'
      + (isMine ? '<i class="qz-you">你的选择</i>' : '')
      + esc(labels[k]) + (isWin ? '<b class="qz-badge">多数</b>' : '')
      + '</span><span class="qz-bar-pct">' + pcts[k] + '%</span></div>'
      + '<div class="qz-bar-track"><div class="qz-bar-fill" style="width:' + Math.max(pcts[k], 1.5) + '%"></div></div>'
      + '<div class="qz-bar-sub">' + counts[k] + ' 人</div>'
      + '</div>';
  }
  html += '<div class="qz-total">共 ' + j.total + ' 人回答过这道题</div>';
  const box = qzEl('qz-result');
  box.innerHTML = html; box.style.display = '';
}
function qzFinish(){
  qzEl('qz-over-answered').textContent = QZ.answered;
  qzEl('qz-over-agree').textContent = QZ.agree;
  qzEl('qz-over-mino').textContent = QZ.mino;
  const rate = QZ.answered ? Math.round(QZ.agree / QZ.answered * 100) : 0;
  qzEl('qz-over-badge').textContent = QZ.answered === 0 ? '🎯' : (rate >= 70 ? '🐑' : (rate >= 40 ? '🎯' : '🐺'));
  qzEl('qz-over-title').textContent = QZ.answered === 0 ? '本轮结束' : (rate >= 70 ? '你很合群' : (rate >= 40 ? '你挺有自己的想法' : '你是天生的少数派'));
  qzEl('qz-over-sub').textContent = QZ.answered === 0 ? '这一轮还没答题' : ('本轮 ' + QZ.answered + ' 题中，有 ' + QZ.agree + ' 题你和多数人一致（' + rate + '%）');
  qzPanel('over');
  qzInfo();
}
/* ---------------- 题库后台（网页端维护 · 口令保护） ---------------- */
const ADM = { token: '' };
try { ADM.token = localStorage.getItem('qzAdmToken') || ''; } catch(_){}
function admEl(id){ return document.getElementById(id); }
function admMsg(msg, kind, elId){
  const el = admEl(elId || 'qz-adm-msg'); if(!el) return;
  el.textContent = msg || '';
  el.className = 'qz-adm-msg' + (kind ? (' ' + kind) : '');
}
// 本地解析题库文本，用于实时预览（规则与服务端保持一致）
function admParse(raw){
  const list = [], bad = [];
  String(raw || '').replace(/^\uFEFF/, '').split(/\r?\n/).forEach((line, i) => {
    const s = line.trim();
    if (!s || s.startsWith('#')) return;
    const p = s.split('|').map(x => x.trim());
    if (p.length < 3 || !p[0] || !p[1] || !p[2]) { bad.push(i + 1); return; }
    list.push({ q: p[0], a: p[1], b: p[2], tag: p[3] || '' });
  });
  return { list, bad };
}
function admPreview(){
  const r = admParse(admEl('qz-adm-raw').value);
  const el = admEl('qz-adm-preview');
  if (el){
    let h = '识别到 <b>' + r.list.length + '</b> 道题';
    if (r.bad.length) h += ' · <span class="warn">第 ' + r.bad.slice(0, 8).join('、') + ' 行格式不对，会被忽略</span>';
    el.innerHTML = h;
  }
  return r;
}
async function admApi(p, data){
  const r = await fetch(p, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(Object.assign({ token: ADM.token }, data || {})),
  });
  let j = {};
  try { j = await r.json(); } catch(_){ j = { ok:false, msg:'服务器返回异常' }; }
  if (j.needLogin){
    ADM.token = '';
    try { localStorage.removeItem('qzAdmToken'); } catch(_){}
    admRender();
  }
  return j;
}
function admRender(){
  const lg = admEl('qz-adm-login'), mn = admEl('qz-adm-main');
  if (!lg || !mn) return;
  const on = !!ADM.token;
  lg.style.display = on ? 'none' : '';
  mn.style.display = on ? '' : 'none';
  if (!on){ const p = admEl('qz-adm-pass'); if (p) p.value = ''; }
}
async function admLoad(){
  const j = await admApi('/api/quiz/admin/load');
  if (!j.ok){ admMsg(j.msg || '载入失败', 'bad'); return false; }
  admEl('qz-adm-raw').value = j.raw || '';
  admEl('qz-adm-stat').textContent = '题库 ' + j.count + ' 题 · 累计 ' + j.votes + ' 次选择';
  admPreview();
  return true;
}
async function admSave(){
  const raw = admEl('qz-adm-raw').value;
  if (!admParse(raw).list.length){ admMsg('没有识别到任何有效题目，未保存', 'bad'); return; }
  admMsg('保存中…');
  const j = await admApi('/api/quiz/admin/save', { raw });
  if (!j.ok){ admMsg(j.msg || '保存失败', 'bad'); return; }
  admEl('qz-adm-stat').textContent = '题库 ' + j.count + ' 题 · 累计 ' + j.votes + ' 次选择';
  admMsg(j.msg + '（已备份上一版为 quiz.txt.bak）', 'ok');
  qzInfo();
}
function bindQuizAdmin(){
  const link = admEl('qz-admin-link');
  if (!link) return;
  link.onclick = (e) => { e.preventDefault(); qzPanel('admin'); };
  admEl('qz-adm-back').onclick = () => { qzPanel('start'); qzInfo(); };

  admEl('qz-adm-login-btn').onclick = async () => {
    const p = admEl('qz-adm-pass').value;
    if (!p){ admMsg('请输入口令', 'bad', 'qz-adm-login-msg'); return; }
    admMsg('正在登录…', '', 'qz-adm-login-msg');
    let j = {};
    try {
      const r = await fetch('/api/quiz/admin/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pass: p }),
      });
      j = await r.json();
    } catch(_){ j = { ok:false, msg:'网络异常，登录失败' }; }
    if (!j.ok){ admMsg(j.msg || '登录失败', 'bad', 'qz-adm-login-msg'); return; }
    ADM.token = j.token;
    try { localStorage.setItem('qzAdmToken', j.token); } catch(_){}
    admMsg('', '', 'qz-adm-login-msg');
    admRender();
    admLoad();
  };

  admEl('qz-adm-reload').onclick = async () => { admMsg('载入中…'); if (await admLoad()) admMsg('已载入最新题库', 'ok'); };
  admEl('qz-adm-logout').onclick = () => {
    ADM.token = '';
    try { localStorage.removeItem('qzAdmToken'); } catch(_){}
    admRender();
  };
  admEl('qz-adm-raw').addEventListener('input', admPreview);
  admEl('qz-adm-save').onclick = () => admSave();
  admEl('qz-adm-copy').onclick = async () => {
    const t = admEl('qz-adm-raw');
    try { await navigator.clipboard.writeText(t.value); admMsg('已复制到剪贴板', 'ok'); }
    catch(_){ t.focus(); t.select(); admMsg('已全选，按 Ctrl+C 复制', 'ok'); }
  };

  // 快速追加：粘贴若干行 -> 追加到题库末尾并保存
  admEl('qz-adm-append').onclick = async () => {
    const add = admEl('qz-adm-add').value.replace(/^\s+|\s+$/g, '');
    if (!add){ admMsg('请先粘贴要追加的题目', 'bad'); return; }
    if (!admParse(add).list.length){ admMsg('没识别到有效题目，请检查格式：题目|选项A|选项B', 'bad'); return; }
    let raw = admEl('qz-adm-raw').value.replace(/\s+$/, '');
    admEl('qz-adm-raw').value = raw ? (raw + '\n' + add) : add;
    admEl('qz-adm-add').value = '';
    await admSave();
  };

  // 票数备份 / 恢复 / 清空
  admEl('qz-adm-vexport').onclick = async () => {
    const j = await admApi('/api/quiz/admin/votes', { op: 'export' });
    if (!j.ok){ admMsg(j.msg || '导出失败', 'bad'); return; }
    const box = admEl('qz-adm-vdata');
    box.style.display = ''; box.value = j.data || '{}';
    admMsg('已导出，请复制保存（共 ' + j.votes + ' 次选择）', 'ok');
  };
  admEl('qz-adm-vimport').onclick = async () => {
    const box = admEl('qz-adm-vdata');
    if (box.style.display === 'none'){
      box.style.display = '';
      admMsg('把之前导出的数据粘贴到下面，再点一次「导入票数」', '');
      return;
    }
    if (!confirm('导入会覆盖当前所有票数，确定继续？')) return;
    const j = await admApi('/api/quiz/admin/votes', { op: 'import', data: box.value });
    admMsg(j.msg || (j.ok ? '导入完成' : '导入失败'), j.ok ? 'ok' : 'bad');
    if (j.ok) admLoad();
  };
  admEl('qz-adm-vclear').onclick = async () => {
    if (!confirm('确定清空所有题目的投票记录？此操作不可恢复。')) return;
    const j = await admApi('/api/quiz/admin/votes', { op: 'clear' });
    admMsg(j.msg || (j.ok ? '已清空' : '清空失败'), j.ok ? 'ok' : 'bad');
    if (j.ok) admLoad();
  };

  // 修改口令
  admEl('qz-adm-pass-btn').onclick = async () => {
    const np = admEl('qz-adm-newpass').value;
    if (!np || np.length < 4){ admMsg('新口令至少 4 位', 'bad'); return; }
    if (!confirm('修改后当前登录会刷新为新口令，确定？')) return;
    const j = await admApi('/api/quiz/admin/pass', { pass: np });
    if (!j.ok){ admMsg(j.msg || '修改失败', 'bad'); return; }
    ADM.token = j.token;
    try { localStorage.setItem('qzAdmToken', j.token); } catch(_){}
    admEl('qz-adm-newpass').value = '';
    admMsg('口令已更新为「' + np + '」，请记牢', 'ok');
  };

  admRender();
  if (ADM.token) admLoad();   // 之前登录过就自动载入
}

function bindQuiz(){
  if (!qzEl('qz-start-btn')) return;
  qzEl('qz-start-btn').onclick = () => { qzReset(); qzNext(); };
  qzEl('qz-a').onclick = () => qzChoose(0);
  qzEl('qz-b').onclick = () => qzChoose(1);
  qzEl('qz-next').onclick = () => qzNext();
  qzEl('qz-skip').onclick = () => qzNext();
  qzEl('qz-end').onclick = () => qzFinish();
  qzEl('qz-again').onclick = () => { qzResetRound(); qzNext(); };
  qzEl('qz-back').onclick = () => { qzPanel('start'); qzInfo(); };
}

/* ---------------- boot / 游戏切换 ---------------- */
function resetFiltersUI(){
  state.q=''; state.chars.clear(); state.types.clear(); state.rares.clear(); state.costs.clear();
  state.extra.clear(); state.favOnly=false; state.sort='default'; state.ver='base';
  $('#q').value=''; $('#searchBox').classList.remove('has-val'); $('#sort').value='default';
  [...$('#verSeg').children].forEach(x=>x.classList.toggle('on', x===$('#verSeg').querySelector('[data-v="base"]')));
  document.querySelectorAll('.chip.on').forEach(x=>x.classList.remove('on'));
}

// 带重试的 fetch：扛住网关瞬时 502（网关可能缓存失败响应，故用 no-store + 重试）
async function fetchRetry(url, opts, tries, gap){
  tries = tries || 3; gap = gap || 1000;
  var lastErr;
  for(var i=0;i<tries;i++){
    try{
      var r = await fetch(url, opts);
      if(!r.ok) throw new Error('HTTP ' + r.status);
      return r;
    }catch(e){ lastErr = e; if(i<tries-1) await new Promise(function(res){ setTimeout(res, gap); }); }
  }
  throw lastErr;
}

async function loadGame(id){
  if(!GAMES[id]) id='sts2';
  CUR = id;
  const g = GAMES[id];
  let d;
  if (DATA[id]) d = DATA[id];
  else {
    try{
      const r = await fetchRetry(g.file, {cache:'no-store'});
      d = await r.json();
      if(!Array.isArray(d.cards)) throw new Error('bad data');
      DATA[id] = d;
    }catch(e){
      document.getElementById('grid').innerHTML = '<p style="color:var(--text-mute);text-align:center;padding:60px 0">数据加载失败：'+esc(e.message)+'<br><button class="btn-primary" style="margin-top:16px" onclick="location.reload()">点击重试</button></p>';
      return;
    }
  }
  APP.CARDS = d.cards; APP.meta = d.meta;
  applyGameMeta(d.meta);
  initBattleNames();
  // 标题/副标题/logo/页脚
  document.querySelector('.logo').textContent = g.logo;
  document.querySelector('h1').textContent = g.label + ' · 全卡牌图鉴';
  document.title = g.label + ' · 全卡牌图鉴';
  $('#fTotal').textContent = APP.CARDS.length;
  $('#subtitle').textContent = `${APP.CARDS.length} 张卡牌 · 全分类图鉴 · 含升级版对照`;
  const src = CUR==='sts2'
    ? '数据来源：<a href="https://sts2front.com/zh-cn/cards/" target="_blank" rel="noopener">STS2 中文 Wiki（sts2front）</a> · <a href="https://slaythespire.wiki.gg/" target="_blank" rel="noopener">Slay the Spire Wiki</a> · 卡图：<a href="https://sts2front.com/" target="_blank" rel="noopener">sts2front</a><br>'
    : '数据来源：<a href="https://sts.huijiwiki.com/wiki/%E6%A8%A1%E6%9D%BF:Navbox%E5%8D%A1%E7%89%8C" target="_blank" rel="noopener">灰机wiki 杀戮尖塔 卡牌总览</a> · 卡图：<a href="https://sts.huijiwiki.com/" target="_blank" rel="noopener">sts.huijiwiki.com</a><br>';
  const fsEl = document.querySelector('#footer-src'); if(fsEl) fsEl.innerHTML = src;
  // 返回卡牌图鉴视图
  bindNav();   // 幂等（onclick 覆盖）
  showView('cards');
  resetFiltersUI();
  try{ buildFilters(); apply(); }
  catch(err){ console.error(err); results = APP.CARDS.slice(); state.shown=0; $('#grid').innerHTML=''; while(state.shown<APP.CARDS.length) renderMore(); }
  handleHash();
}

function bindGameSwitch(){
  document.querySelectorAll('.game-btn').forEach(b => b.onclick = () => {
    if(b.dataset.game === CUR) return;
    document.querySelectorAll('.game-btn').forEach(x => x.classList.toggle('on', x===b));
    loadGame(b.dataset.game);
  });
}

async function boot(){
  bindNav();
  bindPlay();
  bindGameSwitch();
  bindQuiz();
  bindQuizAdmin();
  qzInfo();
  const nick = getNick(); if (nick) $('#nick').value = nick;
  // 图鉴数据由打包脚本 data.js（window.STS_DATA）一次性注入，避免并行拉两个大 JSON 被网关 502 拖垮
  try {
    if (!window.STS_DATA) {
      // data.js 的 <script> 标签若被网关 502 掐断，这里主动重试拉取并就地执行，确保自愈不依赖首页脚本
      const r = await fetchRetry('/data.js', {cache:'no-store'});
      const txt = await r.text();
      (new Function(txt))();
    }
    if (window.STS_DATA) {
      DATA.sts2 = window.STS_DATA.sts2;
      DATA.sts1 = window.STS_DATA.sts1;
    } else {
      console.warn('window.STS_DATA 仍缺失（data.js 可能 502）');
    }
  } catch(e){ console.warn('图鉴数据加载失败：', e.message); }
  await loadGame('sts2');
  if (DATA.sts2 && DATA.sts2.cards) window.__APP_OK = true;
}
boot();
