
import { getElementByText } from '../utils/dom';

export default defineContentScript({
  matches: ['*://member.bilibili.com/*'],
  main() {
    console.log('[Pixiaoli Bilibili] Content script injected.');

    async function executeBilibiliUpload(fileBlobUrl: string, title: string, description: string, tags: string[], fileName?: string) {
      console.log('[Pixiaoli Bilibili] Starting upload process...');
      
      try {
        const res = await fetch(fileBlobUrl);
        const blob = await res.blob();
        const file = new File([blob], fileName && fileName.trim() ? fileName : "video.mp4", { type: blob.type });
        
        const attemptUpload = setInterval(() => {
          const fileInput = document.querySelector('input[type="file"][accept*="video"]') as HTMLInputElement
                         || document.querySelector('input[type="file"]') as HTMLInputElement;
          if (fileInput) {
            console.log('[Pixiaoli Bilibili] Found file input. Injecting video file...');
            clearInterval(attemptUpload);
            
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            fileInput.files = dataTransfer.files;
            
            fileInput.dispatchEvent(new Event('change', { bubbles: true }));
            
            setTimeout(() => fillMetadata(title, description, tags), 5000);
          }
        }, 1000);
      } catch (e) {
        console.error('[Pixiaoli Bilibili] Fetch video failed:', e);
        browser.runtime.sendMessage({ type: 'FOREGROUND_UPLOAD_DONE' });
      }
    }
    
    function fillMetadata(title: string, description: string, tags: string[]) {
      console.log('[Pixiaoli Bilibili] Filling metadata...', title, tags);
      
      const titleInput = document.querySelector('.video-title .input-val') as HTMLInputElement || document.querySelector('input[placeholder*="标题"]') as HTMLInputElement;
      if (titleInput) {
        titleInput.value = title;
        titleInput.dispatchEvent(new Event('input', { bubbles: true }));
      }

      const descInput =
        (document.querySelector('textarea[placeholder*="简介"]') as HTMLTextAreaElement | null) ||
        (document.querySelector('textarea') as HTMLTextAreaElement | null);
      if (descInput && description) {
        descInput.value = description;
        descInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
      
      const tagInput = document.querySelector('input[placeholder*="按回车键Enter创建标签"]') as HTMLInputElement;
      if (tagInput) {
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
        const hasUploaded = !!(getElementByText('上传成功', false) || getElementByText('上传完成', false));
        const coverReady = !!getElementByText('智能封面已生成', false);

        // 只有在“上传成功/完成”且“智能封面已生成”后，才允许点击“立即投稿”
        if (hasUploaded && coverReady) {
          const publishRaw = getElementByText('立即投稿', true);
          const publishBtn = publishRaw
            ? ((publishRaw.closest?.('button, div[role="button"], a') as HTMLElement | null) ?? publishRaw)
            : null;
          
          if (publishBtn && publishBtn.offsetParent !== null) {
             console.log('[Pixiaoli Bilibili] Upload & smart cover ready. Clicking publish...');
             clearInterval(interval);
             (publishBtn as HTMLElement).click();
             setTimeout(() => browser.runtime.sendMessage({ type: 'FOREGROUND_UPLOAD_DONE' }), 3000);
          }
        }
      }, 2000);
    }

    browser.runtime.onMessage.addListener((message) => {
      if (message.type === 'EXECUTE_BILIBILI_UPLOAD') {
        const { fileUrl, title, description, tags, fileName } = message.payload;
        executeBilibiliUpload(fileUrl, title || '', description || '', Array.isArray(tags) ? tags : [], fileName);
      }
    });

  },
});
