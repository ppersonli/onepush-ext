import { getElementByTextInDocument } from '../utils/dom';

export default defineContentScript({
  matches: ['*://*.tiktok.com/*'],
  main() {
    console.log('[Pixiaoli TikTok] Content script injected.');

    const UPLOAD_URL_PREFIX = 'https://www.tiktok.com/tiktokstudio/upload';
    const CONTENT_URL_PREFIX = 'https://www.tiktok.com/tiktokstudio/content';

    function sleep(ms: number) {
      return new Promise<void>((resolve) => setTimeout(resolve, ms));
    }

    function clickElement(el: HTMLElement) {
      try {
        el.scrollIntoView({ block: 'center', inline: 'center' });
      } catch {
        // ignore
      }
      try {
        el.focus();
      } catch {
        // ignore
      }
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    }

    function isDisabled(el: HTMLElement) {
      const ariaDisabled = (el.getAttribute('aria-disabled') || '').toLowerCase();
      const anyEl = el as any;
      return (
        el.hasAttribute('disabled') ||
        ariaDisabled === 'true' ||
        el.className.includes('disabled') ||
        anyEl?.disabled === true
      );
    }

    function getRootDocument(): Document {
      // social-auto-upload: 有时在 iframe[data-tt="Upload_index_iframe"] 内
      const iframe = document.querySelector('iframe[data-tt="Upload_index_iframe"]') as HTMLIFrameElement | null;
      if (iframe?.contentDocument) return iframe.contentDocument;
      return document;
    }

    async function waitForUploadPage(timeoutMs = 60_000) {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        if (window.location.href.startsWith(UPLOAD_URL_PREFIX)) return true;
        await sleep(300);
      }
      return false;
    }

    async function waitForFileInput(doc: Document, timeoutMs = 60_000) {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        const input =
          (doc.querySelector('input[type="file"][accept*="video"]') as HTMLInputElement | null) ||
          (doc.querySelector('input[type="file"]') as HTMLInputElement | null);
        if (input) return input;
        await sleep(300);
      }
      return null;
    }

    async function injectVideoFile(fileBlobUrl: string, fileName?: string) {
      const res = await fetch(fileBlobUrl);
      const blob = await res.blob();
      const file = new File([blob], fileName && fileName.trim() ? fileName : 'video.mp4', { type: blob.type });

      const doc = getRootDocument();
      // 尝试触发“Select video”按钮渲染 input
      const maybeSelect =
        getElementByTextInDocument(doc, 'Select video', false) || getElementByTextInDocument(doc, 'Select file', false);
      const selectBtn = maybeSelect ? ((maybeSelect.closest?.('button, div[role="button"], a') as HTMLElement | null) ?? maybeSelect) : null;
      if (selectBtn && selectBtn.offsetParent !== null) clickElement(selectBtn);

      const input = await waitForFileInput(doc, 60_000);
      if (!input) throw new Error('未找到 TikTok 上传 file input');

      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    async function fillTitleAndTags(title: string, tags: string[]) {
      const doc = getRootDocument();
      const editor = doc.querySelector('div.public-DraftEditor-content') as HTMLElement | null;
      if (!editor) return;
      editor.focus();

      // 轻量填充：插入标题 + hashtags（对齐 social-auto-upload：用键盘输入/插入）
      const base = (title || '').trim();
      if (base) document.execCommand('insertText', false, base);
      document.execCommand('insertText', false, '\n');
      (Array.isArray(tags) ? tags : []).forEach((t) => {
        const tag = (t || '').trim();
        if (!tag) return;
        document.execCommand('insertText', false, `#${tag} `);
      });
    }

    async function waitPostButtonEnabled(timeoutMs = 30 * 60_000) {
      // social-auto-upload: 等 button-group > button text=Post 的 disabled 属性消失
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        const doc = getRootDocument();
        const raw =
          getElementByTextInDocument(doc, 'Post', true) ||
          getElementByTextInDocument(doc, '发布', true) ||
          getElementByTextInDocument(doc, 'Publish', true);
        const btn = raw ? ((raw.closest?.('button') as HTMLButtonElement | null) ?? (raw as any as HTMLButtonElement)) : null;
        if (btn && btn.offsetParent !== null && !isDisabled(btn)) return btn;
        await sleep(2000);
      }
      return null;
    }

    async function clickImmediatePublishIfPopupShows(timeoutMs = 12_000) {
      // TikTok：点击 Post 后可能出现“立即发布”二次确认弹窗
      // 需求：点击完发布按钮后固定等待 2s，再尝试点击一次“立即发布”
      await sleep(2000);
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        const doc = getRootDocument();
        const raw =
          getElementByTextInDocument(doc, '立即发布', true) ||
          getElementByTextInDocument(doc, 'Post now', true) ||
          getElementByTextInDocument(doc, 'Publish now', true);
        const btn = raw
          ? ((raw.closest?.('button, div[role="button"], a') as HTMLElement | null) ?? raw)
          : null;
        if (btn && btn.offsetParent !== null && !isDisabled(btn)) {
          console.log('[Pixiaoli TikTok] Clicking immediate publish confirm...');
          clickElement(btn);
          return true;
        }
        await sleep(300);
      }
      return false;
    }

    async function clickPostAndWaitSuccess(timeoutMs = 60_000) {
      const btn = await waitPostButtonEnabled();
      if (!btn) throw new Error('等待 Post/发布 按钮可点击超时');

      clickElement(btn);
      // 兼容二次确认弹窗（不阻断主流程；若没出现则忽略）
      clickImmediatePublishIfPopupShows().catch(() => {
        // ignore
      });

      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        if (window.location.href.startsWith(CONTENT_URL_PREFIX)) return true;
        await sleep(500);
      }
      return false;
    }

    async function executeTikTokUpload(fileBlobUrl: string, title: string, description: string, tags: string[], fileName?: string) {
      console.log('[Pixiaoli TikTok] Starting upload process...');

      if (!window.location.href.startsWith(UPLOAD_URL_PREFIX)) {
        window.location.href = `${UPLOAD_URL_PREFIX}?lang=en`;
      }
      await waitForUploadPage();

      await injectVideoFile(fileBlobUrl, fileName);
      await sleep(1500);
      await fillTitleAndTags(`${title || ''}${description ? `\n${description}` : ''}`, Array.isArray(tags) ? tags : []);

      // 等上传完成（Post 按钮解禁）再点击发布
      const ok = await clickPostAndWaitSuccess(90_000);
      if (ok) {
        console.log('[Pixiaoli TikTok] Publish success (navigated to content).');
      } else {
        console.warn('[Pixiaoli TikTok] Clicked Post but did not navigate to content within timeout.');
      }
      browser.runtime.sendMessage({ type: 'FOREGROUND_UPLOAD_DONE' });
    }

    browser.runtime.onMessage.addListener((message) => {
      if (message.type === 'EXECUTE_TIKTOK_UPLOAD') {
        const { fileUrl, title, description, tags, fileName } = message.payload;
        executeTikTokUpload(fileUrl, title || '', description || '', Array.isArray(tags) ? tags : [], fileName)
          .catch((e) => {
            console.error('[Pixiaoli TikTok] Upload failed:', e);
            browser.runtime.sendMessage({ type: 'FOREGROUND_UPLOAD_DONE' });
          });
      }
    });
  },
});

