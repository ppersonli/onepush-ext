import { getElementByTextIncludingShadow } from '../utils/dom';

function findBodyEditor(): HTMLElement | null {
  return (
    (document.querySelector('.editor-content .tiptap.ProseMirror') as HTMLElement | null) ??
    (document.querySelector('div.tiptap.ProseMirror[contenteditable="true"]') as HTMLElement | null)
  );
}

function placeCursorAtEndOfEditor(editor: HTMLElement): void {
  editor.focus();
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  const target = editor.querySelector('p') ?? editor;
  range.selectNodeContents(target);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

function insertTextAtCursor(text: string): void {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return;
  const range = selection.getRangeAt(0);
  range.deleteContents();
  const textNode = document.createTextNode(text);
  range.insertNode(textNode);
  range.setStartAfter(textNode);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

function insertTextIntoEditor(editor: HTMLElement, text: string): void {
  placeCursorAtEndOfEditor(editor);
  document.execCommand('insertText', false, text);
  editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
}

function ensureFooterInEditor(editor: HTMLElement, footerText: string): void {
  if (editor.innerText.includes('皮小粒')) return;
  placeCursorAtEndOfEditor(editor);
  insertTextAtCursor(' ' + footerText);
  editor.dispatchEvent(new InputEvent('input', { bubbles: true }));
}

const ENTER_OPTS: KeyboardEventInit = {
  key: 'Enter',
  code: 'Enter',
  keyCode: 13,
  charCode: 13,
  bubbles: true,
  cancelable: true,
  view: window,
};

function dispatchEnter(target: Document | ShadowRoot | HTMLElement): void {
  target.dispatchEvent(new KeyboardEvent('keydown', ENTER_OPTS));
  target.dispatchEvent(new KeyboardEvent('keyup', ENTER_OPTS));
}

function dispatchGlobalEnter(editor?: HTMLElement | null): void {
  [document, document.body, document.activeElement, editor].forEach((el, i) => {
    if (el && typeof (el as HTMLElement).dispatchEvent === 'function') {
      setTimeout(() => dispatchEnter(el as Document | HTMLElement), i * 80);
    }
  });
}

function getCreatorEditorAtContainer(): HTMLElement | null {
  return document.getElementById('creator-editor-at-container');
}

function waitForCreatorAtSuggestion(targetText: string, timeoutMs = 8000): Promise<boolean> {
  return new Promise((resolve) => {
    const start = Date.now();

    const check = () => {
      const el = getCreatorEditorAtContainer();
      const text = el?.innerText ?? el?.textContent ?? '';
      return text.includes(targetText);
    };

    if (check()) return resolve(true);

    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      observer?.disconnect();
      if (timer) window.clearInterval(timer);
      resolve(ok);
    };

    const observer = new MutationObserver(() => {
      if (check()) finish(true);
      if (Date.now() - start > timeoutMs) finish(false);
    });

    const tryAttach = () => {
      const el = getCreatorEditorAtContainer();
      if (el) {
        observer.observe(el, { childList: true, subtree: true, characterData: true });
        return true;
      }
      return false;
    };

    // 兜底：容器可能稍后才出现；同时负责超时结束
    const timer = window.setInterval(() => {
      if (done) return;
      if (!tryAttach() && check()) {
        finish(true);
        return;
      }
      if (check()) {
        finish(true);
        return;
      }
      if (Date.now() - start > timeoutMs) finish(false);
    }, 120);

    // 先尝试一次 attach
    tryAttach();
  });
}

function clickElement(el: HTMLElement): void {
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

/** 发布前：点击「添加内容类型声明」，再点击「笔记含AI合成内容」 */
function ensureContentTypeAndAILabel(): void {
  const addDeclarationEl = getElementByTextIncludingShadow('添加内容类型声明', false);
  if (addDeclarationEl) {
    clickElement(addDeclarationEl);
  }
  setTimeout(() => {
    const aiLabelEl = getElementByTextIncludingShadow('笔记含AI合成内容', false);
    if (aiLabelEl) {
      clickElement(aiLabelEl);
    }
  }, 400);
}

export default defineContentScript({
  matches: ['*://creator.xiaohongshu.com/*'],
  main() {
    async function executeXhsUpload(
      fileBlobUrl: string,
      title: string,
      description: string,
      tags: string[],
      fileName?: string
    ) {
      try {
        console.log('[Pixiaoli XHS] executeXhsUpload start:', {
          fileBlobUrl,
          title,
          hasDescription: !!description,
          tagsCount: tags?.length ?? 0,
          fileName,
        });
        if (fileBlobUrl.startsWith('blob:chrome-extension://')) {
          console.log('[Pixiaoli XHS] fileBlobUrl is extension blob, requesting bytes via background...');
          const resp = await browser.runtime.sendMessage({
            type: 'PIXIAOLI_READ_EXTENSION_BLOB',
            payload: { blobUrl: fileBlobUrl },
          });
          if (!resp || resp.status !== 'ok' || typeof resp.dataUrl !== 'string' || !resp.dataUrl) {
            console.error('[Pixiaoli XHS] PIXIAOLI_READ_EXTENSION_BLOB failed:', resp);
            throw new Error('PIXIAOLI_READ_EXTENSION_BLOB failed');
          }
          console.log('[Pixiaoli XHS] Using dataUrl returned from background.');
          fileBlobUrl = resp.dataUrl;
        }

        const res = await fetch(fileBlobUrl);
        if (!res.ok) {
          console.error('[Pixiaoli XHS] fetch video failed:', fileBlobUrl, res.status, res.statusText);
          throw new Error(`fetch failed: ${res.status}`);
        }
        const blob = await res.blob();
        console.log('[Pixiaoli XHS] fetched video blob:', {
          size: blob.size,
          type: blob.type,
        });
        const file = new File([blob], fileName?.trim() ? fileName : 'video.mp4', { type: blob.type });
        const attemptUpload = setInterval(() => {
          const fileInput = document.querySelector('div[class^="upload-content"] input.upload-input') as HTMLInputElement;
          if (!fileInput) return;
          clearInterval(attemptUpload);
          const dataTransfer = new DataTransfer();
          dataTransfer.items.add(file);
          fileInput.files = dataTransfer.files;
          fileInput.dispatchEvent(new Event('change', { bubbles: true }));
          setTimeout(() => fillMetadata(title, description, tags), 5000);
        }, 1000);
      } catch (e) {
        console.error('[Pixiaoli XHS] executeXhsUpload error:', e);
        // 不再在失败时立刻上报 FOREGROUND_UPLOAD_DONE，避免页面秒关，看不到错误
      }
    }

    async function fillMetadata(title: string, description: string, tags: string[]) {
      try {
        const titleInput =
          document.querySelector('input.d-text') || document.querySelector('.title-container input');
        if (titleInput && titleInput instanceof HTMLInputElement) {
          titleInput.value = title;
          titleInput.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
          const fallback = document.querySelector('.title-container .notranslate') as HTMLElement | null;
          if (fallback) {
            fallback.focus();
            document.execCommand('insertText', false, `${title} `);
          }
        }

        const bodyEditor = findBodyEditor();
        const footerText = '如何制作爆款漫画请看@皮小粒';
        if (bodyEditor) {
          if (description) insertTextIntoEditor(bodyEditor, description + '\n');
          const footerHtml =
            '如何制作爆款漫画请看<a class="tiptap-at" data-user=\'{"userId":"69a572c9000000001d01b51c","nickname":"皮小粒"}\' contenteditable="false">@皮小粒</a>';
          try {
            placeCursorAtEndOfEditor(bodyEditor);
            document.execCommand('insertHTML', false, footerHtml);
            bodyEditor.dispatchEvent(new InputEvent('input', { bubbles: true }));
          } catch {
            insertTextIntoEditor(bodyEditor, footerText);
          }
          insertTextIntoEditor(bodyEditor, ' ');
          tags.forEach((tag, index) => {
            setTimeout(() => insertTextIntoEditor(bodyEditor, `#${tag} `), index * 800);
          });
          setTimeout(() => ensureFooterInEditor(bodyEditor, footerText), 300);
          setTimeout(async () => {
            await waitForCreatorAtSuggestion('皮小粒', 8000);
            dispatchGlobalEnter(bodyEditor);
          }, 2000);
        }
      } catch {
        /* ignore */
      }
    }

    function isPublishButtonEnabled(btn: HTMLButtonElement): boolean {
      return !btn.disabled && !btn.classList.contains('disabled');
    }

    function findPublishButton(): HTMLButtonElement | null {
      const publishEl = getElementByTextIncludingShadow('发布', false);
      if (!publishEl) return null;
      let btn: HTMLButtonElement | null =
        publishEl.tagName === 'BUTTON'
          ? (publishEl as HTMLButtonElement)
          : (publishEl.closest?.('button') as HTMLButtonElement | null) ?? null;
      if (!btn) {
        const root = publishEl.getRootNode() as Document | ShadowRoot;
        btn =
          (Array.from(root.querySelectorAll?.('button') ?? []).find((b) =>
            (b as HTMLElement).textContent?.includes('发布')
          ) as HTMLButtonElement) ?? null;
      }
      return btn;
    }

    function startPublishButtonWatcher(): void {
      const interval = setInterval(() => {
        const publishBtn = findPublishButton();
        if (!publishBtn || !isPublishButtonEnabled(publishBtn)) return;
        clearInterval(interval);
        // 发布前：先点「添加内容类型声明」再点「笔记含AI合成内容」
        ensureContentTypeAndAILabel();
        setTimeout(() => {
          clickElement(publishBtn);
          setTimeout(() => browser.runtime.sendMessage({ type: 'FOREGROUND_UPLOAD_DONE' }), 3000);
        }, 800);
      }, 2000);
    }

    browser.runtime.onMessage.addListener((message: { type: string; payload?: unknown }) => {
      if (message.type !== 'EXECUTE_XHS_UPLOAD') return;
      const { fileUrl, title, description, tags, fileName } = (message.payload as Record<string, unknown>) || {};
      startPublishButtonWatcher();
      executeXhsUpload(
        String(fileUrl ?? ''),
        String(title ?? ''),
        String(description ?? ''),
        Array.isArray(tags) ? (tags as string[]) : [],
        fileName as string | undefined
      );
    });
  },
});
