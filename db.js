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

const DATABASE_URL = process.env.DATABASE_URL || '';

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
async function persistVotesDb(obj) {
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
async function initDb() {
  if (!DATABASE_URL) { usingDb = false; return false; }
  try {
    const mod = require('@neondatabase/serverless');
    pool = new mod.Pool({ connectionString: DATABASE_URL, max: 5 });
    await pool.query('select 1');
    usingDb = true;
    await createTables();
    await seedIfEmpty();
    console.log('[db] 已连接 Neon Postgres，quiz 数据改为持久化');
    return true;
  } catch (e) {
    console.error('[db] Neon 连接失败，回退文件存储：', e.message);
    usingDb = false; pool = null;
    return false;
  }
}
const api = {
  initDb,
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
