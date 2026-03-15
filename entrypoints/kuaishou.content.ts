
import { getElementByTextIncludingShadow } from '../utils/dom';

export default defineContentScript({
  matches: ['*://cp.kuaishou.com/*'],
  main() {
    console.log('[Pixiaoli Kuaishou] Content script injected.');

    function normalizeUiText(s: string): string {
      return (s || '').replace(/\s+/g, ' ').trim();
    }

    function isElementVisible(el: HTMLElement): boolean {
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }

    function findExactPublishButton(): HTMLElement | null {
      const candidates = Array.from(document.querySelectorAll('button,[role="button"]')) as HTMLElement[];
      for (const el of candidates) {
        const txt = normalizeUiText((el as HTMLElement).innerText || el.textContent || '');
        if (txt !== '发布') continue;
        const anyEl = el as any;
        if (anyEl && typeof anyEl.disabled === 'boolean' && anyEl.disabled) continue;
        if (!isElementVisible(el)) continue;
        return el;
      }
      return null;
    }

    async function executeKuaishouUpload(fileBlobUrl: string, title: string, description: string, tags: string[], fileName?: string) {
      console.log('[Pixiaoli Kuaishou] Starting upload process...');
      
      try {
        const res = await fetch(fileBlobUrl);
        const blob = await res.blob();
        const file = new File([blob], fileName && fileName.trim() ? fileName : "video.mp4", { type: blob.type });
        
        const attemptUpload = setInterval(() => {
          const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
          if (fileInput) {
            console.log('[Pixiaoli Kuaishou] Found file input. Injecting video file...');
            clearInterval(attemptUpload);
            
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            fileInput.files = dataTransfer.files;
            
            fileInput.dispatchEvent(new Event('change', { bubbles: true }));
            
            setTimeout(() => fillMetadata(title, description, tags), 4000);
          }
        }, 1000);
      } catch (e) {
        console.error('[Pixiaoli Kuaishou] Fetch video failed:', e);
      }
    }
    
    /** 正文末尾固定文案：如何快速制作爆款漫画请看 @皮小粒。先尝试插入 HTML 结构，失败则回退纯文本 */
    const FIXED_SUFFIX_PLAIN = ' 如何快速制作爆款漫画请看 @皮小粒';
    const FIXED_SUFFIX_HTML = ` 如何快速制作爆款漫画请看 <span is-tag="true"><span class="at-user-item" data-user-id="18531546" data-user-name="皮小粒">@皮小粒</span></span>`;

    function appendFixedSuffixToEditor(editor: HTMLElement) {
      function moveCaretToEnd() {
        const sel = window.getSelection();
        if (!sel) return;
        const range = document.createRange();
        range.selectNodeContents(editor);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      }
      moveCaretToEnd();
      editor.focus();
      try {
        document.execCommand('insertHTML', false, FIXED_SUFFIX_HTML);
      } catch {
        document.execCommand('insertText', false, FIXED_SUFFIX_PLAIN);
      }
    }

    /** 作品描述编辑器：优先用 id，再回退旧版 Draft 选择器 */
    function findDescriptionEditor(): HTMLElement | null {
      const byId = document.querySelector('#work-description-edit') as HTMLElement | null;
      if (byId && byId.getAttribute?.('contenteditable') === 'true') return byId;
      return document.querySelector('.DraftEditor-root [contenteditable="true"]') as HTMLElement | null;
    }

    function fillMetadata(title: string, description: string, tags: string[]) {
      console.log('[Pixiaoli Kuaishou] Filling metadata...', title, tags);
      
      const editor = findDescriptionEditor();
      if (editor) {
        editor.focus();
        const base = `${title}${description ? `\n${description}` : ''} `;
        document.execCommand('insertText', false, base);

        appendFixedSuffixToEditor(editor);
        
        tags.slice(0, 3).forEach(tag => {
           document.execCommand('insertText', false, `#${tag} `);
        });
      } else {
        console.warn('[Pixiaoli Kuaishou] Description editor #work-description-edit not found.');
      }
      
      monitorUploadAndPublish();
    }
    
    function monitorUploadAndPublish() {
      const interval = setInterval(() => {
        const docText = document.body.innerText;
        
        if (!docText.includes('上传中')) {
          const publishEl = getElementByTextIncludingShadow('发布', true);
          const publishBtnFromText = (publishEl?.closest('button,[role="button"]') as HTMLElement | null) ?? publishEl;
          const publishBtn =
            publishBtnFromText && normalizeUiText(publishBtnFromText.innerText || publishBtnFromText.textContent || '') === '发布'
              ? publishBtnFromText
              : findExactPublishButton();
          
          if (publishBtn) {
             console.log('[Pixiaoli Kuaishou] Upload complete. Waiting 2s then clicking publish...');
             clearInterval(interval);
             setTimeout(() => {
               publishBtn.click();
               setTimeout(() => {
                 const confirmEl = getElementByTextIncludingShadow('确认发布');
                 const confirmBtn = confirmEl?.closest('button') ?? confirmEl;
                 confirmBtn?.click();
               }, 1000);
               setTimeout(() => browser.runtime.sendMessage({ type: 'FOREGROUND_UPLOAD_DONE' }), 3000);
             }, 2000);
          }
        }
      }, 2000);
    }

    browser.runtime.onMessage.addListener((message) => {
      if (message.type === 'EXECUTE_KUAISHOU_UPLOAD') {
        const { fileUrl, title, description, tags, fileName } = message.payload;
        executeKuaishouUpload(fileUrl, title || '', description || '', Array.isArray(tags) ? tags : [], fileName);
      }
    });

  },
});
