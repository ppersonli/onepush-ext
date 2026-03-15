

我的网站：[https://pixiaoli.cn](https://pixiaoli.cn)

## Pixiaoli 浏览器插件（pixiaoli-ext）

皮小粒（Pixiaoli）官方浏览器扩展，用于**一键把视频或者皮小粒 Web 端生成的作品发布到各大短视频 / 内容平台**。

---

## 功能简介

- **自动打开发布页面**：接收 Web 端下发的发布任务后，自动在新标签页打开对应平台的发布页面。
- **自动携带素材信息**：将作品视频 / 封面 / 标题等信息一并传递到扩展，由用户在目标平台确认与提交。
- **多平台支持**：当前主要支持常见的短视频与内容平台（如抖音、快手、B 站、小红书、TikTok、视频号、百家号等），具体以版本更新说明为准。

---

## 安装方式

> 下文以 Chrome 系浏览器为例（Chrome、Edge、Brave 等）。Firefox 需使用对应的扩展管理界面，步骤类似。

### 以「加载已解压的扩展」方式安装

1. 克隆本仓库：
  ```bash
   git clone https://github.com/ppersonli/onepush-ext.git
   cd pixiaoli-ext
  ```
2. 安装依赖并构建：
  ```bash
   npm install
   npm run build
  ```
3. 构建完成后，在浏览器中打开 `chrome://extensions/`：
  - 打开「开发者模式」；
  - 点击「加载已解压的扩展程序」；
  - 选择本项目构建输出目录.output`/ chrome-mv3`。

安装完成后，你应能在浏览器工具栏看到 Pixiaoli 的扩展图标。

---

## 与 Pixiaoli Web 端配合使用

### 前提条件

- 已在浏览器中成功安装并启用本扩展；
- 使用支持的浏览器访问 [Pixiaoli 网址](https://pixiaoli.cn)；

### 基本使用流程

1. 在 Pixiaoli Web 端完成作品生成（例如漫画等）。
2. 打开 Web 端-我的漫画提供的「发布」功能。
3. 确认发布：
  - 浏览器会自动弹出或切换到一个 / 多个新标签页；
  - 每个标签页对应一个目标平台的发布页面；
  - 扩展会尽可能把作品的基础信息带到这些页面中，减少手动复制粘贴。
4. 在各个平台的发布页面中进行最后检查（标题、分类、标签等），**手动点击平台自身的「发布」按钮**完成最终发布。

> 说明：出于平台限制与安全考虑，本扩展不会模拟用户最终的「确认发布」操作，最后一步始终需要用户手工确认。

---

## 常见问题（FAQ）

### 1. Web 端提示「未检测到扩展」怎么办？

- 确认已正确安装并启用了本扩展；
- 刷新 Pixiaoli Web 页面重新进入发布流程；
- 确认访问的域名是 Pixiaoli 官方域名或文档说明中的测试域名；
- 如果仍然无法识别，可以尝试：
  - 在扩展管理页中关闭再重新打开本扩展；
  - 重新安装最新版本；
  - 在浏览器隐身模式下测试（确保允许在隐身模式运行扩展）。

### 2. 新标签页没有自动打开或没有跳转到发布页面？

- 检查浏览器是否拦截了弹窗 / 新标签页；
- 确保在 Pixiaoli Web 页面上确实点击了需要调用扩展的发布入口；
- 尝试关闭其他可能拦截脚本或修改页面行为的插件，再重试。

### 3. 支持哪些平台？

本扩展会根据 Pixiaoli Web 后台配置逐步支持更多平台，典型包括但不限于：

- 常见短视频平台（抖音、快手、TikTok 等）；
- 视频站点（如 B 站）；
- 图文内容平台（如小红书、百家号、腾讯系内容平台等）。

实际支持列表与体验以 Pixiaoli Web 端发布弹窗中的展示为准。

---

## 本地开发（简要说明）

> 本小节面向需要二次开发的同学，普通用户可以忽略。

项目基于 [WXT](https://wxt.dev/) + Vue 3：

```bash
# 安装依赖
npm install

# 开发模式（默认启动一个带扩展的开发浏览器）
npm run dev

# 生产构建
npm run build
```

更多开发配置（如使用持久化浏览器 Profile、针对 Firefox 的构建等），请参考源码中的注释与脚本说明。

---

## 反馈与贡献

- 如在使用过程中遇到问题，欢迎在 GitHub Issue 中反馈详情（浏览器版本、操作系统、复现步骤等）。
- 欢迎通过 Pull Request 的形式参与改进扩展的使用体验和平台适配。

## Pixiaoli 浏览器插件（pixiaoli-ext）

### 与 Web 端的集成约定

Web 端（`pixiaoli-web`）通过全局标记 `window.__PIXIAOLI_EXT_INSTALLED__` 判断「短视频发布插件是否已安装并在当前站点生效」，以及通过 `PixiaoliPublishVideo` 事件把任务发给插件。

#### 1. 安装检测：事件握手 + 可选标记

MV3 content script 运行在 **isolated world**，页面 JS 直接读不到 content script 写在 `window` 上的字段，同时页面还可能有比较严格的 CSP，禁止我们注入 inline `<script>`。  
因此，插件与 Web 端之间采用 **DOM 事件握手** 的方式来确定「插件已安装」。

- **事件名（插件 → 页面）**：`PixiaoliExtInstalled`
- **事件名（页面 → 插件）**：`PixiaoliExtPing`

content script 侧（`entrypoints/sender.content.ts`）：

```ts
// sender.content.ts（节选）
main() {
  console.log('[Pixiaoli Extension] Web Platform listener active.');

  // 启动时主动告诉页面「我在」
  window.dispatchEvent(new CustomEvent('PixiaoliExtInstalled'));

  // 页面也可以通过 PixiaoliExtPing 主动探测扩展是否存在
  window.addEventListener('PixiaoliExtPing', () => {
    window.dispatchEvent(new CustomEvent('PixiaoliExtInstalled'));
  });

  // ...监听 PixiaoliPublishVideo 见后文
}
```

页面侧（`pixiaoli-web`）在发布弹窗组件挂载时：

- 监听 `PixiaoliExtInstalled` 事件，一旦收到就认为插件可用（并且在 page world 里自己设置 `window.__PIXIAOLI_EXT_INSTALLED__ = true` 方便调试）；
- 同时按固定间隔主动派发 `PixiaoliExtPing` 若干次，确保无论插件/页面谁先加载，都能最终握手成功。

这样的设计不依赖 inline script，也不会被严格的 `script-src` CSP 拦截。

#### 2. 任务下发：`PixiaoliPublishVideo` 事件

- Web 端会在 `window` 上派发 `PixiaoliPublishVideo` 事件，`detail` 为 `VideoPublishTask`：

```ts
window.dispatchEvent(new CustomEvent('PixiaoliPublishVideo', { detail }));
```

- 插件侧在 content script 里监听，同样要注意 **host 白名单** 只允许：
  - `pixiaoli.cn` / `www.pixiaoli.cn` / `*.pixiaoli.cn`
  - `localhost` / `127.0.0.1` 及其端口

具体逻辑见：

```ts
// entrypoints/sender.content.ts（节选）
window.addEventListener('PixiaoliPublishVideo', (event: any) => {
  const host = window.location.host;
  const allowedHosts = new Set<string>([
    'pixiaoli.cn',
    'www.pixiaoli.cn',
    'localhost',
    '127.0.0.1',
  ]);
  const isAllowed =
    allowedHosts.has(host) ||
    host.endsWith('.pixiaoli.cn') ||
    host.startsWith('localhost:') ||
    host.startsWith('127.0.0.1:');
  if (!isAllowed) {
    console.warn('[Pixiaoli Extension] Blocked publish event from untrusted host:', host);
    return;
  }

  const detail = event.detail as VideoPublishTask;
  // ...校验 detail 并通过 browser.runtime.sendMessage 转给 background
});
```

#### 3. 本地开发环境注意事项

- Web 端开发默认跑在 `http://localhost:3000`；
- 扩展 `matches` 中必须包含 `http://localhost/*`，否则 content script 不会注入，`__PIXIAOLI_EXT_INSTALLED__` 也不会被设置；
- 改动 `sender.content.ts` 后，需要：
  1. 重新构建/刷新扩展（取决于你的打包方案）；
  2. 刷新浏览器页面，让新的 content script 在当前 tab 中重新执行。

# WXT + Vue 3

This template should help get you started developing with Vue 3 in WXT.

## 开发环境保留登录态（推荐）

WXT 开发模式默认会用一个“临时”浏览器 profile 来加载扩展，所以每次启动都需要重新登录。

你可以让 dev 启动的浏览器复用一个**持久化 profile**（cookies/localStorage 会保留），做法：

1. 复制 `web-ext.config.example.ts` 为 `web-ext.config.ts`
2. 运行 `npm run dev`

`web-ext.config.ts` 已在 `.gitignore` 中忽略，不会影响其他同事的环境。

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar).

