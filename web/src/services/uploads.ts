import { AppwriteServiceError } from './appwriteError';

export const CHAT_ATTACHMENT_LIMIT = 20 * 1024 * 1024;
export const PROFILE_IMAGE_LIMIT = 10 * 1024 * 1024;
export const UPLOAD_CHUNK_SIZE = 5 * 1024 * 1024;

const mimeTypes: Record<string, readonly string[]> = {
  jpg: ['image/jpeg'], jpeg: ['image/jpeg'], png: ['image/png'], webp: ['image/webp'],
  heic: ['image/heic', 'image/heif'], pdf: ['application/pdf'],
  m4a: ['audio/mp4', 'audio/x-m4a'], mp3: ['audio/mpeg'], wav: ['audio/wav', 'audio/x-wav', 'audio/wave'],
  mp4: ['video/mp4'], mov: ['video/quicktime']
};

export class UploadControl {
  readonly controller = new AbortController();
  private committing = false;
  constructor(readonly onProgress?: (completed: number, total: number) => void, readonly onCommit?: () => void) {}

  get canCancel(): boolean { return !this.committing && !this.controller.signal.aborted; }
  cancel(): void { if (this.canCancel) this.controller.abort(); }
  checkCancellation(): void { this.controller.signal.throwIfAborted(); }
  beginCommit(): void { this.checkCancellation(); this.committing = true; this.onCommit?.(); }
}

export function validateUpload(file: Pick<File, 'name' | 'type' | 'size'>, profile = false): void {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  const allowed = mimeTypes[extension];
  if (!allowed?.includes(file.type) || (profile && !file.type.startsWith('image/'))) {
    throw new AppwriteServiceError('Unsupported file format', 400, 'upload_format');
  }
  if (file.size <= 0 || file.size > (profile ? PROFILE_IMAGE_LIMIT : CHAT_ATTACHMENT_LIMIT)) {
    throw new AppwriteServiceError('Invalid file size', 400, 'upload_size');
  }
}

export function dataUrlToFile(dataUrl: string, name: string, profile = false): File {
  const comma = dataUrl.indexOf(',');
  const metadata = dataUrl.slice(0, comma);
  const match = /^data:([^;,]+);base64$/.exec(metadata);
  if (comma < 0 || !match) throw new AppwriteServiceError('Invalid file data', 400, 'upload_format');
  const encodedLength = dataUrl.length - comma - 1;
  const padding = dataUrl.endsWith('==') ? 2 : dataUrl.endsWith('=') ? 1 : 0;
  const estimatedSize = Math.floor(encodedLength * 3 / 4) - padding;
  validateUpload({ name, type: match[1], size: estimatedSize }, profile);
  let bytes: string;
  try { bytes = atob(dataUrl.slice(comma + 1)); }
  catch { throw new AppwriteServiceError('Invalid file data', 400, 'upload_format'); }
  const buffer = Uint8Array.from(bytes, (byte) => byte.charCodeAt(0));
  const file = new File([buffer], name, { type: match[1] });
  validateUpload(file, profile);
  return file;
}

export async function uploadInChunks(
  file: File,
  fileId: string,
  permissions: string[],
  send: (body: FormData, headers: Record<string, string>, signal?: AbortSignal) => Promise<Record<string, unknown>>,
  control?: UploadControl
): Promise<void> {
  if (file.size <= 0) throw new AppwriteServiceError('Empty upload', 400, 'upload_size');
  const totalChunks = Math.ceil(file.size / UPLOAD_CHUNK_SIZE);
  for (let start = 0, chunk = 1; start < file.size; start += UPLOAD_CHUNK_SIZE, chunk += 1) {
    control?.checkCancellation();
    const end = Math.min(start + UPLOAD_CHUNK_SIZE, file.size);
    const body = new FormData();
    body.append('fileId', fileId);
    body.append('file', file.slice(start, end, file.type), file.name);
    permissions.forEach((permission) => body.append('permissions[]', permission));
    const headers: Record<string, string> = {};
    if (totalChunks > 1) headers['Content-Range'] = `bytes ${start}-${end - 1}/${file.size}`;
    if (start > 0) headers['X-Appwrite-ID'] = fileId;
    const response = await send(body, headers, control?.controller.signal);
    if (response.$id !== fileId || (totalChunks > 1 && (
      response.chunksUploaded !== chunk || response.chunksTotal !== totalChunks
    ))) throw new AppwriteServiceError('Invalid upload response', 502);
    control?.checkCancellation();
    control?.onProgress?.(end, file.size);
  }
}

export async function messageOperationId(userId: string, threadId: string, operationId: string): Promise<string> {
  const input = new TextEncoder().encode(`${userId}\n${threadId}\n${operationId.toLowerCase()}`);
  const digest = await crypto.subtle.digest('SHA-256', input);
  return 'm_' + Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('').slice(0, 32);
}
