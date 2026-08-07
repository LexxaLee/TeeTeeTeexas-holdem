# 部署到 Render.com（永久公网联机服务器）

本目录已配置好一键部署到 [Render.com](https://render.com) 的免费 Web 服务。
部署后你会得到一个**固定不变的 `https://` 地址**，浏览器玩家直接打开即玩，
微信小游戏端填入对应的 `wss://` 地址即可真机联机（无需再忍受 LocalTunnel 的 502 和验证页）。

---

## 部署包含什么

- `deploy/server.js`：合并 HTTP + WebSocket 服务器（同一端口同时提供浏览器客户端和扑克游戏服务）
- `deploy/public/index.html`：浏览器端扑克客户端（Canvas 渲染，开箱即玩）
- `src/`：扑克核心引擎 / AI / 联机逻辑（被 server.js 引用）
- `render.yaml`：Render Blueprint 配置（已在仓库根目录）

> 已本地验证：`deploy/server.js` 在测试端口正确返回游戏页（HTTP 200）且 WebSocket 连接成功。

---

## 第一步：把代码推到 GitHub

Render 从 Git 仓库拉取代码。你需要一个 GitHub 账号。

```bash
cd texas-holdem
git init                      # 如果还没初始化
git add .
git commit -m "Texas Hold'em deploy"
# 在 GitHub 新建一个空仓库（如 texas-holdem），然后：
git remote add origin https://github.com/<你的用户名>/texas-holdem.git
git branch -M main
git push -u origin main
```

> 仓库里已带 `.gitignore`，`node_modules` 不会被提交（Render 会自动 `npm install` 安装 `ws`）。

---

## 第二步：在 Render 创建服务

**方式 A（推荐，用 render.yaml 自动配置）：**
1. 登录 Render → 右上角 **New +** → **Blueprint**
2. 连接你的 GitHub，选 `texas-holdem` 仓库
3. Render 自动读取根目录 `render.yaml`，直接点 **Apply**
4. 等待构建（约 1–2 分钟）

**方式 B（手动建 Web Service）：**
1. **New +** → **Web Service** → 连接仓库 `texas-holdem`
2. 配置：
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node deploy/server.js`
   - **Plan**: `Free`
3. 在 **Environment** 里确认 `PORT = 10000`（render.yaml 已设，手动建也建议加上）
4. 点 **Create Web Service**

---

## 第三步：拿到你的公网地址

部署完成后，Render 会给一个地址，形如：

```
https://texas-holdem-server.onrender.com
```

把这个地址记下来，下面两步都会用到。

---

## 第四步：浏览器玩家直接玩

把上面的 `https://...onrender.com` 发给好友即可。
浏览器客户端会**自动**连 `wss://<同一个域名>`（HTTP 和 WS 同端口同服务器），无需任何配置。

- 创建房间 → 复制链接 `https://...onrender.com?room=XXXXXX` 分享好友
- 好友打开链接自动进房

---

## 第五步：微信小游戏真机联机（必须做）

微信真机/体验版**强制校验 socket 合法域名**，所以必须两步：

1. **加白名单**：微信公众平台 → 开发 → 开发设置 → **服务器域名 → socket合法域名**，添加：
   ```
   wss://texas-holdem-server.onrender.com
   ```
   （把 `texas-holdem-server.onrender.com` 换成你实际的 Render 地址）

2. **游戏里填地址**：小程序大厅右下角 **⚙** → 输入
   ```
   wss://texas-holdem-server.onrender.com
   ```
   点保存。之后创建/加入房间就会走这个服务器，真机好友可跨设备联机。

> 未加白名单或没填地址时，游戏会回退到本地 AI 对战并提示「联机不可用」——这是正常的保护逻辑。

---

## 免费套餐注意点

- **休眠冷启动**：免费 Web 服务长时间无请求会休眠，首次访问需 ~30–50 秒唤醒，之后正常。
- **WebSocket 支持**：免费套餐支持 WebSocket（已验证可用）。
- 如需常驻不休眠，可在 Render 升级到付费套餐，或用一个定时请求保活。

---

## 本地验证（可选）

```bash
PORT=8080 node deploy/server.js
# 浏览器打开 http://localhost:8080 即可本地试玩
```
