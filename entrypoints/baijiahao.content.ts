
import { getElementByText } from '../utils/dom';

export default defineContentScript({
  matches: ['*://baijiahao.baidu.com/*'],
  main() {
    console.log('[Pixiaoli Baijiahao] Content script injected.');

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

    async function executeBaijiahaoUpload(fileBlobUrl: string, title: string, description: string, tags: string[], fileName?: string) {
      console.log('[Pixiaoli Baijiahao] Starting upload process...');
      
      try {
        const res = await fetch(fileBlobUrl);
        const blob = await res.blob();
        const file = new File([blob], fileName && fileName.trim() ? fileName : "video.mp4", { type: blob.type });
        
        const attemptUpload = setInterval(() => {
          const fileInput = document.querySelector('div[class^="video-main-container"] input[type="file"]') as HTMLInputElement 
                         || document.querySelector('input[type="file"]') as HTMLInputElement;
          if (fileInput) {
            console.log('[Pixiaoli Baijiahao] Found file input. Injecting video file...');
            clearInterval(attemptUpload);
            
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            fileInput.files = dataTransfer.files;
            
            fileInput.dispatchEvent(new Event('change', { bubbles: true }));
            
            setTimeout(() => fillMetadata(title, description, tags), 5000);
          }
        }, 1000);
      } catch (e) {
        console.error('[Pixiaoli Baijiahao] Fetch video failed:', e);
      }
    }
    
    function fillMetadata(title: string, description: string, tags: string[]) {
      console.log('[Pixiaoli Baijiahao] Filling metadata...', title, tags);
      
      const titleInputs = Array.from(document.querySelectorAll('input.bjh-input, input[placeholder*="标题"]'));
      if (titleInputs.length > 0) {
        const titleInput = titleInputs[0] as HTMLInputElement;
        titleInput.value = title;
        titleInput.dispatchEvent(new Event('input', { bubbles: true }));
      }

      // 百家号的“简介/内容”输入在不同版本里位置不一致，这里尽量把正文插入到可编辑区域（若存在）。
      const descEditor =
        (document.querySelector('textarea[placeholder*="简介"]') as HTMLTextAreaElement | null) ||
        (document.querySelector('textarea') as HTMLTextAreaElement | null);
      if (descEditor && description) {
        descEditor.value = description;
        descEditor.dispatchEvent(new Event('input', { bubbles: true }));
      }
      
      const tagInput = document.querySelector('input[placeholder*="标签"]') || document.querySelector('.tag-input');
      if (tagInput && tagInput instanceof HTMLInputElement) {
        tags.forEach(tag => {
          tagInput.value = tag;
          tagInput.dispatchEvent(new Event('input', { bubbles: true }));
          tagInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
        });
      }

      monitorUploadAndPublish();
    }
    
    function monitorUploadAndPublish() {
      const interval = setInterval(() => {
        const docText = document.body.innerText;
        
        if (docText.includes('上传失败')) {
           console.error('[Pixiaoli Baijiahao] Upload failed');
           clearInterval(interval);
           browser.runtime.sendMessage({ type: 'FOREGROUND_UPLOAD_DONE' });
           return;
        }

        // 上传过程会出现“上传中，请勿离开...”提示；只有该提示消失后才尝试发布
        const uploadingHint = getElementByText('上传中，请勿离开...', false);
        const isUploading = !!(uploadingHint && uploadingHint.offsetParent !== null);
        console.log(isUploading, docText.includes('正在上传'), 999)

        if (!isUploading && !docText.includes('正在上传') && !docText.includes('上传中')) {
          // 优先用 data-testid 精准定位百家号发布按钮：
          // <button data-testid="publish-btn">...<span>发布</span></button>
          const byTestId = document.querySelector('button[data-testid="publish-btn"]') as HTMLButtonElement | null;

          // fallback：使用文本搜索来找“发布”相关按钮，兼容“发布”、“立即发布”等文案变化
          const raw =
            byTestId ||
            getElementByText('立即发布', true) ||
            getElementByText('发布', true);

          const publishBtn = raw
            ? ((raw.closest?.('button, div[role="button"], a') as HTMLElement | null) ?? raw)
            : null;
          
          if (publishBtn && publishBtn.offsetParent !== null) {
            // 监听 disabled -> enabled：只有可点击时才发布
            if (isDisabled(publishBtn)) {
              return;
            }
            console.log('[Pixiaoli Baijiahao] Publish button enabled. Clicking publish...');
            clearInterval(interval);
            setTimeout(() => {
              publishBtn.click();
              setTimeout(() => browser.runtime.sendMessage({ type: 'FOREGROUND_UPLOAD_DONE' }), 2000);
            }, 3000);
          }
        }
      }, 2000);
    }

    browser.runtime.onMessage.addListener((message) => {
      if (message.type === 'EXECUTE_BAIJIAHAO_UPLOAD') {
        const { fileUrl, title, description, tags, fileName } = message.payload;
        executeBaijiahaoUpload(fileUrl, title || '', description || '', Array.isArray(tags) ? tags : [], fileName);
      }
    });

  },
});
