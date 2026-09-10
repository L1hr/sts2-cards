#!/usr/bin/env node
/**
 * koyeb-deploy.js —— 用 Koyeb REST API 创建 App + Web Service（免手动点界面）
 *
 * 用法：
 *   node koyeb-deploy.js <Koyeb API Token> [Neon 连接串]
 *
 * 说明：
 *   - Koyeb API Token 在 https://app.koyeb.com/settings/api 创建（Account Settings → API）
 *   - Neon 连接串可省略，省略时服务以文件模式运行，之后再加 DATABASE_URL 重新部署即可
 *   - 免费实例只能用 fra（法兰克福）或 was（华盛顿）
 */

const API = 'https://app.koyeb.com/v1';
const APP_NAME = 'sts2-cards';
const SERVICE_NAME = 'web';
const REGION = 'fra';
const PORT = 8000;

const token = process.argv[2] || process.env.KOYEB_TOKEN;
const databaseUrl = process.argv[3] || process.env.DATABASE_URL || '';

if (!token) {
  console.error('用法: node koyeb-deploy.js <Koyeb API Token> [Neon 连接串]');
  process.exit(1);
}

const HEADERS = {
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
  Accept: 'application/json',
};

async function req(method, pathname, body) {
  const res = await fetch(API + pathname, {
    method,
    headers: HEADERS,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (_) { /* ignore */ }
  if (!res.ok) {
    const msg = json && (json.message || (json.error && json.error.message)) ? (json.message || json.error.message) : text.slice(0, 400);
    const err = new Error(`${method} ${pathname} -> HTTP ${res.status}: ${msg}`);
    err.status = res.status;
    err.body = json || text;
    throw err;
  }
  return json;
}

(async () => {
  console.log('[1/3] 创建 App（若已存在则复用）…');
  let appId;
  try {
    const app = await req('POST', '/apps', { name: APP_NAME });
    appId = (app.app && app.app.id) || app.id;
    console.log('      新建 App:', appId);
  } catch (e) {
    if (e.status !== 409 && e.status !== 400) throw e;
    const list = await req('GET', `/apps?name=${encodeURIComponent(APP_NAME)}`);
    const found = (list.apps || []).find((a) => a.name === APP_NAME);
    if (!found) throw e;
    appId = found.id;
    console.log('      复用已有 App:', appId);
  }

  console.log('[2/3] 创建 Web Service…');
  const env = [{ key: 'QUIZ_ADMIN_PASS', value: 'sts2admin' }];
  if (databaseUrl) {
    env.push({ key: 'DATABASE_URL', value: databaseUrl });
  }

  const definition = {
    name: SERVICE_NAME,
    type: 'WEB',
    git: {
      repository: 'github.com/L1hr/sts2-cards',
      branch: 'main',
      builder: 'dockerfile',
      dockerfile: 'Dockerfile',
    },
    instance_types: [{ type: 'free' }],
    regions: [REGION],
    env,
    ports: [{ port: PORT, protocol: 'http' }],
    routes: [{ port: PORT, path: '/' }],
    healthchecks: [{ port: PORT, path: '/api/quiz/info', protocol: 'http' }],
  };

  let svc;
  try {
    svc = await req('POST', '/services', { app_id: appId, definition });
  } catch (e) {
    if (e.status === 400) {
      // 多半是 healthchecks / dockerfile 字段名不被接受，退回最小可用定义重试
      console.log('      完整定义被拒（HTTP 400），改用最小定义重试…');
      console.log('      服务端返回：', JSON.stringify(e.body).slice(0, 300));
      const minimal = {
        name: SERVICE_NAME,
        type: 'WEB',
        git: { repository: 'github.com/L1hr/sts2-cards', branch: 'main' },
        instance_types: [{ type: 'free' }],
        regions: [REGION],
        env,
        ports: [{ port: PORT, protocol: 'http' }],
        routes: [{ port: PORT, path: '/' }],
      };
      svc = await req('POST', '/services', { app_id: appId, definition: minimal });
    } else {
      throw e;
    }
  }
  const svcId = (svc.service && svc.service.id) || svc.id;
  console.log('      Service 已创建:', svcId);

  console.log('[3/3] 查询状态…');
  const detail = await req('GET', `/services/${svcId}`);
  const s = detail.service || detail;
  console.log('      状态:', s.status);
  if (s.messages && s.messages.length) {
    s.messages.slice(0, 5).forEach((m) => console.log('      -', m));
  }

  console.log('\n控制台：https://app.koyeb.com/apps/' + APP_NAME);
  console.log('构建大概 2~4 分钟，之后访问 https://' + APP_NAME + '-<你的组织>-<hash>.koyeb.app');
  console.log('（真实域名在控制台 Services 页面能看到）');
})().catch((e) => {
  console.error('\n失败：' + e.message);
  process.exit(1);
});
