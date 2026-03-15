import { getElementByText } from '../utils/dom';

export default defineContentScript({
  matches: ['*://creator.douyin.com/*'],
  main() {
    console.log('[Pixiaoli Douyin] Content script injected.');

    const UPLOAD_URL = 'https://creator.douyin.com/creator-micro/content/upload';
    const PUBLISH_URL_V1 = 'https://creator.douyin.com/creator-micro/content/publish?enter_from=publish_page';
    const PUBLISH_URL_V2 = 'https://creator.douyin.com/creator-micro/content/post/video?enter_from=publish_page';
    let currentTaskThumbnailUrl = '';
    let thumbnailAppliedForCurrentTask = false;

    function sleep(ms: number) {
      return new Promise<void>((resolve) => setTimeout(resolve, ms));
    }

    function isDisabledButton(el: HTMLElement) {
      const anyEl = el as any;
      const ariaDisabled = (el.getAttribute('aria-disabled') || '').toLowerCase();
      return (
        el.hasAttribute('disabled') ||
        ariaDisabled === 'true' ||
        el.className.includes('disabled') ||
        anyEl?.disabled === true
      );
    }

    function findTitleInput(): HTMLInputElement | null {
      // 对齐 social-auto-upload：优先按“作品标题”文案定位到其右侧 input
      const titleLabel = Array.from(document.querySelectorAll<HTMLElement>('div, label, span, p'))
        .find((el) => (el.textContent || '').trim() === '作品标题');
      if (titleLabel) {
        const parent = titleLabel.parentElement;
        const maybeRow = parent?.parentElement ?? parent;
        const sibling = maybeRow?.nextElementSibling as HTMLElement | null;
        const input = sibling?.querySelector('input') as HTMLInputElement | null;
        if (input) return input;
      }
      // fallback: 旧逻辑/编辑器
      const notranslate = document.querySelector('.notranslate') as HTMLInputElement | null;
      if (notranslate && (notranslate as any).tagName?.toLowerCase() === 'input') return notranslate;
      return document.querySelector('input[placeholder*="标题"], input[placeholder*="作品"]') as HTMLInputElement | null;
    }

    function fillTagsIntoZone(tags: string[]) {
      const zone = document.querySelector('.zone-container') as HTMLElement | null;
      if (!zone) return;
      zone.focus();
      tags.forEach((tag) => {
        if (!tag) return;
        document.execCommand('insertText', false, `#${tag} `);
      });
    }

    async function waitForPublishPage(timeoutMs = 60_000) {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        const href = window.location.href;
        if (href === PUBLISH_URL_V1 || href === PUBLISH_URL_V2) return true;
        await sleep(500);
      }
      return false;
    }

    async function waitForVisibleModal(timeoutMs = 60_000) {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        const modal = document.querySelector<HTMLElement>('div[class*="modal"]');
        if (modal && modal.offsetParent !== null) return true;
        await sleep(200);
      }
      return false;
    }

    async function waitForChooseCoverButton(timeoutMs = 60_000) {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        const raw = getElementByText('选择封面', false);
        if (raw && raw.offsetParent !== null) {
          const clickable = (raw.closest?.('button, div[role="button"], a') as HTMLElement | null) ?? raw;
          if (clickable.offsetParent !== null) return clickable;
        }
        await sleep(200);
      }
      return null;
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
      // 比直接 el.click() 更接近真实用户行为，且更容易触发站点绑定的鼠标事件
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    }

    async function setThumbnail() {
      // 抖音可智能截取封面：这里只需要严格按流程点击按钮，确保弹窗与“完成”都执行到位。
      console.log('[Pixiaoli Douyin] Setting thumbnail (click-only)...');

      // 1) 等待并点击 "选择封面"（严格对齐 playwright：await page.click('text="选择封面"')）
      const pickBtn = await waitForChooseCoverButton(60_000);
      if (!pickBtn) {
        console.warn('[Pixiaoli Douyin] Timeout waiting for "选择封面" button.');
        return false;
      }
      clickElement(pickBtn);

      // 2) wait for modal visible
      const modalOk = await waitForVisibleModal(60_000);
      if (!modalOk) {
        console.warn('[Pixiaoli Douyin] Timeout waiting for cover modal.');
        return false;
      }

      // 3) 弹窗展示出来后，等待 3s 再点击“完成”（抖音会自动选择推荐封面）
      await sleep(3000);
      const start = Date.now();
      while (Date.now() - start < 60_000) {
        const doneRaw = getElementByText('完成', true);
        const doneBtn = doneRaw
          ? ((doneRaw.closest?.('button') as HTMLButtonElement | null) ?? (doneRaw as any as HTMLButtonElement))
          : null;
        if (doneBtn && doneBtn.offsetParent !== null && !isDisabledButton(doneBtn)) {
          // 等 2 秒再点，确保抖音内部封面选择逻辑完成
          await sleep(2000);
          clickElement(doneBtn);
          console.log('[Pixiaoli Douyin] Thumbnail set done.');
          return true;
        }
        await sleep(200);
      }
      console.warn('[Pixiaoli Douyin] Timeout waiting for enabled "完成" button in modal.');
      return false;
    }

    async function ensureThumbnailAppliedStrict(timeoutMs = 120_000) {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        const ok = await setThumbnail();
        if (ok) return true;
        // 若失败，短暂等待后重试（严格保证：未成功不进入发布）
        await sleep(800);
      }
      return false;
    }

    function handleAutoCoverIfNeeded() {
      // 对齐 social-auto-upload：出现“请设置封面后再发布”则选择推荐封面第一个并确认
      const needCover = Array.from(document.querySelectorAll<HTMLElement>('div, span, p'))
        .some((el) => (el.textContent || '').includes('请设置封面后再发布') && el.offsetParent !== null);
      if (!needCover) return false;

      const recommend = document.querySelector<HTMLElement>('[class^="recommendCover-"]');
      if (recommend) {
        recommend.click();
        const okBtn = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
          .find((b) => (b.textContent || '').trim() === '确定');
        if (okBtn && !isDisabledButton(okBtn)) okBtn.click();
        return true;
      }
      return false;
    }

    async function clickPublishUntilSuccess(timeoutMs = 90_000) {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        const href = window.location.href;
        if (href.startsWith('https://creator.douyin.com/creator-micro/content/manage')) {
          console.log('[Pixiaoli Douyin] Detected manage page. Publish success.');
          return true;
        }

        const publishRaw = getElementByText('发布', true);
        const publishBtn = publishRaw
          ? ((publishRaw.closest?.('button') as HTMLButtonElement | null) ?? (publishRaw as any as HTMLButtonElement))
          : null;
        if (publishBtn && !isDisabledButton(publishBtn)) {
          clickElement(publishBtn);
          console.log('[Pixiaoli Douyin] Clicked publish button.');
          await sleep(800);
        } else {
          // 没找到可点的发布按钮时，尝试处理封面提示后再继续
          const coverHandled = handleAutoCoverIfNeeded();
          if (coverHandled) {
            console.log('[Pixiaoli Douyin] Cover handled, will retry publish...');
            await sleep(1200);
          } else {
            await sleep(500);
          }
        }
      }
      return false;
    }

    async function executeDouyinUpload(fileBlobUrl: string, title: string, description: string, tags: string[], fileName?: string) {
      console.log('[Pixiaoli Douyin] Starting upload process...');
      
      const res = await fetch(fileBlobUrl);
      const blob = await res.blob();
      const file = new File([blob], fileName && fileName.trim() ? fileName : "video.mp4", { type: blob.type });
      
      const attemptUpload = setInterval(() => {
        const fileInput = document.querySelector('div[class^="container"] input[type="file"]') as HTMLInputElement;
        if (fileInput) {
          console.log('[Pixiaoli Douyin] Found file input. Injecting video file...');
          clearInterval(attemptUpload);
          
          const dataTransfer = new DataTransfer();
          dataTransfer.items.add(file);
          fileInput.files = dataTransfer.files;
          
          fileInput.dispatchEvent(new Event('change', { bubbles: true }));

          // 等待从 upload 页跳转到 publish 页（抖音有两套 URL）
          (async () => {
            const ok = await waitForPublishPage();
            if (!ok) {
              console.warn('[Pixiaoli Douyin] Timeout waiting for publish page. Current url=', window.location.href);
            }
            await sleep(800);
            fillMetadata(title, description, tags);
          })().catch((e) => console.error('[Pixiaoli Douyin] waitForPublishPage failed:', e));
        }
      }, 1000);
    }
    
    /** 在 root 中查找包含 searchText 且不在 excludeContainer 内的可见元素（用于排除编辑区内同名文案） */
    function findTextOutside(searchText: string, root: Document | HTMLElement, excludeContainer: HTMLElement): HTMLElement | null {
      const start = root instanceof Document ? root.body : root;
      if (!start) return null;
      const walker = document.createTreeWalker(start, NodeFilter.SHOW_TEXT);
      let node: Text | null = walker.nextNode() as Text | null;
      while (node) {
        if ((node.nodeValue || '').includes(searchText)) {
          const el = (node.parentElement as HTMLElement | null);
          if (el && el.offsetParent && !excludeContainer.contains(el)) return el;
        }
        node = walker.nextNode() as Text | null;
      }
      return null;
    }

    /** 皮小粒账号唯一 ID，用于在 @ 弹窗中精确命中选项（避免重名） */
    const PIXIAOLI_USER_ID = '63976171428';

    /** 返回 @ 提及下拉中文案包含指定 ID 的可点击元素（不在 zone 内、可见） */
    function findMentionOptionByUserId(zone: HTMLElement, userId: string): HTMLElement | null {
      const el = findTextOutside(userId, document, zone);
      if (!el) return null;
      const clickable = el.closest?.('li, [role="option"], div[class*="item"], div[class*="option"], a') as HTMLElement | null;
      return (clickable && clickable.offsetParent ? clickable : el) as HTMLElement;
    }

    /** 在 zone 内模拟输入单个字符（先键盘事件再 insertText），确保平台能识别并保留 @ */
    function typeCharInZone(zone: HTMLElement, char: string) {
      zone.focus();
      const sel = window.getSelection();
      if (sel) {
        const range = document.createRange();
        range.selectNodeContents(zone);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      }
      const keyOpt = { key: char, code: char === '@' ? 'Digit2' : '', keyCode: char.charCodeAt(0), which: char.charCodeAt(0), bubbles: true };
      zone.dispatchEvent(new KeyboardEvent('keydown', keyOpt));
      zone.dispatchEvent(new KeyboardEvent('keypress', { ...keyOpt, charCode: char.charCodeAt(0) }));
      document.execCommand('insertText', false, char);
      zone.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: char, bubbles: true }));
    }

    /** 正文末尾固定文案：通过平台原生 @ 流程插入，生成可点击跳转的引用。必须先输入 @ 再输入皮小粒才能唤起选择用户弹窗。 */
    async function appendFixedSuffixToZone(zone: HTMLElement): Promise<void> {
      const prefix = ' 如何快速制作爆款漫画请看 ';
      const mentionKeyword = '皮小粒';

      function moveCaretToEnd() {
        const sel = window.getSelection();
        if (!sel) return;
        const range = document.createRange();
        range.selectNodeContents(zone);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      }

      moveCaretToEnd();
      zone.focus();
      document.execCommand('insertText', false, prefix);
      await sleep(150);
      // 先输入 @：保证焦点与光标在 zone 末尾，并用键盘事件+insertText 确保 @ 被写入且唤起弹窗
      typeCharInZone(zone, '@');
      await sleep(500);
      moveCaretToEnd();
      zone.focus();
      for (let i = 0; i < mentionKeyword.length; i++) {
        document.execCommand('insertText', false, mentionKeyword[i]);
        await sleep(120);
      }
      await sleep(400);

      const timeoutMs = 5000;
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        const option = findMentionOptionByUserId(zone, PIXIAOLI_USER_ID);
        if (option) {
          clickElement(option);
          console.log('[Pixiaoli Douyin] Mention option (ID %s) clicked.', PIXIAOLI_USER_ID);
          return;
        }
        await sleep(200);
      }
      console.warn('[Pixiaoli Douyin] Mention dropdown (ID %s) not found, suffix text already in zone.', PIXIAOLI_USER_ID);
    }

    function fillMetadata(title: string, description: string, tags: string[]) {
      console.log('[Pixiaoli Douyin] Filling metadata...', title, tags);
      const t = (title || '').trim().slice(0, 30);
      const d = (description || '').trim();
      const titleInput = findTitleInput();
      if (titleInput) {
        titleInput.focus();
        titleInput.value = t;
        titleInput.dispatchEvent(new Event('input', { bubbles: true }));
        titleInput.dispatchEvent(new Event('change', { bubbles: true }));
      }

      // 抖音的话题/正文通常在 zone-container 中输入；对齐 social-auto-upload：主要写话题
      const zone = document.querySelector('.zone-container') as HTMLElement | null;
      if (zone) {
        zone.focus();
        if (d) {
          document.execCommand('insertText', false, `${d}\n`);
        }
        // 正文末尾固定文案：通过平台原生 @ 流程插入可点击跳转的 @皮小粒
        (async () => {
          await appendFixedSuffixToZone(zone);
          fillTagsIntoZone(Array.isArray(tags) ? tags : []);
          monitorUploadAndPublish();
        })().catch((e) => {
          console.error('[Pixiaoli Douyin] appendFixedSuffixToZone failed:', e);
          fillTagsIntoZone(Array.isArray(tags) ? tags : []);
          monitorUploadAndPublish();
        });
        return;
      }
      fillTagsIntoZone(Array.isArray(tags) ? tags : []);
      monitorUploadAndPublish();
    }
    
    function monitorUploadAndPublish() {
      const interval = setInterval(() => {
        const docText = document.body.innerText;
        if (docText.includes('重新上传') || docText.includes('上传完成')) {
          console.log('[Pixiaoli Douyin] Upload complete. Clicking publish...');
          clearInterval(interval);
          (async () => {
            // 严格流程：只要传了 thumbnailUrl，就必须等封面设置成功后再发布
            // 抖音智能截取封面，但仍需点击“选择封面/设置竖封面/完成”才能发布：严格等待每一步成功。
            if (!thumbnailAppliedForCurrentTask) {
              const applied = await ensureThumbnailAppliedStrict(120_000);
              thumbnailAppliedForCurrentTask = applied;
              if (!applied) {
                console.error('[Pixiaoli Douyin] Thumbnail not confirmed within timeout. Abort publish.');
                return;
              }
              await sleep(800);
            }

            const ok = await clickPublishUntilSuccess();
            if (!ok) console.warn('[Pixiaoli Douyin] Publish may not have succeeded (timeout).');
            browser.runtime.sendMessage({ type: 'FOREGROUND_UPLOAD_DONE' });
          })().catch((e) => {
            console.error('[Pixiaoli Douyin] Publish failed:', e);
            browser.runtime.sendMessage({ type: 'FOREGROUND_UPLOAD_DONE' });
          });
        } else if (docText.includes('上传失败')) {
           console.error('[Pixiaoli Douyin] Upload failed detected on page.');
           clearInterval(interval);
           browser.runtime.sendMessage({ type: 'FOREGROUND_UPLOAD_DONE' });
        }
      }, 2000);
    }

    browser.runtime.onMessage.addListener((message) => {
      if (message.type === 'EXECUTE_DOUYIN_UPLOAD') {
        const { fileUrl, title, description, tags, fileName, thumbnailUrl } = message.payload;
        // 若不在上传页，先跳转；对齐 social-auto-upload：固定从 upload 入口开始
        if (window.location.href !== UPLOAD_URL) {
          try {
            window.location.href = UPLOAD_URL;
          } catch {
            // ignore
          }
        }
        currentTaskThumbnailUrl = typeof thumbnailUrl === 'string' ? thumbnailUrl : '';
        thumbnailAppliedForCurrentTask = false;
        executeDouyinUpload(fileUrl, title || '', description || '', Array.isArray(tags) ? tags : [], fileName);
      }
    });

  },
});
