'use strict';
/* ===========================================================
   数据抽象层（双模式）
   - 设了 process.env.DATABASE_URL  ->  Neon Postgres 持久化
   - 未设                          ->  原文件存储（quiz.txt / quiz-votes.json / quiz-admin.json）
   这样本地与现有 WorkBuddy 链接零风险；只有 Koyeb 部署设了连接串才用数据库，
   从而部署容器不再触碰服务端数据（票数/题库/口令都落在 Neon，重启不丢）。
   =========================================================== */
const fs = require('fs');
const path = require('path');
const ROOT = __dirname;
const QUIZ_FILE = path.join(ROOT, 'quiz.txt');
const VOTES_FILE = path.join(ROOT, 'quiz-votes.json');
const ADMIN_FILE = path.join(ROOT, 'quiz-admin.json');

/* 连接串三个来源，按优先级：
   1) 环境变量 DATABASE_URL（Koyeb 等平台注入）
   2) 项目根目录 db-config.json  { "DATABASE_URL": "postgresql://..." }
      —— 给不支持环境变量的托管（比如 WorkBuddy 发布）用；
      该文件已加进 .gitignore，不会提交到公开仓库
   3) 都没有 -> 文件模式
*/
function readUrlFromConfigFile() {
  try {
    const p = path.join(ROOT, 'db-config.json');
    if (!fs.existsSync(p)) return '';
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    return (j && j.DATABASE_URL) || '';
  } catch (e) {
    console.error('[db] 读取 db-config.json 失败：', e.message);
    return '';
  }
}
// 兜底来源：db-config.js（module.exports.DATABASE_URL）。
// 原因：部署会把根目录 .json 清零，而 .js 文件部署可靠；用 .js 兜底可防凭证被清零导致永久 db:false。
function readUrlFromJsConfig() {
  try {
    const p = path.join(ROOT, 'db-config.js');
    if (!fs.existsSync(p)) return '';
    const m = require(p);
    return (m && m.DATABASE_URL) || '';
  } catch (e) {
    console.error('[db] 读取 db-config.js 失败：', e.message);
    return '';
  }
}

const DATABASE_URL = process.env.DATABASE_URL || readUrlFromConfigFile() || readUrlFromJsConfig();

let pool = null;
let usingDb = false;

function qidOf(text) {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
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

/* ---------------- DB 模式 ---------------- */
async function createTables() {
  await pool.query(`CREATE TABLE IF NOT EXISTS quiz_questions (
    id TEXT PRIMARY KEY, q TEXT NOT NULL, a TEXT NOT NULL, b TEXT NOT NULL, tag TEXT NOT NULL DEFAULT '', ord INT NOT NULL DEFAULT 0)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS quiz_votes (
    id TEXT PRIMARY KEY, a INT NOT NULL DEFAULT 0, b INT NOT NULL DEFAULT 0)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS quiz_meta (
    k TEXT PRIMARY KEY, v TEXT NOT NULL)`);
}
async function seedIfEmpty() {
  try {
    const r = await pool.query('SELECT COUNT(*)::int AS n FROM quiz_questions');
    if (r.rows[0].n > 0) return;
  } catch (_) { return; }
  let raw = '';
  try { raw = fs.readFileSync(QUIZ_FILE, 'utf8'); } catch (_) {}
  const { list } = parseQuizText(raw);
  if (!list.length) return;
  await saveQuizRows(list);
  console.log('[db] 已从 quiz.txt 种子导入', list.length, '道题');
}
async function loadQuizDb() {
  const r = await pool.query('SELECT id,q,a,b,tag FROM quiz_questions ORDER BY ord, id');
  return r.rows.map(x => ({ id: x.id, q: x.q, a: x.a, b: x.b, tag: x.tag }));
}
async function loadQuizRawDb() {
  const r = await pool.query('SELECT q,a,b,tag FROM quiz_questions ORDER BY ord, id');
  return r.rows.map(x => [x.q, x.a, x.b, x.tag].filter((v, i) => i < 3 || v).join('|')).join('\n');
}
async function saveQuizRows(list) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM quiz_questions');
    for (let i = 0; i < list.length; i++) {
      const it = list[i];
      await client.query(
        'INSERT INTO quiz_questions (id,q,a,b,tag,ord) VALUES ($1,$2,$3,$4,$5,$6) ' +
        'ON CONFLICT (id) DO UPDATE SET q=EXCLUDED.q,a=EXCLUDED.a,b=EXCLUDED.b,tag=EXCLUDED.tag,ord=EXCLUDED.ord',
        [qidOf(it.q + '|' + it.a + '|' + it.b), it.q, it.a, it.b, it.tag || '', i]
      );
    }
    await client.query('COMMIT');
  } catch (e) { try { await client.query('ROLLBACK'); } catch (_) {} throw e; }
  finally { client.release(); }
}
async function saveQuizRawDb(raw) {
  const { list, bad } = parseQuizText(raw);
  if (!list.length) return { ok: false, count: 0, bad };
  await saveQuizRows(list);
  return { ok: true, count: list.length, bad };
}
async function loadVotesDb() {
  const r = await pool.query('SELECT id,a,b FROM quiz_votes');
  const o = {};
  r.rows.forEach(x => { o[x.id] = [Number(x.a) || 0, Number(x.b) || 0]; });
  return o;
}
/* 全量同步：obj 里没有的 id 会被删掉，避免题目删除后票数残留 */
async function persistVotesDb(obj) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ids = Object.keys(obj).filter(k => Array.isArray(obj[k]) && obj[k].length >= 2);
    if (ids.length) {
      // 删除已不在内存里的旧 id（题目被删除 / 题目文本被改动导致 id 变化）
      const ph = ids.map((_, i) => '$' + (i + 1)).join(',');
      await client.query('DELETE FROM quiz_votes WHERE id NOT IN (' + ph + ')', ids);
      for (const k of ids) {
        const v = obj[k];
        await client.query(
          'INSERT INTO quiz_votes (id,a,b) VALUES ($1,$2,$3) ON CONFLICT (id) DO UPDATE SET a=EXCLUDED.a,b=EXCLUDED.b',
          [k, Number(v[0]) || 0, Number(v[1]) || 0]);
      }
    } else {
      await client.query('DELETE FROM quiz_votes');
    }
    await client.query('COMMIT');
  } catch (e) { try { await client.query('ROLLBACK'); } catch (_) {} throw e; }
  finally { client.release(); }
}
async function clearVotesDb() { await pool.query('DELETE FROM quiz_votes'); }
async function importVotesDb(obj) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const k in obj) {
      const v = obj[k];
      if (!Array.isArray(v) || v.length < 2) continue;
      await client.query(
        'INSERT INTO quiz_votes (id,a,b) VALUES ($1,$2,$3) ON CONFLICT (id) DO UPDATE SET a=EXCLUDED.a,b=EXCLUDED.b',
        [k, Number(v[0]) || 0, Number(v[1]) || 0]);
    }
    await client.query('COMMIT');
  } catch (e) { try { await client.query('ROLLBACK'); } catch (_) {} throw e; }
  finally { client.release(); }
}
async function getAdminPassDb() {
  const r = await pool.query("SELECT v FROM quiz_meta WHERE k='admin_pass'");
  return r.rows[0] ? r.rows[0].v : null;
}
async function setAdminPassDb(p) {
  await pool.query(
    "INSERT INTO quiz_meta (k,v) VALUES ('admin_pass',$1) ON CONFLICT (k) DO UPDATE SET v=EXCLUDED.v",
    [p]);
}

/* ---------------- 文件模式 ---------------- */
let QUIZ = { mtime: -1, list: [] };
function loadQuizFile() {
  let mt = -1;
  try { mt = fs.statSync(QUIZ_FILE).mtimeMs; } catch (_) { mt = -1; }
  if (mt === QUIZ.mtime) return QUIZ.list;
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
    } catch (_) {}
  }
  QUIZ = { mtime: mt, list };
  return list;
}
function loadQuizRawFile() {
  try { return fs.readFileSync(QUIZ_FILE, 'utf8'); } catch (_) { return ''; }
}
async function saveQuizRawFile(raw) {
  const { list, bad } = parseQuizText(raw);
  if (!list.length) return { ok: false, count: 0, bad };
  try {
    try { fs.copyFileSync(QUIZ_FILE, QUIZ_FILE + '.bak'); } catch (_) {}
    fs.writeFileSync(QUIZ_FILE + '.tmp', raw, 'utf8');
    fs.renameSync(QUIZ_FILE + '.tmp', QUIZ_FILE);
  } catch (e) { return { ok: false, msg: '写入失败：' + e.message, bad }; }
  QUIZ.mtime = -1;
  return { ok: true, count: list.length, bad };
}
function loadVotesFile() {
  try { return JSON.parse(fs.readFileSync(VOTES_FILE, 'utf8')) || {}; }
  catch (_) { return {}; }
}
function persistVotesFile(obj) {
  try {
    fs.writeFileSync(VOTES_FILE + '.tmp', JSON.stringify(obj));
    fs.renameSync(VOTES_FILE + '.tmp', VOTES_FILE);
  } catch (e) { console.error('[quiz] 投票写入失败（本次仅记在内存）：', e.message); }
}
function clearVotesFile() { try { fs.writeFileSync(VOTES_FILE, '{}'); } catch (_) {} }
function importVotesFile(obj) {
  const o = loadVotesFile();
  for (const k in obj) { const v = obj[k]; if (Array.isArray(v) && v.length >= 2) o[k] = [Number(v[0]) || 0, Number(v[1]) || 0]; }
  try { fs.writeFileSync(VOTES_FILE, JSON.stringify(o)); } catch (_) {}
}
function getAdminPassFile() {
  try {
    const j = JSON.parse(fs.readFileSync(ADMIN_FILE, 'utf8'));
    if (j && typeof j.password === 'string' && j.password) return j.password;
  } catch (_) {}
  return null;
}
function setAdminPassFile(p) {
  try { fs.writeFileSync(ADMIN_FILE, JSON.stringify({ password: p }, null, 2), 'utf8'); }
  catch (e) { console.error('[quiz-admin] 写文件失败：', e.message); }
}

/* ---------------- 启动 / 统一接口 ---------------- */
let watchdogTimer = null;
let onDbUpCb = null;

// 真正建立连接并初始化表（成功才置 usingDb=true）
async function connectAndInit() {
  const mod = require('@neondatabase/serverless');
  pool = new mod.Pool({
    connectionString: DATABASE_URL,
    max: 5,
    connectionTimeoutMillis: 10000,   // 放宽到 10s，容忍 Neon 冷启动唤醒
    idleTimeoutMillis: 30000,
  });
  await pool.query('select 1');
  usingDb = true;
  await createTables();
  await seedIfEmpty();
  console.log('[db] 已连接 Neon Postgres，quiz 数据改为持久化');
  if (onDbUpCb) { try { await onDbUpCb(); } catch (e) { console.error('[db] onDbUp 回调失败：', e.message); } }
  return true;
}

// 启动：连接 Neon，失败重试（覆盖空闲挂起后的冷启动唤醒，实测唤醒约 1.7s）
async function initDb() {
  if (!DATABASE_URL) { usingDb = false; return false; }
  let lastErr = '';
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      await connectAndInit();
      return true;
    } catch (e) {
      lastErr = e.message;
      console.error(`[db] Neon 连接失败（第 ${attempt} 次重试）：`, e.message);
      usingDb = false; pool = null;
      if (attempt < 4) {
        const wait = attempt * 1500;            // 1.5s / 3s / 4.5s 退避
        await new Promise(r => setTimeout(r, wait));
      }
    }
  }
  console.error('[db] Neon 连接 4 次均失败，回退文件存储。最后错误：', lastErr);
  usingDb = false; pool = null;
  return false;
}

// 看门狗：进程运行期内若 DB 掉线（如 Neon 中途不可达/被挂起），周期性重试自愈。
// onDbUp 在恢复连接后回调（用于把内存票数/口令同步回 DB），避免 false 期间累计的数据丢失。
function startWatchdog(onDbUp, intervalMs) {
  onDbUpCb = onDbUp || null;
  if (watchdogTimer) return;
  const iv = intervalMs || 120000;            // 默认每 2 分钟探活一次
  watchdogTimer = setInterval(async () => {
    if (usingDb) {
      try { await pool.query('select 1'); }   // 健康探活
      catch (e) {
        console.error('[db] 探活失败，标记离线，将在下次探活重试：', e.message);
        usingDb = false; pool = null;
      }
      return;
    }
    if (!DATABASE_URL) return;                // 无凭证则保持文件模式
    try {
      await connectAndInit();
      console.log('[db] 看门狗自愈成功，已恢复 Neon 持久化');
    } catch (e) { /* 静默，下一轮再试 */ }
  }, iv);
  if (watchdogTimer.unref) watchdogTimer.unref();   // 看门狗不阻止进程退出
}
const api = {
  initDb,
  startWatchdog,
  isDb: () => usingDb,
  loadQuiz: () => usingDb ? loadQuizDb() : loadQuizFile(),
  loadQuizRaw: async () => usingDb ? await loadQuizRawDb() : loadQuizRawFile(),
  saveQuizRaw: async (raw) => usingDb ? await saveQuizRawDb(raw) : await saveQuizRawFile(raw),
  loadVotes: async () => usingDb ? await loadVotesDb() : loadVotesFile(),
  persistVotes: async (obj) => usingDb ? await persistVotesDb(obj) : persistVotesFile(obj),
  clearVotes: async () => usingDb ? await clearVotesDb() : clearVotesFile(),
  importVotes: async (obj) => usingDb ? await importVotesDb(obj) : importVotesFile(obj),
  getAdminPass: async () => usingDb ? (await getAdminPassDb()) : getAdminPassFile(),
  setAdminPass: async (p) => usingDb ? await setAdminPassDb(p) : setAdminPassFile(p),
};
module.exports = api;
