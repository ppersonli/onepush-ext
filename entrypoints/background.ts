import type {
  VideoPublishTask,
  ExtensionMessage,
  PublishStatusUpdatePayload,
  PlatformId,
} from '../utils/types';

const PLATFORM_URLS: Record<string, string> = {
  'douyin': 'https://creator.douyin.com/creator-micro/content/upload',
  'xhs': 'https://creator.xiaohongshu.com/publish/publish?from=homepage&target=video',
  'tencent': 'https://channels.weixin.qq.com/platform/post/create',
  'kuaishou': 'https://cp.kuaishou.com/article/publish/video',
  'baijiahao': 'https://baijiahao.baidu.com/builder/rc/edit?type=videoV2',
  'bilibili': 'https://member.bilibili.com/platform/upload/video/frame',
  'tiktok': 'https://www.tiktok.com/tiktokstudio/upload?lang=en'
};

export default defineBackground(() => {
  console.log('[Pixiaoli] Background service worker started.');

  const tasksStore: Record<string, VideoPublishTask> = {};
  const tabPlatformMap: Record<number, { platform: PlatformId; taskId: string }> = {};
  let foregroundDoneResolver: { tabId: number; resolve: () => void; timerId: ReturnType<typeof setTimeout> } | null = null;

  const AUDIO_KEY = 'pixiaoli:audio';
  const SETTINGS_KEY = 'pixiaoli:settings';
  const VIDEO_PLATFORMS_KEY = 'pixiaoli:video-platforms';
  const PUBLISH_PLATFORMS_REQUEST_TIMEOUT_MS = 5000;

  function arrayBufferToBase64(buf: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i += 1) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  function waitForPlatformsFromOffscreen(): Promise<PlatformId[]> {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    return new Promise<PlatformId[]>((resolve) => {
      let settled = false;
      const done = (platforms: PlatformId[]) => {
        if (settled) return;
        settled = true;
        try {
          browser.runtime.onMessage.removeListener(listener);
        } catch {
          // ignore
        }
        clearTimeout(timer);
        console.log('[Pixiaoli BG] Offscreen returned platforms:', platforms);
        resolve(platforms);
      };

      const listener = (msg: any) => {
        if (msg?.type !== 'VIDEO_PLATFORMS_FROM_LOCALSTORAGE') return;
        const rid = msg?.payload?.requestId as string | undefined;
        if (!rid || rid !== requestId) return;
        const arr = msg?.payload?.platforms;
        const platforms = Array.isArray(arr) ? (arr.filter((x: any) => typeof x === 'string') as PlatformId[]) : [];
        done(platforms);
      };

      const timer = setTimeout(() => {
        console.warn('[Pixiaoli BG] Offscreen platforms request timeout.');
        done([]);
      }, PUBLISH_PLATFORMS_REQUEST_TIMEOUT_MS);
      try {
        browser.runtime.onMessage.addListener(listener);
      } catch {
        // ignore
      }

      setupOffscreenDocument('offscreen.html')
        .then(() => {
          console.log('[Pixiaoli BG] Requesting platforms from offscreen localStorage...');
          browser.runtime.sendMessage({
            type: 'GET_VIDEO_PLATFORMS_FROM_LOCALSTORAGE',
            payload: { requestId, key: VIDEO_PLATFORMS_KEY },
          }).catch(() => done([]));
        })
        .catch(() => done([]));
    });
  }

  async function setupOffscreenDocument(path: string) {
    if (await browser.offscreen.hasDocument()) return;
    await browser.offscreen.createDocument({
      url: path,
      reasons: ['DOM_PARSER', 'USER_MEDIA'],
      justification: 'To generate a video from images using Canvas and MediaRecorder'
    });
  }

  function sendStatusUpdate(payload: PublishStatusUpdatePayload) {
    const msg: ExtensionMessage = {
      type: 'PUBLISH_PROGRESS_UPDATE',
      payload,
    };
    try {
      browser.runtime.sendMessage(msg).catch(() => {});
    } catch {
      // ignore
    }
  }

  async function launchPlatformTabs(task: VideoPublishTask) {
    // 串行：上传完一个→等 3s→关 tab→再开下一个
    const foregroundPlatforms = ['douyin', 'kuaishou', 'baijiahao', 'tencent', 'tiktok', 'xhs', 'bilibili'] as const;
    const backgroundPlatforms: string[] = [];

    async function focusTab(tabId: number, windowId?: number) {
      if (windowId != null) {
        await browser.windows.update(windowId, { focused: true }).catch(() => {});
        await new Promise((r) => setTimeout(r, 100));
      }
      await browser.tabs.update(tabId, { active: true }).catch(() => {});
    }

    for (const p of task.platforms) {
      if (foregroundPlatforms.includes(p as any)) {
        const url = PLATFORM_URLS[p];
        if (!url) continue;
        console.log(`[Pixiaoli BG] Opening FOREGROUND tab for ${p}: ${url}`);
        const tab = await browser.tabs.create({ url, active: true });
        if (!tab.id) continue;
        const tabId = tab.id;
        tabPlatformMap[tabId] = { platform: p, taskId: task.taskId };
        sendStatusUpdate({ taskId: task.taskId, platform: p, status: 'running' });
        // 立即聚焦（不要等 complete），否则用户会觉得“打开了但没激活”
        await focusTab(tabId, tab.windowId);
        await new Promise<void>((resolve) => {
          let settled = false;
          const done = () => {
            if (settled) return;
            settled = true;
            browser.tabs.onUpdated.removeListener(listener);
            browser.tabs.onRemoved.removeListener(removedListener);
            clearTimeout(timer);
            resolve();
          };
          const listener = (changedTabId: number, changeInfo: any) => {
            if (changedTabId === tabId && changeInfo.status === 'complete') {
              console.log(`[Pixiaoli BG] Foreground tab ${tabId} loaded. Dispatching task to ${p} content script.`);
              focusTab(tabId, tab.windowId)
                .then(() => {
                  browser.tabs.sendMessage(tabId, {
                    type: `EXECUTE_${p.toUpperCase()}_UPLOAD`,
                    payload: task
                  }).catch(() => {});
                  done();
                })
                .catch(() => {
                  browser.tabs.sendMessage(tabId, {
                    type: `EXECUTE_${p.toUpperCase()}_UPLOAD`,
                    payload: task
                  }).catch(() => {});
                  done();
                });
            }
          };
          const removedListener = (closedTabId: number) => {
            if (closedTabId === tabId) {
              console.warn(`[Pixiaoli BG] Foreground tab ${tabId} closed before load.`);
              if (foregroundDoneResolver?.tabId === tabId) {
                clearTimeout(foregroundDoneResolver.timerId);
                foregroundDoneResolver.resolve();
                foregroundDoneResolver = null;
              }
              done();
            }
          };
          const timer = setTimeout(() => {
            console.warn(`[Pixiaoli BG] Foreground tab ${tabId} load timeout (90s).`);
            done();
          }, 90_000);
          browser.tabs.onUpdated.addListener(listener);
          browser.tabs.onRemoved.addListener(removedListener);
        });

        // 2) 等待 content script 上报上传完成（超时 15min）
        await new Promise<void>((resolve) => {
          const timerId = setTimeout(() => {
            if (foregroundDoneResolver?.tabId === tabId) {
              console.warn(`[Pixiaoli BG] Foreground upload done timeout (15min) for ${p}.`);
              foregroundDoneResolver!.resolve();
              foregroundDoneResolver = null;
            }
            resolve();
          }, 900_000);
          foregroundDoneResolver = { tabId, resolve, timerId };
        });
        foregroundDoneResolver = null;

        // 3) 流程走完等 3s
        await new Promise((r) => setTimeout(r, 3000));

        // 4) 关闭 tab 再开下一个
        await browser.tabs.remove(tabId).catch(() => {});
        console.log(`[Pixiaoli BG] Closed tab ${tabId} (${p}).`);
      } else {
        backgroundPlatforms.push(p);
      }
    }

    // 其它平台保持原来的并行后台打开逻辑
    backgroundPlatforms.forEach(platform => {
      const url = PLATFORM_URLS[platform];
      if (!url) return;
      console.log(`[Pixiaoli BG] Opening BACKGROUND tab for ${platform}: ${url} with video: ${task.fileUrl}`);
      browser.tabs.create({ url, active: false }).then(tab => {
        if (!tab.id) return;
        const tabId = tab.id;
        tabPlatformMap[tabId] = { platform: platform as PlatformId, taskId: task.taskId };
        sendStatusUpdate({ taskId: task.taskId, platform: platform as PlatformId, status: 'running' });
        const listener = (changedTabId: number, changeInfo: any) => {
          if (changedTabId === tabId && changeInfo.status === 'complete') {
            console.log(`[Pixiaoli BG] Background tab ${tabId} loaded. Dispatching task to ${platform} content script.`);
            browser.tabs.sendMessage(tabId, {
              type: `EXECUTE_${platform.toUpperCase()}_UPLOAD`,
              payload: task
            }).catch(() => {});
            browser.tabs.onUpdated.removeListener(listener);
          }
        };
        browser.tabs.onUpdated.addListener(listener);
      });
    });
  }

  browser.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
    switch (message.type) {
      case 'PIXIAOLI_READ_EXTENSION_BLOB': {
        const blobUrl = (message as any)?.payload?.blobUrl as string | undefined;
        if (!blobUrl || typeof blobUrl !== 'string') {
          sendResponse({ status: 'error', msg: 'Missing blobUrl' });
          break;
        }
        console.log('[Pixiaoli BG] PIXIAOLI_READ_EXTENSION_BLOB:', blobUrl.slice(0, 64));
        (async () => {
          try {
            const res = await fetch(blobUrl);
            if (!res.ok) {
              console.warn('[Pixiaoli BG] Read extension blob failed:', res.status, res.statusText);
              sendResponse({ status: 'error', msg: `fetch blob failed: ${res.status}` });
              return;
            }
            const mime = res.headers.get('content-type') || 'video/mp4';
            const buf = await res.arrayBuffer();
            console.log('[Pixiaoli BG] Read extension blob success:', { size: buf.byteLength, mime });
            const base64 = arrayBufferToBase64(buf);
            const dataUrl = `data:${mime};base64,${base64}`;
            sendResponse({ status: 'ok', dataUrl, size: buf.byteLength, mime });
          } catch (e) {
            console.error('[Pixiaoli BG] PIXIAOLI_READ_EXTENSION_BLOB error:', e);
            sendResponse({ status: 'error', msg: 'Unexpected error reading blob' });
          }
        })();
        return true;
      }

      case 'PIXIAOLI_UPLOAD_VIDEO_MULTI_PLATFORM': {
        const payload = (message as any).payload as any;
        if (!payload || !payload.platforms?.length) {
          sendResponse({ status: 'error', msg: 'Invalid popup payload' });
          break;
        }
        const fileUrl = String(payload.fileUrl ?? '');
        console.log('[Pixiaoli BG] Popup video publish received:', {
          name: payload.name,
          mime: payload.mime,
          size: payload.size,
          platforms: payload.platforms,
          fileUrlPrefix: fileUrl ? fileUrl.slice(0, 32) : '',
        });

        if (!fileUrl) {
          console.warn('[Pixiaoli BG] Missing fileUrl for popup video task.');
          sendResponse({ status: 'error', msg: 'Missing fileUrl' });
          break;
        }

        const taskId = `popup_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
        const task: VideoPublishTask = {
          taskId,
          title: (payload.title || payload.name || '').slice(0, 60) || '视频发布任务',
          description: payload.body,
          platforms: payload.platforms,
          fileUrl,
          fileName: payload.name,
        };
        tasksStore[taskId] = task;
        try {
          browser.runtime.sendMessage({
            type: 'PUBLISH_TASK_DISPATCH',
            payload: {
              taskId: task.taskId,
              title: task.title,
              platforms: task.platforms,
            },
          } as ExtensionMessage).catch(() => {});
        } catch {
          // ignore
        }
        launchPlatformTabs(task).catch((e) => {
          console.error('[Pixiaoli BG] launchPlatformTabs failed for popup task', e);
        });
        sendResponse({ status: 'ok', msg: 'Popup task accepted and tabs opened.', fileUrl: task.fileUrl });
        break;
      }

      case 'PUBLISH_REQUEST_FROM_WEB': {
        const rawTask: VideoPublishTask = message.payload;
        console.log('[Pixiaoli BG] Received task from web:', rawTask);

        (async () => {
          // 1) 优先使用消息中自带的平台；若为空，则从扩展 localStorage（popup 保存）读取
          let platforms: PlatformId[] = Array.isArray(rawTask.platforms)
            ? (rawTask.platforms.filter((p) => typeof p === 'string') as PlatformId[])
            : [];

          if (!platforms.length) {
            platforms = await waitForPlatformsFromOffscreen();
          }

          if (!platforms.length) {
            console.warn('[Pixiaoli BG] No platforms configured for web publish task.');
            sendResponse({ status: 'error', msg: 'No enabled video platforms in extension.' });
            return;
          }
          console.log('[Pixiaoli BG] Using platforms for web task:', platforms);

          const task: VideoPublishTask = {
            ...rawTask,
            platforms,
          };

          tasksStore[task.taskId] = task;

          // 通知 popup 有新的任务开始，初始化各平台为 pending 状态
          try {
            browser.runtime
              .sendMessage({
                type: 'PUBLISH_TASK_DISPATCH',
                payload: {
                  taskId: task.taskId,
                  title: task.title,
                  platforms: task.platforms,
                },
              } as ExtensionMessage)
              .catch(() => {});
          } catch {
            // ignore
          }

          const imageSources =
            task.imageDataUrls && task.imageDataUrls.length > 0
              ? task.imageDataUrls
              : task.imageUrls ?? [];

          if (imageSources.length > 0 && !task.fileUrl) {
            console.log('[Pixiaoli BG] Triggering offscreen video generation...');
            setupOffscreenDocument('offscreen.html')
              .then(async () => {
                const stored = await browser.storage.local.get([AUDIO_KEY, SETTINGS_KEY]);
                const storedAudio = stored[AUDIO_KEY] as
                  | { name: string; mime: string; base64: string }
                  | undefined;
                const storedSettings = stored[SETTINGS_KEY] as
                  | Partial<{
                      durationPerImageMs: number;
                      fps: number;
                      resolution: string;
                      isAudioEnabled: boolean;
                      isAudioLoopEnabled: boolean;
                      audioVolumePercent: number;
                    }>
                  | undefined;

                const encodeFromTask = task.encode;
                const durationPerImageMs =
                  encodeFromTask?.durationPerImageMs ??
                  (typeof storedSettings?.durationPerImageMs === 'number'
                    ? storedSettings.durationPerImageMs
                    : undefined) ??
                  task.imageUrlDuration ??
                  3000;
                const fps =
                  encodeFromTask?.fps ??
                  (typeof storedSettings?.fps === 'number' ? storedSettings.fps : undefined) ??
                  30;

                let width = encodeFromTask?.width;
                let height = encodeFromTask?.height;
                if ((!width || !height) && typeof storedSettings?.resolution === 'string') {
                  const parts = storedSettings.resolution.split('x').map((x) => parseInt(x, 10));
                  if (parts.length === 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1])) {
                    width = parts[0];
                    height = parts[1];
                  }
                }

                const encode = {
                  width: Math.max(16, Math.floor(width ?? 1080)),
                  height: Math.max(16, Math.floor(height ?? 1920)),
                  fps: Math.max(1, Math.min(60, Math.floor(fps || 30))),
                  durationPerImageMs: Math.max(200, Math.floor(durationPerImageMs || 3000)),
                };

                const audioEnabled =
                  task.audio?.enabled ??
                  (typeof storedSettings?.isAudioEnabled === 'boolean'
                    ? storedSettings.isAudioEnabled
                    : undefined) ??
                  true;
                const audioLoop =
                  task.audio?.loop ??
                  (typeof storedSettings?.isAudioLoopEnabled === 'boolean'
                    ? storedSettings.isAudioLoopEnabled
                    : undefined) ??
                  true;
                const audioVolumePercent =
                  typeof storedSettings?.audioVolumePercent === 'number'
                    ? storedSettings.audioVolumePercent
                    : 100;
                const audioVolume = Math.max(0, Math.min(2, audioVolumePercent / 100));

                browser.runtime.sendMessage({
                  type: 'GENERATE_MP4_FROM_IMAGES',
                  payload: {
                    taskId: task.taskId,
                    imageUrls: imageSources,
                    encode,
                    audio: { enabled: audioEnabled, loop: audioLoop, volume: audioVolume },
                    audioSource: storedAudio,
                  },
                });
              })
              .catch((err) => console.error(err));
            sendResponse({ status: 'generating', msg: 'Generating video from images...' });
          } else {
            launchPlatformTabs(task);
            sendResponse({ status: 'ok', msg: 'Task accepted and tabs opened.' });
          }
        })();

        break;
      }

      case 'VIDEO_GENERATED':
        console.log('[Pixiaoli BG] Video generated successfully:', message.payload);
        const generatedTaskId = message.payload.taskId;
        if (tasksStore[generatedTaskId]) {
          tasksStore[generatedTaskId].fileUrl = message.payload.blobUrl;
          if (!tasksStore[generatedTaskId].fileName || !tasksStore[generatedTaskId].fileName.endsWith('.mp4')) {
            tasksStore[generatedTaskId].fileName = 'generated_video.mp4';
          }
          launchPlatformTabs(tasksStore[generatedTaskId]);
        }
        sendResponse({ status: 'ok' });
        break;

      case 'VIDEO_GENERATION_FAILED':
        console.error('[Pixiaoli BG] Video generation failed:', (message.payload as { error?: string; stack?: string })?.error ?? message.payload);
        if ((message.payload as { stack?: string })?.stack) {
          console.error('[Pixiaoli BG] Stack:', (message.payload as { stack?: string }).stack);
        }
        sendResponse({ status: 'error' });
        break;

      case 'FOREGROUND_UPLOAD_DONE':
        {
          const tabId = (sender as { tab?: { id?: number } })?.tab?.id;
          const mapping = tabId != null ? tabPlatformMap[tabId] : undefined;
          if (mapping) {
            // 默认认为流程已结束且成功；若 content script 额外上报失败，会覆盖为 failed
            sendStatusUpdate({
              taskId: mapping.taskId,
              platform: mapping.platform,
              status: 'success',
            });
            delete tabPlatformMap[tabId as number];
          }
          if (foregroundDoneResolver && tabId != null && tabId === foregroundDoneResolver.tabId) {
            clearTimeout(foregroundDoneResolver.timerId);
            foregroundDoneResolver.resolve();
            foregroundDoneResolver = null;
            console.log('[Pixiaoli BG] Foreground upload done for tab', tabId);
          } else if (tabId != null) {
            // 后台平台（小红书、B站等）发布完：等 3s 后关闭 tab
            console.log('[Pixiaoli BG] Background platform upload done for tab', tabId, ', closing in 3s.');
            setTimeout(() => browser.tabs.remove(tabId).catch(() => {}), 3000);
          }
        }
        break;

      case 'PUBLISH_RETRY_REQUEST': {
        const payload = message.payload as { taskId?: string; platform?: PlatformId } | undefined;
        const taskId = payload?.taskId;
        const platform = payload?.platform;
        if (!taskId || !platform) {
          sendResponse({ status: 'error', msg: 'Missing taskId or platform' });
          break;
        }
        const original = tasksStore[taskId];
        if (!original || !original.platforms.includes(platform)) {
          sendResponse({ status: 'error', msg: 'Task or platform not found' });
          break;
        }
        console.log('[Pixiaoli BG] Retry requested for task', taskId, 'platform', platform);
        // 仅对该平台重新发起一次上传流程
        launchPlatformTabs({
          ...original,
          platforms: [platform],
        });
        sendResponse({ status: 'ok' });
        break;
      }

      default:
        console.warn('[Pixiaoli BG] Unknown message type:', message.type);
        break;
    }
    
    return true; 
  });
});
