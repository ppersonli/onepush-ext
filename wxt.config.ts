import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  dev: {
    server: {
      port: 3002,
    },
  },
  modules: ['@wxt-dev/module-vue'],
  manifest: {
    icons: {
      16: '/icon/logo.png',
      32: '/icon/logo.png',
      48: '/icon/logo.png',
      96: '/icon/logo.png',
      128: '/icon/logo.png',
    },
    action: {
      default_icon: {
        16: '/icon/logo.png',
        32: '/icon/logo.png',
        48: '/icon/logo.png',
      },
      default_title: '皮小粒',
    },
    permissions: [
      'storage',
      'tabs',
      'scripting',
      'offscreen'
    ],
    host_permissions: [
      '*://*.douyin.com/*',
      '*://*.xiaohongshu.com/*',
      '*://channels.weixin.qq.com/*',
      '*://*.kuaishou.com/*',
      '*://baijiahao.baidu.com/*',
      '*://*.bilibili.com/*',
      '*://*.tiktok.com/*'
    ]
  }
});
