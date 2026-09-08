/* ===========================================================
   杀戮尖塔 2 · 卡牌图鉴 + 卡名接龙对战 后端
   - 静态文件服务（index.html / styles.css / app.js / cards.json）
   - 同端口 WebSocket 对战服务器（接龙规则）
   部署：监听 process.env.PORT，绑定 0.0.0.0
   =========================================================== */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const { WebSocketServer } = require('ws');

// 防崩溃：单条异常（如畸形 WebSocket 消息、未捕获的 Promise 拒绝）不应拖垮整个服务进程
process.on('uncaughtException', (e) => { console.error('[server] uncaughtException:', (e && e.stack) || e); });
process.on('unhandledRejection', (e) => { console.error('[server] unhandledRejection:', (e && e.stack) || e); });

const ROOT = __dirname;
const PORT = process.env.PORT || 3000;
const TURN_MS = 30000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
};

/* ---------- 加载卡牌名（用于服务端权威校验） ---------- */
const { pinyin } = require('pinyin-pro');
let NAMES = [];
let NAMESET = new Set();
let HAN = new Map();
let PIN = new Map();
const GAMEOF = new Map();   // 卡名 -> 'sts1'（仅一代 StS1 拥有的卡，用于「禁用一代卡牌」规则）
function banReason(v, rules) {
  if (rules && rules.ban && (/打击/.test(v) || /形态/.test(v))) return '当前规则禁用含「打击」「形态」的卡牌';
  if (rules && rules.gen1 && GAMEOF.has(v)) return '当前规则禁用一代（杀戮尖塔1）卡牌';
  return null;
}
function syllablesOf(n) {
  const s = new Set();
  for (const ch of n) {
    const arr = pinyin(ch, { toneType: 'none', type: 'array' });
    const p = arr && arr[0];
    if (p) s.add(p.toLowerCase());
  }
  return s;
}
const loadNames = (file) => {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
    const list = Array.isArray(data) ? data : (data.cards || []);
    return [...new Set(list.map(c => c.name).filter(Boolean))];
  } catch (_) { return []; }
};
try {
  // 图鉴含两款游戏：杀戮尖塔2 (cards.json) + 杀戮尖塔1 (cards1.json)，接龙均收录
  const s2 = loadNames('cards.json');
  const s1 = loadNames('cards1.json');
  NAMES = [...new Set([...s2, ...s1])];
  NAMESET = new Set(NAMES);
  NAMES.forEach(n => {
    HAN.set(n, new Set([...n].filter(c => /[一-鿿]/.test(c))));
    PIN.set(n, syllablesOf(n));
  });
  // 仅一代（StS1）独有的卡标记为 sts1（与二代重名的如「打击」不计入，禁用一代规则放行）
  s1.forEach(n => { if (n && !s2.includes(n)) GAMEOF.set(n, 'sts1'); });
  console.log('[cards] 加载卡牌名', NAMES.length, '张（StS2 + StS1）；其中一代独有', GAMEOF.size, '张');
} catch (e) {
  console.error('[cards] 读取卡牌数据失败：', e.message);
}
const shareChar = (a, b) => {
  const ha = HAN.get(a), hb = HAN.get(b);
  if (!ha || !hb) return false;
  for (const c of ha) if (hb.has(c)) return true;
  return false;
};
const shareSyllable = (a, b) => {
  const ha = PIN.get(a), hb = PIN.get(b);
  if (!ha || !hb) return false;
  for (const p of ha) if (hb.has(p)) return true;
  return false;
};
// 接龙判定：rules.homo 开启时读音相同即可（仍兼容完全相同汉字），否则需相同汉字
const canChain = (a, b, rules) => {
  if (rules && rules.homo) return shareSyllable(a, b) || shareChar(a, b);
  return shareChar(a, b);
};

/* ===========================================================
   二选一答题模块
   - 题库：quiz.txt（一行一题：题目|选项A|选项B|标签(可选)，# 开头为注释）
   - 投票：quiz-votes.json（服务端持久化；写入失败时降级为内存计数）
   =========================================================== */
const QUIZ_FILE = path.join(ROOT, 'quiz.txt');
const VOTES_FILE = path.join(ROOT, 'quiz-votes.json');
let QUIZ = { mtime: -1, list: [] };
let VOTES = {};
let votesDirty = false, votesTimer = null;

// 由「题目|选项A|选项B」生成稳定短 id：改题目会重置该题票数，重排文件行不会
function qidOf(text) {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
function loadQuiz() {
  let mt = -1;
  try { mt = fs.statSync(QUIZ_FILE).mtimeMs; } catch (_) { mt = -1; }
  if (mt === QUIZ.mtime) return QUIZ.list;   // 未改动，直接用缓存
  const list = [];
  if (mt >= 0) {
    try {
      const raw = fs.readFileSync(QUIZ_FILE, 'utf8').replace(/^\uFEFF/, '');
      raw.split(/\r?\n/).forEach(line => {
        const s = line.trim();
        if (!s || s.startsWith('#')) return;
        const p = s.split('|').map(x => x.trim());
        if (p.length < 3) return;
        const q = p[0], a = p[1], b = p[2];
        if (!q || !a || !b) return;
        list.push({ id: qidOf(q + '|' + a + '|' + b), q, a, b, tag: p[3] || '' });
      });
    } catch (_) { }
  }
  QUIZ = { mtime: mt, list };
  console.log('[quiz] 载入题目', list.length, '道');
  return list;
}
function loadVotes() {
  try { VOTES = JSON.parse(fs.readFileSync(VOTES_FILE, 'utf8')) || {}; }
  catch (_) { VOTES = {}; }
  const n = Object.keys(VOTES).length;
  console.log('[quiz] 载入投票数据：', n, '道题已有记录');
}
function saveVotes() {
  try {
    fs.writeFileSync(VOTES_FILE + '.tmp', JSON.stringify(VOTES));
    fs.renameSync(VOTES_FILE + '.tmp', VOTES_FILE);
  } catch (e) { console.error('[quiz] 投票写入失败（本次仅记在内存）：', e.message); }
}
function markVotes() {
  votesDirty = true;
  if (votesTimer) return;
  votesTimer = setTimeout(() => { votesTimer = null; if (votesDirty) { votesDirty = false; saveVotes(); } }, 1500);
}
function totalVotes() {
  let t = 0;
  for (const k in VOTES) { const v = VOTES[k]; t += (v[0] || 0) + (v[1] || 0); }
  return t;
}
loadQuiz();
loadVotes();

/* -----------------------------------------------------------
   题库后台（网页端维护，口令保护）
   - 口令来源优先级：环境变量 QUIZ_ADMIN_PASS > quiz-admin.json > 默认
   - 登录凭据：HMAC(exp, 口令) 自签名 token，无需在服务端存会话
   ----------------------------------------------------------- */
const ADMIN_FILE = path.join(ROOT, 'quiz-admin.json');
const ADMIN_ENV = process.env.QUIZ_ADMIN_PASS || '';
const DEFAULT_ADMIN_PASS = 'sts2admin';
const TOKEN_TTL = 8 * 60 * 60 * 1000;      // 登录有效期 8 小时
let ADMIN_PASS = ADMIN_ENV || DEFAULT_ADMIN_PASS;
try {
  const j = JSON.parse(fs.readFileSync(ADMIN_FILE, 'utf8'));
  if (j && typeof j.password === 'string' && j.password) ADMIN_PASS = j.password;
} catch (_) { }
if (ADMIN_ENV) ADMIN_PASS = ADMIN_ENV;     // 环境变量优先级最高
console.log('[quiz-admin] 口令来源：', ADMIN_ENV ? '环境变量 QUIZ_ADMIN_PASS' : 'quiz-admin.json / 默认值');

function adminToken(exp) {
  return exp + '.' + crypto.createHmac('sha256', ADMIN_PASS).update(String(exp)).digest('hex');
}
function adminCheck(tok) {
  if (typeof tok !== 'string') return false;
  const i = tok.indexOf('.');
  if (i < 0) return false;
  const exp = Number(tok.slice(0, i)), sig = tok.slice(i + 1);
  if (!exp || !sig || Date.now() > exp) return false;
  const want = crypto.createHmac('sha256', ADMIN_PASS).update(String(exp)).digest('hex');
  try { return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want)); }
  catch (_) { return false; }
}
// 把题库文本解析成题目列表（后台保存前校验用）
function parseQuizText(raw) {
  const list = [], bad = [];
  String(raw || '').replace(/^\uFEFF/, '').split(/\r?\n/).forEach((line, i) => {
    const s = line.trim();
    if (!s || s.startsWith('#')) return;
    const p = s.split('|').map(x => x.trim());
    if (p.length < 3 || !p[0] || !p[1] || !p[2]) { bad.push({ line: i + 1, text: s.slice(0, 50) }); return; }
    list.push({ q: p[0], a: p[1], b: p[2], tag: p[3] || '' });
  });
  return { list, bad };
}

function sendJSON(res, obj, code) {
  const s = JSON.stringify(obj);
  const buf = Buffer.from(s);
  const ae = (res.req && res.req.headers && res.req.headers['accept-encoding']) || '';
  if (/gzip/.test(ae)) {
    const gz = zlib.gzipSync(buf);
    res.writeHead(code || 200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Encoding': 'gzip', 'Content-Length': gz.length, 'Connection': 'close' });
    res.end(gz);
  } else {
    res.writeHead(code || 200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': buf.length, 'Connection': 'close' });
    res.end(buf);
  }
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let b = '';
    req.on('data', d => { b += d; if (b.length > 1000000) req.destroy(); });   // 上限 1MB（题库文本足够）
    req.on('end', () => resolve(b));
    req.on('error', reject);
  });
}
// 返回 false 表示不是已注册的 API（交给静态服务处理）
async function handleApi(req, res, urlPath) {
  if (urlPath === '/api/quiz/info') {
    const list = loadQuiz();
    return sendJSON(res, { ok: true, count: list.length, votes: totalVotes(), ids: list.map(q => q.id) });
  }
  if (urlPath === '/api/quiz/next') {
    const list = loadQuiz();
    if (!list.length) return sendJSON(res, { ok: false, msg: '题库还是空的' });
    // 支持按 id 精确取题（前端用牌堆去重时走这条）
    let wantId = null;
    try { const u = new URL(req.url, 'http://localhost'); wantId = u.searchParams.get('id'); } catch (_) { }
    if (wantId) {
      const q = list.find(x => x.id === wantId);
      if (!q) return sendJSON(res, { ok: false, msg: '这道题已不在题库中' });
      return sendJSON(res, { ok: true, q: { id: q.id, q: q.q, a: q.a, b: q.b, tag: q.tag }, left: 0, total: list.length });
    }
    let ex = new Set();
    try {
      const u = new URL(req.url, 'http://localhost');
      ex = new Set((u.searchParams.get('ex') || '').split(',').filter(Boolean));
    } catch (_) { }
    let pool = list.filter(q => !ex.has(q.id));
    if (!pool.length) pool = list;                    // 全答过了就重新循环
    const q = pool[Math.floor(Math.random() * pool.length)];
    return sendJSON(res, { ok: true, q: { id: q.id, q: q.q, a: q.a, b: q.b, tag: q.tag }, left: pool.length, total: list.length });
  }
  if (urlPath === '/api/quiz/vote') {
    if (req.method !== 'POST') return sendJSON(res, { ok: false, msg: '需要用 POST 提交' }, 405);
    let body = {};
    try { body = JSON.parse((await readBody(req)) || '{}'); } catch (_) { }
    const list = loadQuiz();
    const q = list.find(x => x.id === body.id);
    if (!q) return sendJSON(res, { ok: false, msg: '这道题已不在题库中（题库可能被改过）' }, 404);
    const choice = (body.choice === 1) ? 1 : 0;
    const v = VOTES[q.id] || [0, 0];
    v[choice] = (v[choice] || 0) + 1;
    VOTES[q.id] = v;
    markVotes();
    const total = v[0] + v[1];
    const pa = total ? Math.round(v[0] / total * 1000) / 10 : 0;
    const pb = total ? Math.round(v[1] / total * 1000) / 10 : 0;
    const more = v[0] === v[1] ? 'tie' : (v[0] > v[1] ? 'a' : 'b');
    return sendJSON(res, { ok: true, id: q.id, mine: choice, a: v[0], b: v[1], total, pa, pb, more });
  }

  /* ---------- 题库后台 API（需口令） ---------- */
  if (urlPath === '/api/quiz/admin/login') {
    if (req.method !== 'POST') return sendJSON(res, { ok: false, msg: '需要用 POST 提交' }, 405);
    let body = {};
    try { body = JSON.parse((await readBody(req)) || '{}'); } catch (_) { }
    if (String(body.pass || '') !== ADMIN_PASS) return sendJSON(res, { ok: false, msg: '口令不对，再试一次' }, 401);
    const exp = Date.now() + TOKEN_TTL;
    return sendJSON(res, { ok: true, token: adminToken(exp), exp });
  }
  if (urlPath.startsWith('/api/quiz/admin/')) {
    if (req.method !== 'POST') return sendJSON(res, { ok: false, msg: '需要用 POST 提交' }, 405);
    let body = {};
    try { body = JSON.parse((await readBody(req)) || '{}'); } catch (_) { }
    if (!adminCheck(body.token)) return sendJSON(res, { ok: false, msg: '登录已失效，请重新登录', needLogin: true }, 401);

    // 读取题库原文
    if (urlPath === '/api/quiz/admin/load') {
      let raw = '', mtime = 0;
      try { raw = fs.readFileSync(QUIZ_FILE, 'utf8'); } catch (_) { }
      try { mtime = fs.statSync(QUIZ_FILE).mtimeMs; } catch (_) { }
      const { list, bad } = parseQuizText(raw);
      return sendJSON(res, { ok: true, raw, count: list.length, bad, votes: totalVotes(), mtime });
    }

    // 保存题库（覆盖写；先备份再原子替换）
    if (urlPath === '/api/quiz/admin/save') {
      const raw = String(body.raw || '');
      const { list, bad } = parseQuizText(raw);
      if (!list.length) return sendJSON(res, { ok: false, msg: '没有识别到任何有效题目，已取消保存' }, 400);
      try {
        try { fs.copyFileSync(QUIZ_FILE, QUIZ_FILE + '.bak'); } catch (_) { }
        fs.writeFileSync(QUIZ_FILE + '.tmp', raw, 'utf8');
        fs.renameSync(QUIZ_FILE + '.tmp', QUIZ_FILE);
      } catch (e) { return sendJSON(res, { ok: false, msg: '写入失败：' + e.message }, 500); }
      QUIZ.mtime = -1;                      // 让下次请求重新读文件
      const after = loadQuiz();
      return sendJSON(res, { ok: true, count: after.length, bad, votes: totalVotes(), msg: '已保存，当前共 ' + after.length + ' 题' });
    }

    // 修改口令
    if (urlPath === '/api/quiz/admin/pass') {
      const np = String(body.pass || '');
      if (np.length < 4) return sendJSON(res, { ok: false, msg: '新口令至少 4 位' }, 400);
      try { fs.writeFileSync(ADMIN_FILE, JSON.stringify({ password: np }, null, 2), 'utf8'); }
      catch (e) { return sendJSON(res, { ok: false, msg: '写入失败：' + e.message }, 500); }
      ADMIN_PASS = np;                      // 旧 token 立即失效
      const exp = Date.now() + TOKEN_TTL;
      return sendJSON(res, { ok: true, msg: '口令已更新（下次登录用新口令）', token: adminToken(exp), exp });
    }

    // 票数：导出 / 导入 / 清空
    if (urlPath === '/api/quiz/admin/votes') {
      if (body.op === 'clear') {
        VOTES = {}; saveVotes();
        return sendJSON(res, { ok: true, msg: '票数已清空', votes: 0 });
      }
      if (body.op === 'import') {
        let obj = null;
        try { obj = JSON.parse(String(body.data || '')); } catch (_) { }
        if (!obj || typeof obj !== 'object') return sendJSON(res, { ok: false, msg: '粘贴的内容不是合法的 JSON' }, 400);
        let n = 0;
        for (const k in obj) {
          const v = obj[k];
          if (!Array.isArray(v) || v.length < 2) continue;
          VOTES[k] = [Number(v[0]) || 0, Number(v[1]) || 0];
          n++;
        }
        saveVotes();
        return sendJSON(res, { ok: true, msg: '已导入 ' + n + ' 道题的票数', votes: totalVotes() });
      }
      return sendJSON(res, { ok: true, data: JSON.stringify(VOTES), votes: totalVotes() });
    }

    return sendJSON(res, { ok: false, msg: '未知的后台接口' }, 404);
  }
  return false;
}

/* ---------- 静态文件服务 ---------- */
const server = http.createServer(async (req, res) => {
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath.startsWith('/api/')) {
    const handled = await handleApi(req, res, urlPath);
    if (handled !== false) return;
  }
  if (urlPath === '/' || urlPath === '') urlPath = '/index.html';
  const filePath = path.normalize(path.join(ROOT, urlPath));
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end('Forbidden'); return; }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Not found'); return; }
    const ext = path.extname(filePath).toLowerCase();
    const ae = (req.headers && req.headers['accept-encoding']) || '';
    if (/gzip/.test(ae) && Buffer.isBuffer(data)) {
      const gz = zlib.gzipSync(data);
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Content-Encoding': 'gzip', 'Content-Length': gz.length, 'Connection': 'close' });
      res.end(gz);
    } else {
      const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Connection': 'close' };
      if (Buffer.isBuffer(data)) headers['Content-Length'] = data.length;
      res.writeHead(200, headers);
      res.end(data);
    }
  });
});

/* ---------- 对战房间管理 ---------- */
const wss = new WebSocketServer({ server });
const rooms = new Map();         // code -> room
const waitingQuick = [];          // 快速匹配等待队列（ws）

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let i = 0; i < 20; i++) {
    let s = '';
    for (let j = 0; j < 4; j++) s += chars[Math.floor(Math.random() * chars.length)];
    if (!rooms.has(s)) return s;
  }
  return 'RM' + Date.now().toString(36).slice(-4).toUpperCase();
}
function sendObj(ws, obj) {
  if (ws && ws.readyState === 1) { try { ws.send(JSON.stringify(obj)); } catch (_) {} }
}
function sendErr(ws, msg) { sendObj(ws, { type: 'error', msg }); }

function stateFor(room, slot) {
  return {
    you: slot,
    turn: room.turn,
    players: room.players.map(p => ({ name: p ? p.name : '—' })),
    last: room.last,
    log: room.log.map(e => ({ who: e.who, word: e.word })),
    deadline: room.deadline,
    usedCount: room.used.size,
    rules: room.rules,
  };
}
function broadcast(room, type) {
  room.players.forEach((p, i) => {
    if (p && p.ws) sendObj(p.ws, { type, state: stateFor(room, i) });
  });
}
function armTimer(room) {
  if (room.timer) clearTimeout(room.timer);
  room.timer = setTimeout(() => {
    if (!room.started || room.over) return;
    const loser = room.turn;
    finish(room, 1 - loser, 'timeout');
  }, Math.max(0, room.deadline - Date.now()));
}
function startGame(room) {
  room.started = true;
  room.over = false;
  room.turn = 0;
  room.last = null;
  room.log = [];
  room.used = new Set();
  room.deadline = Date.now() + TURN_MS;
  armTimer(room);
  broadcast(room, 'start');
}
function finish(room, winner, reason) {
  if (room.timer) clearTimeout(room.timer);
  room.timer = null;
  room.started = false;
  room.over = true;
  room.players.forEach((p, i) => {
    if (p && p.ws) sendObj(p.ws, { type: 'over', winner, reason, state: stateFor(room, i) });
  });
}
function removePlayer(room, ws) {
  const slot = ws.meta && ws.meta.slot;
  if (slot != null && room.players[slot]) room.players[slot] = null;
}
function deleteRoom(room) {
  if (room.timer) clearTimeout(room.timer);
  rooms.delete(room.code);
}

function handleDisconnect(ws) {
  if (ws._quick) { const i = waitingQuick.indexOf(ws); if (i >= 0) waitingQuick.splice(i, 1); }
  const room = ws.meta && ws.meta.room;
  if (!room) return;
  if (room.started && !room.over) {
    const slot = ws.meta.slot;
    finish(room, 1 - slot, 'left');
  } else if (!room.started) {
    removePlayer(room, ws);
    if (!room.players.some(Boolean)) deleteRoom(room);
  }
}

wss.on('connection', (ws) => {
  ws.meta = null;
  ws._quick = false;
  ws.pname = '玩家';

  ws.on('message', (raw) => {
    try {
    let m;
    try { m = JSON.parse(raw.toString()); } catch (_) { return; }
    if (!m || typeof m.type !== 'string') return;

    switch (m.type) {
      case 'create': {
        ws.pname = (m.name && m.name.trim()) || ws.pname;
        const code = genCode();
        const room = {
          code, mode: 'create',
          players: [{ ws, name: ws.pname, alive: true }, null],
          started: false, over: false, turn: 0, last: null, log: [], used: new Set(), deadline: 0, timer: null,
          rules: m.rules || { ban: false, homo: false, gen1: false },
        };
        rooms.set(code, room);
        ws.meta = { room, slot: 0 };
        sendObj(ws, { type: 'created', code });
        break;
      }
      case 'join': {
        ws.pname = (m.name && m.name.trim()) || ws.pname;
        const code = (m.code || '').trim().toUpperCase();
        const room = rooms.get(code);
        if (!room) { sendErr(ws, '房间不存在或已失效'); return; }
        if (room.started) { sendErr(ws, '对局已经开始'); return; }
        if (room.players[1]) { sendErr(ws, '房间已满'); return; }
        room.players[1] = { ws, name: ws.pname, alive: true };
        ws.meta = { room, slot: 1 };
        sendObj(ws, { type: 'joined' });
        startGame(room);
        break;
      }
      case 'quick': {
        ws.pname = (m.name && m.name.trim()) || ws.pname;
        if (waitingQuick.length) {
          const other = waitingQuick.shift();
          other.pname = other.pname || '玩家';
          const code = genCode();
          const room = {
            code, mode: 'quick',
            players: [
              { ws: other, name: other.pname, alive: true },
              { ws, name: ws.pname, alive: true },
            ],
            started: false, over: false, turn: 0, last: null, log: [], used: new Set(), deadline: 0, timer: null,
            rules: other._rules || { ban: false, homo: false, gen1: false },
          };
          rooms.set(code, room);
          other.meta = { room, slot: 0 };
          ws.meta = { room, slot: 1 };
          sendObj(other, { type: 'joined' });
          sendObj(ws, { type: 'joined' });
          startGame(room);
        } else {
          ws._quick = true;
          ws._rules = m.rules || { ban: false, homo: false, gen1: false };
          waitingQuick.push(ws);
          sendObj(ws, { type: 'waiting' });
        }
        break;
      }
      case 'play': {
        const room = ws.meta && ws.meta.room;
        if (!room || !room.started) { sendErr(ws, '对局尚未开始'); return; }
        const slot = ws.meta.slot;
        if (room.turn !== slot) { sendErr(ws, '还没轮到你出牌'); return; }
        const v = (m.word || '').trim();
        if (!NAMESET.has(v)) { sendErr(ws, '这张卡不在本图鉴收录中'); return; }
        const br = banReason(v, room.rules);
        if (br) { sendErr(ws, br); return; }
        if (room.used.has(v)) { sendErr(ws, '这张牌本局已经出过了'); return; }
        if (room.last && !canChain(v, room.last, room.rules)) { sendErr(ws, room.rules.homo ? ('需与「' + room.last + '」读音相同') : ('需与「' + room.last + '」至少有一个相同汉字')); return; }
        room.log.push({ who: slot, word: v });
        room.used.add(v);
        room.last = v;
        room.turn = 1 - slot;
        room.deadline = Date.now() + TURN_MS;
        armTimer(room);
        broadcast(room, 'update');
        break;
      }
      case 'leave': {
        const room = ws.meta && ws.meta.room;
        if (!room) return;
        if (room.started && !room.over) {
          const slot = ws.meta.slot;
          finish(room, 1 - slot, 'left');
          deleteRoom(room);
        } else {
          removePlayer(room, ws);
          if (!room.players.some(Boolean)) deleteRoom(room);
          else broadcast(room, 'update'); // 通知剩余玩家（极少见）
        }
        break;
      }
      case 'again': {
        const room = ws.meta && ws.meta.room;
        if (!room) return;
        if (room.over && room.players.every(Boolean)) startGame(room);
        else sendErr(ws, '无法重新开始');
        break;
      }
      default:
        break;
      }
    } catch (e) {
      console.error('[ws] message handler error:', (e && e.stack) || e);
    }
  });

  ws.on('close', () => handleDisconnect(ws));
  ws.on('error', () => {});
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('[server] 监听 http://0.0.0.0:' + PORT + '  (静态 + WebSocket 对战)');
});
