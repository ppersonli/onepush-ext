import type { VideoPublishTask } from '../utils/types';

export default defineContentScript({
  // Chrome match pattern 的 host 不能包含端口（连 :3000 也不行），仅写 host 即可匹配该 host 的任意端口
  // 例如 http://localhost/* 会匹配 http://localhost:3000/image-creater/my-comics
  matches: [
    '*://pixiaoli.cn/*',
    '*://*.pixiaoli.cn/*',
    'http://localhost:3000/*',
    'http://127.0.0.1:3000/*',
  ],

  main() {
    console.log('[Pixiaoli Extension] Web Platform listener active.');

    // 向 pixiaoli-web 暴露「已安装」事件（通过 DOM 事件，而不是 inline script，避免 CSP 限制）
    window.dispatchEvent(new CustomEvent('PixiaoliExtInstalled'));
    // 同时响应页面的主动 ping：页面可派发 PixiaoliExtPing 来探测插件是否存在
    window.addEventListener('PixiaoliExtPing', () => {
      window.dispatchEvent(new CustomEvent('PixiaoliExtInstalled'));
    });

    window.addEventListener('PixiaoliPublishVideo', (event: any) => {
      const host = window.location.host;
      const allowedHosts = new Set<string>([
        'pixiaoli.cn',
        'www.pixiaoli.cn',
        'localhost:3000',
        '127.0.0.1:3000',
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
      console.log('[Pixiaoli Extension] Intercepted publish event:', detail);

      if (!detail) {
        console.error('[Pixiaoli Extension] Empty task payload.');
        return;
      }

      // Generate a unique ID if not provided
      if (!detail.taskId) {
        detail.taskId = 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      }

      // Forward to background script（防止扩展上下文失效时在页面里抛 Uncaught）
      try {
        browser.runtime.sendMessage({
          type: 'PUBLISH_REQUEST_FROM_WEB',
          payload: detail
        }).then(response => {
          console.log('[Pixiaoli Extension] Background accepted the task:', response);
        }).catch(err => {
          console.error('[Pixiaoli Extension] Error sending to background:', err);
        });
      } catch (err) {
        console.error('[Pixiaoli Extension] runtime.sendMessage threw synchronously:', err);
      }
    });
  },
});
