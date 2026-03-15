<template>
  <div class="wrap">
    <header class="header">
      <button type="button" class="brandBtn" @click="openPixiaoli" aria-label="打开皮小粒官网">
        <img class="logo" :src="logoUrl" alt="" />
        <span class="title">皮小粒・自动发布</span>
        <span class="brandHint">点击打开官网 →</span>
      </button>
    </header>

    <section v-if="!showStatusView" class="section">
      <p class="muted" style="color: #ec4899;">该插件为自动化模拟用户操作上传视频到各媒体平台，免费使用，使用者自行承担风险（如封号）</p>
      <p class="muted" style="color: #ec4899;">插件功能只在chrome浏览器测试过，其他浏览器可能无法使用</p>
      <div class="sectionTitle">发布平台（多选）</div>
      <p class="muted">勾选后，浏览器插件会将生成的视频自动发到对应平台。</p>
      <div class="row platformsRow">
        <label class="label">
          <input
            type="checkbox"
            class="checkbox"
            :checked="videoPlatforms.xhs"
            @change="onToggleVideoPlatform('xhs', $event)"
          />
          <span>小红书</span>
        </label>
        <label class="label">
          <input
            type="checkbox"
            class="checkbox"
            :checked="videoPlatforms.douyin"
            @change="onToggleVideoPlatform('douyin', $event)"
          />
          <span>抖音</span>
        </label>
        <label class="label">
          <input
            type="checkbox"
            class="checkbox"
            :checked="videoPlatforms.kuaishou"
            @change="onToggleVideoPlatform('kuaishou', $event)"
          />
          <span>快手</span>
        </label>
        <label class="label">
          <input
            type="checkbox"
            class="checkbox"
            :checked="videoPlatforms.bilibili"
            @change="onToggleVideoPlatform('bilibili', $event)"
          />
          <span>B站</span>
        </label>
        <label class="label">
          <input
            type="checkbox"
            class="checkbox"
            :checked="videoPlatforms.baijiahao"
            @change="onToggleVideoPlatform('baijiahao', $event)"
          />
          <span>百家号</span>
        </label>
        <label class="label">
          <input
            type="checkbox"
            class="checkbox"
            :checked="videoPlatforms.tencent"
            @change="onToggleVideoPlatform('tencent', $event)"
          />
          <span>视频号</span>
        </label>
        <label class="label">
          <input
            type="checkbox"
            class="checkbox"
            :checked="videoPlatforms.tiktok"
            @change="onToggleVideoPlatform('tiktok', $event)"
          />
          <span>TikTok</span>
        </label>
      </div>
    </section>

    <section v-if="!showStatusView" class="section">
      <div class="tabs">
        <button
          type="button"
          class="tabBtn"
          :class="{ active: activeTab === 'video' }"
          @click="setActiveTab('video')"
        >
          视频
        </button>
        <button
          type="button"
          class="tabBtn tabBtnWithHelp"
          :class="{ active: activeTab === 'comic' }"
          @click="setActiveTab('comic')"
        >
          <span>皮小粒图文</span>
          <span
            class="tabHelp"
            data-tooltip="在这里配置的音频和合成参数，会在皮小粒 Web 平台发布、并勾选「联动插件发布多平台」时，由插件生成多平台视频时生效。"
          >
            ?
          </span>
        </button>
      </div>

      <div v-if="activeTab === 'video'">
        <div class="sectionTitle" style="margin-top: 10px;">上传视频</div>
        <p class="muted">从本地选择已剪好的视频，浏览器插件会按上方平台配置进行多平台发布。</p>

        <div class="row">
          <label class="labelInline">视频标题</label>
          <input
            class="input"
            type="text"
            v-model="videoTitle"
            placeholder="将用于各平台的视频标题"
          />
        </div>

        <div class="row">
          <label class="labelInline">视频正文</label>
          <textarea
            class="input textarea"
            rows="3"
            v-model="videoBody"
            placeholder="将用于各平台的视频正文文案"
          ></textarea>
        </div>

        <div v-if="videoFile" class="row fileRow">
          <div class="fileInfo">
            <div class="fileName" :title="videoFile.name">{{ videoFile.name }}</div>
            <div class="muted">
              {{ videoFile.mime }}
              <span v-if="videoFile.sizeText"> · {{ videoFile.sizeText }}</span>
            </div>
          </div>
          <button class="btn secondary" type="button" @click="onClearVideo" :disabled="isPublishingVideo">
            移除
          </button>
        </div>

        <div v-else class="row">
          <label class="fileLabel">
            <input
              class="fileInput"
              type="file"
              accept="video/mp4,video/webm"
              @change="onPickVideo"
            />
            <span class="btn secondary">选择视频文件</span>
          </label>
        </div>

        <p class="muted" style="margin-top: 6px;">
          支持 mp4 / webm，单个视频上传限制在 256MB 以内。需要在各平台页面保持登录状态以便插件自动上传。
        </p>

        <div class="row end">
          <button
            class="btn primary"
            type="button"
            :disabled="isPublishingVideo || !videoFile"
            @click="onPublishVideo"
          >
            {{ isPublishingVideo ? '发布中…' : '发布' }}
          </button>
        </div>
      </div>

      <div v-else>
        <div class="sectionTitle" style="margin-top: 10px;">音频（可选）</div>
        <p class="muted">上传后将用于为图片合成「有声视频」。</p>

        <div v-if="audioMeta" class="row fileRow">
          <div class="fileInfo">
            <div class="fileName" :title="audioMeta.name">{{ audioMeta.name }}</div>
            <div class="muted">{{ audioMeta.mime }}</div>
          </div>
          <button class="btn secondary" type="button" @click="onClearAudio">移除</button>
        </div>

        <div v-else class="row">
          <label class="fileLabel">
            <input class="fileInput" type="file" accept="audio/*" @change="onPickAudio" />
            <span class="btn secondary">选择文件</span>
          </label>
        </div>

        <div class="row checkRow">
          <label class="label">
            <input type="checkbox" class="checkbox" v-model="settings.isAudioEnabled" />
            <span>启用音频</span>
          </label>
          <label class="label">
            <input type="checkbox" class="checkbox" v-model="settings.isAudioLoopEnabled" />
            <span>循环</span>
          </label>
        </div>

        <div class="row">
          <label class="labelInline">音量</label>
          <div class="rangeWrap">
            <input
              class="range"
              type="range"
              min="0"
              max="200"
              step="5"
              v-model.number="settings.audioVolumePercent"
            />
          </div>
          <span class="mono">{{ settings.audioVolumePercent }}%</span>
        </div>

        <div class="row" style="margin-top: 14px;">
          <label class="labelInline">每张时长</label>
          <input
            class="input num"
            type="number"
            min="200"
            step="100"
            v-model.number="settings.durationPerImageMs"
          />
          <span class="muted">ms</span>
        </div>
        <p class="muted" style="margin-top: 8px; margin-bottom: 0;">
          FPS 固定 30，分辨率与第一张图片一致。
        </p>

        <div class="row end" style="margin-top: 16px;">
          <button class="btn primary" type="button" :disabled="isSaving" @click="onSave">
            {{ isSaving ? '保存中…' : '保存设置' }}
          </button>
        </div>
      </div>
    </section>

    <section v-else class="section">
      <div class="sectionTitle" style="margin-bottom: 10px;">多平台发布进度</div>
      <p class="muted" style="margin-bottom: 6px;">
        当前任务会逐个平台依次或并行发布。请勿关闭相关平台页面，直到状态全部结束。
      </p>
      <div
        v-for="platformKey in enabledPlatformKeys"
        :key="platformKey"
        class="statusRow"
      >
        <div class="statusInfo">
          <div class="statusName">
            {{ platformKey === 'xhs' ? '小红书' :
              platformKey === 'douyin' ? '抖音' :
              platformKey === 'kuaishou' ? '快手' :
              platformKey === 'bilibili' ? 'B站' :
              platformKey === 'baijiahao' ? '百家号' :
              platformKey === 'tencent' ? '视频号' :
              platformKey === 'tiktok' ? 'TikTok' :
              platformKey }}
          </div>
          <div class="statusText" :class="platformStatusMap[platformKey]">
            {{ platformStatusMap[platformKey] === 'pending'
              ? '等待中'
              : platformStatusMap[platformKey] === 'running'
                ? '进行中…'
                : platformStatusMap[platformKey] === 'success'
                  ? '成功'
                  : '失败' }}
          </div>
        </div>
        <div class="statusActions" v-if="platformStatusMap[platformKey] === 'failed' && currentTaskId">
          <button
            class="btn secondary"
            type="button"
            @click="onRetryPlatform(platformKey)"
          >
            重试
          </button>
        </div>
      </div>

      <div class="row end" style="margin-top: 16px;">
        <button
          class="btn primary"
          type="button"
          :disabled="!allDone"
          @click="resetStatusView"
        >
          {{ allDone ? '确认，返回配置界面' : '发布进行中…' }}
        </button>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';

type VideoPlatformKey =
  | 'xhs'
  | 'bilibili'
  | 'kuaishou'
  | 'douyin'
  | 'baijiahao'
  | 'tencent'
  | 'tiktok';

type VideoPlatformsState = Record<VideoPlatformKey, boolean>;

interface StoredAudioMeta {
  name: string;
  mime: string;
  base64: string;
}

interface StoredSettings {
  durationPerImageMs: number;
  isAudioEnabled: boolean;
  isAudioLoopEnabled: boolean;
  audioVolumePercent: number;
}

const AUDIO_KEY = 'pixiaoli:audio';
const SETTINGS_KEY = 'pixiaoli:settings';
const VIDEO_PLATFORMS_KEY = 'pixiaoli:video-platforms';
const ACTIVE_TAB_KEY = 'pixiaoli:popup-active-tab';

const audioMeta = ref<StoredAudioMeta | null>(null);
const isSaving = ref(false);
const isPublishingVideo = ref(false);
const showStatusView = ref(false);
const currentTaskId = ref<string | null>(null);
const browserApi = ((globalThis as any).browser || (globalThis as any).chrome) as any;
const logoUrl = typeof browserApi?.runtime?.getURL === 'function'
  ? browserApi.runtime.getURL('icon/logo.png')
  : '/icon/logo.png';

const activeTab = ref<'video' | 'comic'>('video');
const videoTitle = ref('');
const videoBody = ref('');

const settings = reactive<StoredSettings>({
  durationPerImageMs: 3000,
  isAudioEnabled: true,
  isAudioLoopEnabled: true,
  audioVolumePercent: 100,
});

const videoPlatforms = reactive<VideoPlatformsState>({
  xhs: false,
  bilibili: false,
  kuaishou: false,
  douyin: false,
  baijiahao: false,
  tencent: false,
  tiktok: false,
});

const platformKeys = computed<VideoPlatformKey[]>(() => [
  'xhs',
  'douyin',
  'kuaishou',
  'bilibili',
  'baijiahao',
  'tencent',
  'tiktok',
]);

const enabledPlatformKeys = computed<VideoPlatformKey[]>(() =>
  platformKeys.value.filter((k) => videoPlatforms[k])
);

type PlatformStatus = 'pending' | 'running' | 'success' | 'failed';

const platformStatusMap = reactive<Record<VideoPlatformKey, PlatformStatus>>({
  xhs: 'pending',
  bilibili: 'pending',
  kuaishou: 'pending',
  douyin: 'pending',
  baijiahao: 'pending',
  tencent: 'pending',
  tiktok: 'pending',
});

const allDone = computed(() => {
  const enabledPlatforms = (Object.entries(videoPlatforms) as [VideoPlatformKey, boolean][])
    .filter(([, enabled]) => enabled)
    .map(([k]) => k);
  if (!enabledPlatforms.length) return false;
  return enabledPlatforms.every((k) => {
    const s = platformStatusMap[k];
    return s === 'success' || s === 'failed';
  });
});

async function onRetryPlatform(platform: VideoPlatformKey) {
  if (!currentTaskId.value || !browserApi?.runtime?.sendMessage) return;
  platformStatusMap[platform] = 'running';
  try {
    await browserApi.runtime.sendMessage({
      type: 'PUBLISH_RETRY_REQUEST',
      payload: {
        taskId: currentTaskId.value,
        platform,
      },
    });
  } catch {
    platformStatusMap[platform] = 'failed';
  }
}

const videoFile = ref<{
  file: File;
  name: string;
  mime: string;
  size: number;
  sizeText: string;
} | null>(null);

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function loadFromStorage() {
  try {
    const audioRaw = window.localStorage.getItem(AUDIO_KEY);
    if (audioRaw) {
      const parsed = JSON.parse(audioRaw) as StoredAudioMeta;
      if (parsed && typeof parsed.name === 'string' && typeof parsed.base64 === 'string') {
        audioMeta.value = parsed;
      }
    }

    const settingsRaw = window.localStorage.getItem(SETTINGS_KEY);
    if (settingsRaw) {
      const parsed = JSON.parse(settingsRaw) as Partial<StoredSettings>;
      if (parsed && typeof parsed === 'object') {
        if (typeof parsed.durationPerImageMs === 'number') {
          settings.durationPerImageMs = parsed.durationPerImageMs;
        }
        if (typeof parsed.isAudioEnabled === 'boolean') {
          settings.isAudioEnabled = parsed.isAudioEnabled;
        }
        if (typeof parsed.isAudioLoopEnabled === 'boolean') {
          settings.isAudioLoopEnabled = parsed.isAudioLoopEnabled;
        }
        if (typeof parsed.audioVolumePercent === 'number') {
          settings.audioVolumePercent = parsed.audioVolumePercent;
        }
      }
    }

    const vpRaw = window.localStorage.getItem(VIDEO_PLATFORMS_KEY);
    if (vpRaw) {
      const parsed = JSON.parse(vpRaw) as Partial<VideoPlatformsState>;
      if (parsed && typeof parsed === 'object') {
        (Object.keys(videoPlatforms) as VideoPlatformKey[]).forEach((k) => {
          const v = parsed[k];
          if (typeof v === 'boolean') {
            videoPlatforms[k] = v;
          }
        });
      }
    }

    const tabRaw = window.localStorage.getItem(ACTIVE_TAB_KEY);
    if (tabRaw === 'video' || tabRaw === 'comic') {
      activeTab.value = tabRaw;
    }

  } catch {
    // 忽略 localStorage 解析错误
  }
}

function setActiveTab(tab: 'video' | 'comic') {
  activeTab.value = tab;
  try {
    window.localStorage.setItem(ACTIVE_TAB_KEY, tab);
  } catch {
    // ignore
  }
}

function persistVideoPlatforms() {
  try {
    window.localStorage.setItem(VIDEO_PLATFORMS_KEY, JSON.stringify({ ...videoPlatforms }));
  } catch {
    // ignore
  }
}

function onToggleVideoPlatform(key: VideoPlatformKey, ev: Event) {
  const target = ev.target as HTMLInputElement | null;
  if (!target) return;
  videoPlatforms[key] = target.checked;
  persistVideoPlatforms();
}

async function onPickAudio(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  const buf = await file.arrayBuffer();
  const meta: StoredAudioMeta = {
    name: file.name,
    mime: file.type || 'application/octet-stream',
    base64: arrayBufferToBase64(buf),
  };
  audioMeta.value = meta;
  try {
    window.localStorage.setItem(AUDIO_KEY, JSON.stringify(meta));
  } catch {
    // ignore
  }
  input.value = '';
}

async function onClearAudio() {
  audioMeta.value = null;
  try {
    window.localStorage.removeItem(AUDIO_KEY);
  } catch {
    // ignore
  }
}

async function onSave() {
  isSaving.value = true;
  try {
    const payload: StoredSettings = {
      durationPerImageMs: Math.max(200, Math.floor(settings.durationPerImageMs || 3000)),
      isAudioEnabled: !!settings.isAudioEnabled,
      isAudioLoopEnabled: !!settings.isAudioLoopEnabled,
      audioVolumePercent: Math.max(0, Math.min(200, Math.floor(settings.audioVolumePercent || 100))),
    };
    try {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(payload));
    } catch {
      // ignore
    }
  } finally {
    isSaving.value = false;
  }
}

function formatSize(size: number): string {
  if (!Number.isFinite(size) || size <= 0) return '';
  const kb = size / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
}

async function onPickVideo(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  const maxSize = 256 * 1024 * 1024; // 256MB
  if (file.size > maxSize) {
    window.alert('单个视频请控制在 256MB 以内。');
    input.value = '';
    return;
  }
  const mime = file.type || 'video/mp4';
  if (!/^video\/(mp4|webm)$/i.test(mime)) {
    window.alert('仅支持 mp4 / webm 视频文件。');
    input.value = '';
    return;
  }
  videoFile.value = {
    file,
    name: file.name,
    mime,
    size: file.size,
    sizeText: formatSize(file.size),
  };
  input.value = '';
}

function onClearVideo() {
  videoFile.value = null;
}

function resetStatusView() {
  currentTaskId.value = null;
  (Object.keys(platformStatusMap) as VideoPlatformKey[]).forEach((k) => {
    platformStatusMap[k] = 'pending';
  });
  showStatusView.value = false;
}

async function onPublishVideo() {
  if (!videoFile.value) {
    window.alert('请先选择要发布的视频文件。');
    return;
  }
  const enabledPlatforms = (Object.entries(videoPlatforms) as [VideoPlatformKey, boolean][])
    .filter(([, enabled]) => enabled)
    .map(([key]) => key);
  if (!enabledPlatforms.length) {
    window.alert('请至少选择一个发布平台。');
    return;
  }
  if (!browserApi?.runtime?.sendMessage) {
    window.alert('未检测到浏览器插件运行环境，请确认已正确安装并启用。');
    return;
  }
  isPublishingVideo.value = true;
  try {
    const file = videoFile.value.file;
    const name = videoFile.value.name;
    const mime = videoFile.value.mime;
    const size = file.size;

    // 统一：在 popup 端读取为 data URL，直接传给后台与各平台内容脚本
    const buf = await file.arrayBuffer();
    const base64 = arrayBufferToBase64(buf);
    const fileUrl = `data:${mime};base64,${base64}`;

    const resp = await browserApi.runtime.sendMessage({
      type: 'PIXIAOLI_UPLOAD_VIDEO_MULTI_PLATFORM',
      payload: {
        name,
        mime,
        size,
        platforms: enabledPlatforms,
        fileUrl,
        title: videoTitle.value.trim() || undefined,
        body: videoBody.value.trim() || undefined,
      },
    });
    if (resp && resp.status === 'error') {
      console.error('[Pixiaoli Popup] PIXIAOLI_UPLOAD_VIDEO_MULTI_PLATFORM failed:', resp);
      window.alert('发送给浏览器插件失败：' + (resp.msg || '未知错误'));
      return;
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to send video publish task', err);
    window.alert('发送给浏览器插件失败，请稍后重试。');
  } finally {
    isPublishingVideo.value = false;
  }
}

function openPixiaoli() {
  const url = 'https://pixiaoli.cn';
  if (browserApi?.tabs?.create) {
    browserApi.tabs.create({ url });
  } else {
    window.open(url, '_blank', 'noopener');
  }
}

onMounted(() => {
  loadFromStorage().catch((e) => console.warn('Failed to load popup storage', e));

  if (browserApi?.runtime?.onMessage?.addListener) {
    browserApi.runtime.onMessage.addListener((message: any) => {
      if (!message || typeof message.type !== 'string') return;
      switch (message.type) {
        case 'PUBLISH_TASK_DISPATCH': {
          const { taskId, platforms } = message.payload || {};
          if (!taskId || !Array.isArray(platforms)) return;
          currentTaskId.value = taskId;
          (Object.keys(platformStatusMap) as VideoPlatformKey[]).forEach((k) => {
            if (platforms.includes(k)) {
              platformStatusMap[k] = 'pending';
            }
          });
          showStatusView.value = true;
          break;
        }
        case 'PUBLISH_PROGRESS_UPDATE':
        case 'PUBLISH_COMPLETED':
        case 'PUBLISH_ERROR': {
          const payload = message.payload || {};
          const taskId = payload.taskId as string | undefined;
          const platform = payload.platform as VideoPlatformKey | undefined;
          if (!taskId || !platform) return;
          if (currentTaskId.value && currentTaskId.value !== taskId) return;
          const status: PlatformStatus | undefined =
            message.type === 'PUBLISH_COMPLETED'
              ? 'success'
              : message.type === 'PUBLISH_ERROR'
                ? 'failed'
                : (payload.status as PlatformStatus | undefined);
          if (!status) return;
          platformStatusMap[platform] = status;
          break;
        }
        default:
          break;
      }
    });
  }
});
</script>

<style>
  /* 弹窗根节点：与 .wrap 同背景，避免底部露白 */
  html, body {
    margin: 0;
    min-height: 100vh;
    min-height: 100%;
    background: linear-gradient(135deg, #fef2f5 0%, #f0f4ff 50%, #e8f4fc 100%);
  }
  #app {
    min-height: 100vh;
    min-height: 100%;
  }
</style>
<style scoped>
.wrap {
  width: 380px;
  min-height: 100%;
  padding: 0;
  padding-bottom: 2px;
  box-sizing: border-box;
  background: linear-gradient(135deg, #fef2f5 0%, #f0f4ff 50%, #e8f4fc 100%);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
}

.header {
  padding: 12px 18px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

.brandBtn {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 14px;
  border: none;
  border-radius: 14px;
  cursor: pointer;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(255, 240, 245, 0.98) 50%, rgba(240, 248, 255, 0.98) 100%);
  box-shadow: 0 2px 12px rgba(236, 72, 153, 0.12), 0 0 0 1.5px rgba(236, 72, 153, 0.2);
  transition: transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
  outline: none;
  text-align: left;
  font: inherit;
}

.brandBtn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(236, 72, 153, 0.22), 0 0 0 2px rgba(236, 72, 153, 0.35);
  background: linear-gradient(135deg, #fff 0%, #fff0f5 40%, #f0f8ff 100%);
}

.brandBtn:active {
  transform: translateY(0);
  box-shadow: 0 2px 10px rgba(236, 72, 153, 0.18), 0 0 0 1.5px rgba(236, 72, 153, 0.3);
}

.logo {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  object-fit: cover;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(236, 72, 153, 0.2);
}

.title {
  flex: 1;
  font-size: 17px;
  font-weight: 700;
  letter-spacing: 0.02em;
  background: linear-gradient(135deg, #be185d 0%, #ec4899 35%, #f472b6 70%, #a855f7 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  min-width: 0;
}

.brandHint {
  font-size: 11px;
  font-weight: 600;
  color: #ec4899;
  opacity: 0.9;
  white-space: nowrap;
  flex-shrink: 0;
}

.brandBtn:hover .brandHint {
  opacity: 1;
  color: #db2777;
}

.section {
  margin: 14px 18px;
  padding: 14px 16px;
  background: rgba(255, 255, 255, 0.85);
  border-radius: 14px;
  border: 1px solid rgba(0, 0, 0, 0.06);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.04);
}

.sectionTitle {
  font-weight: 700;
  font-size: 14px;
  color: #2d2d2d;
  margin-bottom: 6px;
}

.tabs {
  display: inline-flex;
  padding: 3px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.8);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
  margin-bottom: 8px;
}

.tabBtn {
  border: none;
  background: transparent;
  padding: 5px 12px;
  border-radius: 999px;
  font-size: 12px;
  color: #6b7280;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, transform 0.1s;
}

.tabBtnWithHelp {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.tabBtn.active {
  background: linear-gradient(135deg, #ec4899 0%, #db2777 50%, #be185d 100%);
  color: #fff;
  box-shadow: 0 2px 8px rgba(236, 72, 153, 0.4);
}

.tabBtn:not(.active):hover {
  color: #374151;
}

.tabHelp {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 999px;
  font-size: 11px;
  color: inherit;
  background: rgba(255, 255, 255, 0.18);
  border: 1px solid rgba(248, 250, 252, 0.7);
  cursor: default;
  position: relative;
}

.tabHelp:hover {
  background: rgba(255, 255, 255, 0.3);
}

.tabHelp::after {
  content: attr(data-tooltip);
  position: absolute;
  bottom: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%) translateY(4px);
  min-width: 220px;
  max-width: 260px;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(17, 24, 39, 0.96);
  color: #f9fafb;
  font-size: 11px;
  line-height: 1.4;
  white-space: normal;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
  opacity: 0;
  pointer-events: none;
  z-index: 20;
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.tabHelp:hover::after {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}

.muted {
  margin: 0 0 10px;
  font-size: 12px;
  color: #6b7280;
  line-height: 1.4;
}

.row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
}

.platformsRow {
  flex-wrap: wrap;
  align-items: flex-start;
}

.row:first-of-type {
  margin-top: 0;
}

.row.end {
  margin: 16px 18px 18px;
  justify-content: flex-end;
}

.fileRow {
  margin-top: 8px;
}

.fileLabel {
  display: inline-flex;
  cursor: pointer;
}

.fileInput {
  position: absolute;
  width: 0;
  height: 0;
  opacity: 0;
  pointer-events: none;
}

.fileInfo {
  flex: 1;
  min-width: 0;
}

.fileName {
  font-size: 13px;
  font-weight: 600;
  color: #374151;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.labelInline {
  font-size: 13px;
  color: #374151;
  flex-shrink: 0;
}

.input {
  padding: 8px 12px;
  border-radius: 10px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  background: #fff;
  font-size: 13px;
  color: #1f2937;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.input:hover {
  border-color: rgba(236, 72, 153, 0.3);
}

.input:focus {
  border-color: rgba(236, 72, 153, 0.6);
  box-shadow: 0 0 0 3px rgba(236, 72, 153, 0.12);
}

.num {
  width: 100px;
}

.textarea {
  width: 100%;
  min-height: 72px;
  resize: vertical;
}

.select {
  flex: 1;
  min-width: 0;
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%236b7280' d='M6 8L1 3h10z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
  padding-right: 28px;
}

.checkRow {
  margin-top: 12px;
}

.label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #374151;
  cursor: pointer;
  user-select: none;
}

.checkbox {
  width: 18px;
  height: 18px;
  border-radius: 5px;
  border: 2px solid rgba(0, 0, 0, 0.2);
  accent-color: #ec4899;
  cursor: pointer;
}

.rangeWrap {
  flex: 1;
  min-width: 0;
}

.range {
  width: 100%;
  height: 6px;
  border-radius: 3px;
  background: linear-gradient(to right, #fce7f3 0%, #fbcfe8 50%, #f9a8d4 100%);
  appearance: none;
  outline: none;
}

.range::-webkit-slider-thumb {
  appearance: none;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: linear-gradient(135deg, #ec4899, #db2777);
  box-shadow: 0 2px 6px rgba(236, 72, 153, 0.4);
  cursor: pointer;
  transition: transform 0.15s;
}

.range::-webkit-slider-thumb:hover {
  transform: scale(1.08);
}

.range::-moz-range-thumb {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: none;
  background: linear-gradient(135deg, #ec4899, #db2777);
  box-shadow: 0 2px 6px rgba(236, 72, 153, 0.4);
  cursor: pointer;
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  color: #6b7280;
  width: 40px;
  text-align: right;
  flex-shrink: 0;
}

.btn {
  padding: 8px 16px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: none;
  outline: none;
  transition: opacity 0.15s, transform 0.1s;
}

.btn:hover:not(:disabled) {
  opacity: 0.92;
}

.btn:active:not(:disabled) {
  transform: scale(0.98);
}

.btn.secondary {
  background: rgba(0, 0, 0, 0.06);
  color: #374151;
  border: 1px solid rgba(0, 0, 0, 0.1);
}

.btn.secondary:hover:not(:disabled) {
  background: rgba(0, 0, 0, 0.08);
}

.btn.primary {
  background: linear-gradient(135deg, #ec4899 0%, #db2777 50%, #be185d 100%);
  color: #fff;
  box-shadow: 0 4px 14px rgba(236, 72, 153, 0.35);
}

.btn.primary:hover:not(:disabled) {
  box-shadow: 0 6px 18px rgba(236, 72, 153, 0.45);
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
