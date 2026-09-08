# 部署到 Koyeb + Neon（免信用卡）

> 目标：让「二选一 / 接龙对战」的**票数、题库、后台口令**存在 Neon 数据库里，  
> 以后重新部署只换代码，不再清空数据。

代码侧已经改造完成（`db.js` 双模式：设了 `DATABASE_URL` 走 Neon，没设就走本地文件），  
本地回归测试已通过。剩下的是下面三步账号操作。

---

## 最快路径：一键部署链接（推荐，不用找按钮）

**先做完第 2 步（把代码推到 GitHub）**，然后在已登录 Koyeb 的浏览器里直接打开这个链接：

```
https://app.koyeb.com/deploy?type=git&builder=dockerfile&repository=github.com/L1hr/sts2-cards&branch=main&name=sts2-cards&instance_type=free&region=fra&ports=8000;http;/&env%5BQUIZ_ADMIN_PASS%5D=sts2admin
```

它会直接打开创建页面，并把下面这些全部预填好：

| 项 | 预填值 |
| --- | --- |
| 部署方式 | GitHub |
| 仓库 / 分支 | `L1hr/sts2-cards` / `main` |
| 构建方式 | Dockerfile |
| 实例类型 | **free**（512MB / 0.1 vCPU，免费层） |
| 区域 | `fra` 法兰克福（免费实例只支持 fra 法兰克福 / was 华盛顿） |
| 端口 | 8000，协议 http，路径 `/` |
| 环境变量 | `QUIZ_ADMIN_PASS=sts2admin`（后台口令，可改） |

你只需要**再手动加一个环境变量**：点 **Add variable** →  
Key 填 `DATABASE_URL`，Value 填第 1 步复制的 Neon 连接串 → 点 **Deploy**。

口令想改就把链接末尾的 `sts2admin` 换成你自己的（不能有空格和 `&`）。

> 找不到「Create Web Service」按钮时的自查：① 必须在 **<https://app.koyeb.com>**（控制台），
> 不是 www.koyeb.com 官网；② 按钮在 **Overview 标签页右上角**，新版界面可能叫
> **Create Service**，点开后再选 **Web Service**；③ 左侧菜单 **Services** 页面里也有同名按钮。

---

## 第 1 步：Neon 建库，拿连接串

1. 打开 <https://neon.tech> ，点 **Sign up**，用 GitHub / Google / 邮箱注册（**不要信用卡**）
2. 创建一个 Project，名字随便，例如 `sts2-cards`
3. Region 建议选 **AWS ap-southeast-1（新加坡）** —— 离浙江最近，延迟最低；  
   没有新加坡就选东京 / 法兰克福
4. 建好后，在 Dashboard 的 **Connection string** 面板复制连接串，格式类似：
   ```
   postgresql://neondb_owner:xxxxxxxx@ep-xxx-xxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
   ```
   注意要点 **Pooled connection** 那一栏（Neon 现在默认给的就是 pooled，带 `-pooler` 也可以，  
   本项目并发很低，两种都能用）。
5. 把这串发给我（或自己留着填到 Koyeb 的环境变量里）

> 免费额度：0.5 GB 存储 / 100 CU-小时每月计算 / 10 个分支，无时间限制。  
> 空闲 5 分钟会缩容到 0，第一次访问有约 0.5 秒冷启动，之后自动唤醒。

---

## 第 2 步：把代码推到 GitHub

Koyeb 是从 GitHub 仓库拉代码部署的，所以本地改动必须先推上去。

- 在**资源管理器**里双击 `sts2-cards` 文件夹里的 **`push-to-github.bat`**
  （不要从聊天里的文件卡片点开，那样只会用记事本打开）
- 提示 `Token (ghp_...)` 时，粘贴 Token 后回车

### 生成 Token（直接打开链接，不用找菜单）

浏览器打开 **<https://github.com/settings/tokens/new>** （若要求重新登录就输一遍 GitHub 密码）：

| 字段 | 填什么 |
| --- | --- |
| Note | 随便，例如 `sts2` |
| Expiration | 90 days（默认即可） |
| 权限 | 勾选 **`repo`**（第一大项，勾上后子项自动全选） |

拉到页面最下面点绿色 **Generate token** → 立刻复制 `ghp_` 开头的那串
（**只显示一次**，关掉就没了，先粘到记事本里）。

> 找不到 Developer settings？它在 Settings 左侧菜单的**最最下面**，要滚到底；
> 直接用上面的直链就不用找了。  
> 备选：装 **GitHub Desktop**，登录走浏览器授权，不需要 Token——
> 打开软件 → File → Add local repository → 选 `sts2-cards` 文件夹 → 右上角 **Push origin**。

推完之后刷新 <https://github.com/L1hr/sts2-cards> ，能看到 `db.js` 就说明成功了。

---

## 第 3 步：Koyeb 建 Web Service

1. 打开 <https://www.koyeb.com> ，**Sign up with GitHub**（免信用卡）
2. 右上角 **Create Web Service**
3. **Deployment method**：GitHub → 授权后选仓库 `L1hr/sts2-cards`、分支 `main`
4. **Region**：Frankfurt（法兰克福）或 Washington DC —— 免费层只有这两个，选 Frankfurt
5. **Builder**：Dockerfile（项目里已经写好了；如果构建失败就改成 Buildpack，项目有 `Procfile`）
6. **Port**：`8000`（Koyeb 默认，会通过 `PORT` 环境变量注入，代码已经读它）
7. **Health check**：路径填 `/api/quiz/info`
8. **Instance**：Free（512 MB / 0.1 vCPU，免费层）
9. 展开 **Environment variables**，加两个：
   | Key               | Value               |
   | ----------------- | ------------------- |
   | `DATABASE_URL`    | 第 1 步复制的 Neon 连接串   |
   | `QUIZ_ADMIN_PASS` | 你想设的后台口令（不填就用代码默认值） |
10. 点 **Deploy**，等 2～4 分钟构建完成

---

## 验证是否真的连上了数据库

部署完成后打开日志（Koyeb → 服务 → **Logs**），看到这一行就成功了：

```
[db] 已连接 Neon Postgres，quiz 数据改为持久化
[quiz-admin] 口令来源：Neon 数据库
```

如果看到 `[db] Neon 连接失败，回退文件存储：...`，说明连接串有问题（通常是漏了  
`?sslmode=require`，或者复制时少了字符），会**自动退回文件模式**，网站照样能跑，  
只是数据又会被部署清掉。

然后访问 `https://<你的服务名>.koyeb.app/api/quiz/info`，返回  
`{"ok":true,"count":7,...}` 就正常。

首次启动 `db.js` 会自动：建 3 张表 → 从 `quiz.txt` 导入 7 道种子题 → 把口令写进 `quiz_meta`。

---

## 可选：把现有线上的题目和票数搬过去

现在 Render / WorkBuddy 上那一份数据还在。迁移办法：

1. 打开**旧站**后台 → 复制题库全文，保存下来
2. 打开**新站**（Koyeb）后台 → 粘贴 → 保存
3. 票数同理（后台有导出/导入投票数据的按钮）

不做的话也行，新站会用 `quiz.txt` 里的 7 道种子题重新开始。

---

## 需要知道的几个取舍

- **域名**：免费层只能用 `xxx.koyeb.app`，不能绑自己的域名（自定义域名要 Pro $29/月）
- **冷启动**：Koyeb 免费服务一段时间没访问会休眠，第一次打开要等几秒；Neon 冷启动约 0.5 秒
- **延迟**：Frankfurt 到浙江大概 200～300 ms，比国内慢，但图鉴是静态资源，体感主要是首屏稍慢
- **额度**：Neon 100 CU-小时/月对这种访问量完全够用；真超了 Neon 免费层是**停服**不是扣费，  
  不会突然产生账单
