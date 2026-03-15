import { defineWebExtConfig } from 'wxt';

/**
 * 通过环境变量控制是否使用「默认浏览器配置文件」来调试扩展。
 *
 * - 默认（不设置环境变量）：使用 .wxt 下的独立 profile，互不干扰你的日常浏览器。
 * - 设置 PIXIAOLI_EXT_USE_DEFAULT_BROWSER=1：不再指定 --user-data-dir，
 *   让 web-ext 直接使用浏览器自身的默认 profile（等同于“往默认浏览器里植入插件”）。
 *
 * ⚠️ 注意：
 * - 使用默认 profile 时，如果你已经开着同一个浏览器实例，可能会有冲突提示。
 * - 建议只在本机开发、且明确知道自己在做什么时开启。
 */
const useDefaultBrowser = process.env.PIXIAOLI_EXT_USE_DEFAULT_BROWSER === '1';

export default defineWebExtConfig({
  disabled: useDefaultBrowser,
  chromiumArgs: useDefaultBrowser ? [] : ['--user-data-dir=./.wxt/chrome-data'],
});
