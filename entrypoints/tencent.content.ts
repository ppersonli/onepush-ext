/**
 * 视频号发布逻辑 - 1:1 复刻 social-auto-upload/uploader/tencent_uploader/main.py
 * 流程：文件注入 → add_title_tags → add_collection → add_original → detect_upload_status → add_short_title → click_publish
 */

import { getElementByText, getElementByTextIncludingShadow } from '../utils/dom';

const CREATE_URL = 'https://channels.weixin.qq.com/platform/post/create';
const LIST_URL = 'https://channels.weixin.qq.com/platform/post/list';

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/** 短标题：6-16 字符，允许 0-9a-zA-Z 及《》“”:+?%° */
function formatShortTitle(originTitle: string): string {
  const allowedSpecial = '《》"":+?%°';
  const filtered = [...originTitle]
    .map((c) => (/\w/.test(c) || allowedSpecial.includes(c) ? c : c === ',' ? ' ' : ''))
    .join('');
  if (filtered.length > 16) return filtered.slice(0, 16);
  if (filtered.length < 6) return filtered + ' '.repeat(6 - filtered.length);
  return filtered;
}

function clickEl(el: HTMLElement) {
  try {
    el.scrollIntoView({ block: 'center', inline: 'center' });
  } catch {
    /* ignore */
  }
  el.focus?.();
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
  el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
}

/** 查找 file input：文档内 + .ant-upload 内 + shadow DOM 内 */
function findFileInput(): HTMLInputElement | null {
  const docInp = document.querySelector('input[type="file"]') as HTMLInputElement | null;
  if (docInp) return docInp;
  const uploadWrap = document.querySelector('.ant-upload');
  if (uploadWrap) {
    const inUpload = uploadWrap.querySelector('input[type="file"]') as HTMLInputElement | null;
    if (inUpload) return inUpload;
  }
  const walk = (root: Document | ShadowRoot): HTMLInputElement | null => {
    const q = root.querySelector('input[type="file"]') as HTMLInputElement | null;
    if (q) return q;
    for (const el of root.querySelectorAll('*')) {
      if (el.shadowRoot) {
        const found = walk(el.shadowRoot);
        if (found) return found;
      }
    }
    return null;
  };
  return walk(document);
}

export default defineContentScript({
  matches: ['*://channels.weixin.qq.com/*'],
  main() {
    console.log('[Pixiaoli Tencent] Content script injected (aligned with social-auto-upload).');


    /** social: add_title_tags - div.input-editor 聚焦后输入标题+Enter+话题 */
    function addTitleTags(title: string, description: string, tags: string[]) {
      const editor = document.querySelector('div.input-editor') as HTMLElement | null;
      if (!editor) {
        console.warn('[Pixiaoli Tencent] div.input-editor not found.');
        return;
      }
      editor.focus();
      const base = `${title}${description ? `\n${description}` : ''}\n`;
      document.execCommand('insertText', false, base);
      tags.forEach((tag) => {
        if (tag) document.execCommand('insertText', false, `#${tag} `);
      });
      console.log('[Pixiaoli Tencent] Added title and tags.');
    }

    /** social: add_collection - 若有可选项(>1)则点击「添加到合集」并选第一个 */
    function addCollection() {
      const addText = getElementByText('添加到合集', false);
      if (!addText) return;
      const row = addText.closest?.('div');
      const sibling = row?.nextElementSibling;
      const options = sibling?.querySelectorAll?.('.option-list-wrap > div');
      if (options && options.length > 1) {
        (sibling as HTMLElement)?.click?.();
        sleep(400).then(() => (options[0] as HTMLElement)?.click?.());
      }
    }

    /** social: add_original - 原创声明（多套 UI 兼容） */
    function addOriginal() {
      const origLabel = getElementByText('视频为原创', false);
      if (origLabel) {
        const cb = origLabel.closest?.('label')?.querySelector?.('input[type="checkbox"]') as HTMLInputElement | null;
        if (cb && !cb.checked) cb.click();
        return;
      }
      const agreeLabel = Array.from(document.querySelectorAll<HTMLElement>('label')).find((l) =>
        (l.textContent || '').includes('我已阅读并同意')
      );
      if (agreeLabel) {
        const cb = agreeLabel.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
        if (cb && !cb.checked) cb.click();
        const declareBtn = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
          (b) => (b.textContent || '').trim() === '声明原创'
        );
        if (declareBtn) declareBtn.click();
        return;
      }
      const declareCheckbox = document.querySelector(
        'div.declare-original-checkbox input.ant-checkbox-input'
      ) as HTMLInputElement | null;
      if (declareCheckbox && !declareCheckbox.disabled) {
        declareCheckbox.click();
        sleep(500).then(() => {
          const dialogCb = document.querySelector(
            'div.declare-original-dialog input.ant-checkbox-input'
          ) as HTMLInputElement | null;
          if (dialogCb && !dialogCb.checked) dialogCb.click();
          const btn = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
            (b) => (b.textContent || '').trim() === '声明原创'
          );
          if (btn) btn.click();
        });
        return;
      }
      const fallbackLabel = Array.from(document.querySelectorAll<HTMLElement>('label, div')).find(
        (el) => (el.textContent || '').includes('原创') && !(el.textContent || '').includes('不声明')
      );
      if (fallbackLabel && !fallbackLabel.className.includes('checked')) {
        (fallbackLabel as HTMLElement).click();
      }
    }

    /** social: add_short_title - 短标题 6-16 字 */
    function addShortTitle(title: string) {
      const shortLabel = getElementByText('短标题', true);
      if (!shortLabel) return;
      const parent = shortLabel.parentElement;
      const next = parent?.nextElementSibling ?? parent?.parentElement?.nextElementSibling;
      const input = next?.querySelector?.('span input[type="text"]') as HTMLInputElement | null;
      if (input) {
        input.value = formatShortTitle(title);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }

    /** social: handle_upload_error - 删除后重新上传 */
    function handleUploadError(file: File) {
      const delTag = Array.from(document.querySelectorAll<HTMLElement>('div.tag-inner')).find(
        (el) => (el.textContent || '').includes('删除')
      );
      if (delTag) delTag.click();
      sleep(400).then(() => {
        const delBtn = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
          (b) => (b.textContent || '').trim() === '删除'
        );
        if (delBtn) delBtn.click();
        sleep(600).then(() => {
          const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement | null;
          if (fileInput) {
            const dt = new DataTransfer();
            dt.items.add(file);
            fileInput.files = dt.files;
            fileInput.dispatchEvent(new Event('change', { bubbles: true }));
            console.log('[Pixiaoli Tencent] Re-uploaded after error.');
          }
        });
      });
    }

    /** 查找发表按钮：在 shadow-root 内，使用 getElementByTextIncludingShadow */
    function findPublishBtn(): HTMLElement | null {
      const publishRaw =
        getElementByTextIncludingShadow('发表', true) ?? getElementByTextIncludingShadow('发表', false);
      if (!publishRaw) return null;
      const btn = (publishRaw.closest?.('button') as HTMLButtonElement | null) ?? (publishRaw as HTMLElement);
      return btn;
    }

    /** 发表按钮是否有 weui-desktop-btn_disabled：有则不可点，需等消失 */
    function isPublishBtnDisabled(btn: HTMLElement): boolean {
      if (btn.hasAttribute('disabled')) return true;
      const cls = btn.className || '';
      return cls.includes('weui-desktop-btn_disabled') || cls.includes('ant-btn-disabled') || cls.includes('disabled');
    }

    /** 上传完成 = 发表按钮存在且 weui-desktop-btn_disabled 已消失 */
    function isUploadComplete(): boolean {
      const btn = findPublishBtn();
      return !!btn && !isPublishBtnDisabled(btn);
    }

    /** 检测上传失败需重试 */
    function hasUploadError(): boolean {
      const errMsg = document.querySelector('div.status-msg.error');
      const delTag = Array.from(document.querySelectorAll('div.media-status-content div.tag-inner')).find(
        (el) => (el.textContent || '').includes('删除')
      );
      return !!(errMsg && delTag);
    }

    /** 点击发表：等 weui-desktop-btn_disabled 消失后再点 */
    function clickPublish() {
      const btn = findPublishBtn();
      if (btn && !isPublishBtnDisabled(btn)) {
        clickEl(btn);
        console.log('[Pixiaoli Tencent] Clicked publish.');
      } else {
        console.warn('[Pixiaoli Tencent] Publish button not found or still disabled (weui-desktop-btn_disabled)', {
          found: !!btn,
          disabled: btn ? isPublishBtnDisabled(btn) : null,
        });
      }
    }

    async function runAfterUploadComplete(
      title: string,
      description: string,
      tags: string[],
      file: File
    ) {
      console.log('[Pixiaoli Tencent] runAfterUploadComplete started, polling for upload complete...');
      const start = Date.now();
      const timeout = 300_000;
      let tickCount = 0;
      while (Date.now() - start < timeout) {
        tickCount += 1;
        if (tickCount % 15 === 1) {
          console.log('[Pixiaoli Tencent] runAfterUploadComplete tick #' + tickCount, {
            isUploadComplete: isUploadComplete(),
            hasUploadError: hasUploadError(),
          });
        }
        if (hasUploadError()) {
          console.warn('[Pixiaoli Tencent] Upload error detected, retrying...');
          handleUploadError(file);
          await sleep(3000);
          continue;
        }
        if (isUploadComplete()) {
          console.log('[Pixiaoli Tencent] Upload complete.');
          addShortTitle(title);
          await sleep(800);
          clickPublish();
          browser.runtime.sendMessage({ type: 'FOREGROUND_UPLOAD_DONE' });
          return;
        }
        await sleep(2000);
      }
      console.warn('[Pixiaoli Tencent] Timeout waiting for upload complete.');
      browser.runtime.sendMessage({ type: 'FOREGROUND_UPLOAD_DONE' });
    }

    async function executeTencentUpload(
      fileBlobUrl: string,
      title: string,
      description: string,
      tags: string[],
      fileName?: string
    ) {
      console.log('[Pixiaoli Tencent] executeTencentUpload called', {
        fileUrl: fileBlobUrl?.slice?.(0, 60) + (fileBlobUrl?.length > 60 ? '...' : ''),
        title: title?.slice(0, 20),
        currentUrl: window.location.href,
      });

      try {
        console.log('[Pixiaoli Tencent] Fetching video from fileUrl...');
        const res = await fetch(fileBlobUrl);
        const blob = await res.blob();
        const file = new File(
          [blob],
          fileName && fileName.trim() ? fileName : 'video.mp4',
          { type: blob.type }
        );
        console.log('[Pixiaoli Tencent] Blob ready', { size: blob.size, type: blob.type, fileName: file.name });

        // 视频号使用 ant-upload，需先点击 .ant-upload-btn 才会出现/激活 input
        const uploadBtn = document.querySelector('.ant-upload-btn') as HTMLElement | null;
        if (uploadBtn) {
          console.log('[Pixiaoli Tencent] Clicking .ant-upload-btn to trigger upload area...');
          clickEl(uploadBtn);
          await sleep(500);
        } else {
          console.warn('[Pixiaoli Tencent] .ant-upload-btn not found');
        }

        let fileInput = findFileInput();
        console.log('[Pixiaoli Tencent] findFileInput()=', !!fileInput);

        if (fileInput) {
          const dt = new DataTransfer();
          dt.items.add(file);
          fileInput.files = dt.files;
          fileInput.dispatchEvent(new Event('change', { bubbles: true }));
          console.log('[Pixiaoli Tencent] Video file injected (immediate path). files.length=', fileInput.files?.length);

          await sleep(1500);
          addTitleTags(title, description, tags);
          await sleep(300);
          addCollection();
          await sleep(300);
          addOriginal();
          runAfterUploadComplete(title, description, tags, file);
        } else {
          console.log('[Pixiaoli Tencent] No file input yet, polling every 800ms (clicking .ant-upload-btn first)...');
          let pollCount = 0;
          const attemptUpload = setInterval(() => {
            pollCount += 1;
            if (pollCount === 3 || pollCount === 6) {
              const btn = document.querySelector('.ant-upload-btn') as HTMLElement | null;
              if (btn) clickEl(btn);
            }
            const inp = findFileInput();
            if (pollCount % 5 === 1) {
              console.log('[Pixiaoli Tencent] Poll #' + pollCount + ', findFileInput=', !!inp);
            }
            if (inp) {
              clearInterval(attemptUpload);
              const dt = new DataTransfer();
              dt.items.add(file);
              inp.files = dt.files;
              inp.dispatchEvent(new Event('change', { bubbles: true }));
              console.log('[Pixiaoli Tencent] Video file injected (delayed).');
              sleep(1500).then(() => {
                addTitleTags(title, description, tags);
                addCollection();
                addOriginal();
                runAfterUploadComplete(title, description, tags, file);
              });
            }
          }, 800);
        }
      } catch (e) {
        console.error('[Pixiaoli Tencent] Fetch video failed:', e);
        browser.runtime.sendMessage({ type: 'FOREGROUND_UPLOAD_DONE' });
      }
    }

    browser.runtime.onMessage.addListener((message) => {
      console.log('[Pixiaoli Tencent] onMessage received', { type: message.type, hasPayload: !!message.payload });
      if (message.type === 'EXECUTE_TENCENT_UPLOAD') {
        const { fileUrl, title, description, tags, fileName } = message.payload;
        console.log('[Pixiaoli Tencent] EXECUTE_TENCENT_UPLOAD payload', {
          hasFileUrl: !!fileUrl,
          fileUrlType: typeof fileUrl,
          title: title?.slice?.(0, 15),
        });
        executeTencentUpload(
          fileUrl,
          title || '',
          description || '',
          Array.isArray(tags) ? tags : [],
          fileName
        );
      }
    });
  },
});
