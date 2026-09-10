#!/usr/bin/env node
/**
 * push-via-api.js —— 用 GitHub Git Data API 推送本地改动
 *
 * 为什么需要它：某些网络环境下 github.com:443 直连不通（git push 超时），
 * 但 api.github.com 可达。这个脚本走 REST API 完成等价的一次 commit 推送。
 *
 * 用法：
 *   node push-via-api.js <GitHub Personal Access Token>
 * 或：
 *   GITHUB_TOKEN=ghp_xxx node push-via-api.js
 *
 * 行为：以远端 main 当前提交为父提交，把 `git diff --name-only origin/main HEAD`
 * 里列出的文件（新增/修改/删除）打成一棵新树，创建一个提交，然后把 main 指向它。
 */

const fs = require('fs');
const { execFileSync } = require('child_process');

const OWNER = 'L1hr';
const REPO = 'sts2-cards';
const BRANCH = 'main';
const API = 'https://api.github.com';

const token = process.argv[2] || process.env.GITHUB_TOKEN;
if (!token) {
  console.error('用法: node push-via-api.js <GitHub PAT>');
  process.exit(1);
}

const HEADERS = {
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'sts2-push-via-api',
  'Content-Type': 'application/json',
};

async function req(method, pathname, body) {
  const res = await fetch(API + pathname, {
    method,
    headers: HEADERS,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (_) { /* 非 JSON */ }
  if (!res.ok) {
    const msg = json && json.message ? json.message : text.slice(0, 300);
    throw new Error(`${method} ${pathname} -> HTTP ${res.status}: ${msg}`);
  }
  return json;
}

function gitOut(args) {
  return execFileSync('git', args, { encoding: 'utf8' });
}

(async () => {
  console.log('[1/6] 读取远端 main 当前提交…');
  const ref = await req('GET', `/repos/${OWNER}/${REPO}/git/ref/heads/${BRANCH}`);
  const baseSha = ref.object.sha;
  console.log('      base commit:', baseSha.slice(0, 7));

  const commit = await req('GET', `/repos/${OWNER}/${REPO}/git/commits/${baseSha}`);
  const baseTree = commit.tree.sha;

  console.log('[2/6] 计算本地改动文件…');
  const raw = gitOut(['diff', '--name-only', '-z', `origin/${BRANCH}`, 'HEAD']);
  const files = raw.split('\0').filter(Boolean);
  if (!files.length) {
    console.log('      没有需要推送的改动。');
    return;
  }
  console.log('      ' + files.length + ' 个文件：' + files.join(', '));

  console.log('[3/6] 上传文件内容（blob）…');
  const tree = [];
  for (const file of files) {
    const abs = file;
    if (!fs.existsSync(abs)) {
      // 本地已删除 -> 传 null sha 表示删除
      tree.push({ path: file, mode: '100644', type: 'blob', sha: null });
      console.log('      - (delete) ' + file);
      continue;
    }
    const buf = fs.readFileSync(abs);
    const blob = await req('POST', `/repos/${OWNER}/${REPO}/git/blobs`, {
      content: buf.toString('base64'),
      encoding: 'base64',
    });
    tree.push({ path: file, mode: '100644', type: 'blob', sha: blob.sha });
    console.log('      + ' + file + '  (' + (buf.length / 1024).toFixed(0) + ' KB)');
  }

  console.log('[4/6] 创建新树…');
  const newTree = await req('POST', `/repos/${OWNER}/${REPO}/git/trees`, {
    base_tree: baseTree,
    tree,
  });

  console.log('[5/6] 创建提交…');
  const newCommit = await req('POST', `/repos/${OWNER}/${REPO}/git/commits`, {
    message: '版本历史内联 + 召唤紫圈 + db 连接自愈与孤儿票清理',
    tree: newTree.sha,
    parents: [baseSha],
  });
  console.log('      new commit:', newCommit.sha.slice(0, 7));

  console.log('[6/6] 更新 main 指向…');
  await req('PATCH', `/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`, {
    sha: newCommit.sha,
    force: false,
  });

  console.log('\n完成：https://github.com/' + OWNER + '/' + REPO + '/commits/' + BRANCH);
  try {
    await req('GET', `/repos/${OWNER}/${REPO}/contents/db.js`);
    console.log('校验：远端已能读到 db.js ✅');
  } catch (e) {
    console.log('校验：db.js 仍读不到 —— ' + e.message);
  }
})().catch((e) => {
  console.error('\n失败：' + e.message);
  process.exit(1);
});
