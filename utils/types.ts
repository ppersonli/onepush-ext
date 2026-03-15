export type PlatformId =
  | 'xhs'
  | 'bilibili'
  | 'kuaishou'
  | 'douyin'
  | 'baijiahao'
  | 'tencent'
  | 'tiktok';

export type PublishStatus = 'pending' | 'running' | 'success' | 'failed';

export interface VideoPublishTask {
  taskId: string;
  title: string;
  /** Long-form description/body (e.g. comic content). */
  description?: string;
  /** Optional hashtag list; content scripts may map to platform-specific topics. */
  tags?: string[];

  /** The URL to the video file provided by the web platform (or generated locally). */
  fileUrl?: string;
  /** Optional thumbnail/cover image (URL or data URL) to set before publishing. */
  thumbnailUrl?: string;
  /** Images to combine into a video. */
  imageUrls?: string[];
  /** Preferred: base64 data URLs for images (when image URLs are permissioned). */
  imageDataUrls?: string[];

  /** Legacy: duration per image in ms (prefer `encode.durationPerImageMs`). */
  imageUrlDuration?: number;

  encode?: {
    width: number;
    height: number;
    fps: number;
    durationPerImageMs: number;
  };

  audio?: {
    enabled?: boolean;
    loop?: boolean;
    volume?: number;
  };

  /** Suggested file name. */
  fileName?: string;

  /** ['douyin', 'xhs', 'bilibili', 'tencent', 'kuaishou', 'baijiahao', ...] */
  platforms: PlatformId[];
}

export interface PublishStatusUpdatePayload {
  taskId: string;
  platform: PlatformId;
  status: PublishStatus;
  /** 可选的错误原因或补充说明，便于在 popup 中展示 */
  reason?: string;
}

export type MessageType =
    | 'PUBLISH_REQUEST_FROM_WEB'
    | 'PIXIAOLI_UPLOAD_VIDEO_MULTI_PLATFORM'
    | 'PIXIAOLI_READ_EXTENSION_BLOB'
    | 'PUBLISH_TASK_DISPATCH'
    | 'PUBLISH_PROGRESS_UPDATE'
    | 'PUBLISH_COMPLETED'
    | 'PUBLISH_ERROR'
    | 'PUBLISH_RETRY_REQUEST'
    | 'FOREGROUND_UPLOAD_DONE'
    | 'GENERATE_VIDEO_FROM_IMAGES'
    | 'GENERATE_MP4_FROM_IMAGES'
    | 'VIDEO_GENERATED'
    | 'VIDEO_GENERATION_FAILED';

export interface ExtensionMessage {
    type: MessageType;
    payload?: any;
}
