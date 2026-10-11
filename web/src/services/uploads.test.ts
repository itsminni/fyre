import { describe, expect, it, vi } from 'vitest';
import fixtures from '../../../shared/contracts/fixtures/message-identity.json';
import { CHAT_ATTACHMENT_LIMIT, dataUrlToFile, messageOperationId, uploadInChunks, UPLOAD_CHUNK_SIZE, UploadControl, validateUpload } from './uploads';

describe('bounded uploads', () => {
  it('rejects oversized data before decoding it', () => {
    const decode = vi.spyOn(globalThis, 'atob');
    const oversized = 'data:application/pdf;base64,' + 'A'.repeat(Math.ceil(CHAT_ATTACHMENT_LIMIT * 4 / 3) + 4);
    expect(() => dataUrlToFile(oversized, 'large.pdf')).toThrow('Invalid file size');
    expect(decode).not.toHaveBeenCalled();
    decode.mockRestore();
  });

  it('rejects empty files and mismatched extensions', () => {
    expect(() => validateUpload({ name: 'empty.pdf', type: 'application/pdf', size: 0 })).toThrow();
    expect(() => validateUpload({ name: 'photo.jpg', type: 'application/pdf', size: 20 })).toThrow();
    expect(() => validateUpload({ name: 'audio.wav', type: 'audio/wav', size: 20 }, true)).toThrow();
  });

  it('uses exact ranges, a stable ID and progress across multiple chunks', async () => {
    const file = new File([new Uint8Array(UPLOAD_CHUNK_SIZE + 3)], 'test.pdf', { type: 'application/pdf' });
    const progress = vi.fn();
    const send = vi.fn().mockResolvedValueOnce({ $id: 'file', chunksUploaded: 1, chunksTotal: 2 })
      .mockResolvedValueOnce({ $id: 'file', chunksUploaded: 2, chunksTotal: 2 });
    await uploadInChunks(file, 'file', ['read("user:a")'], send, new UploadControl(progress));
    expect(send.mock.calls[0][1]).toEqual({ 'Content-Range': `bytes 0-${UPLOAD_CHUNK_SIZE - 1}/${file.size}` });
    expect(send.mock.calls[1][1]).toEqual({ 'Content-Range': `bytes ${UPLOAD_CHUNK_SIZE}-${file.size - 1}/${file.size}`, 'X-Appwrite-ID': 'file' });
    expect(send.mock.calls.map(([body]) => (body.get('file') as File).size)).toEqual([UPLOAD_CHUNK_SIZE, 3]);
    expect(progress.mock.calls).toEqual([[UPLOAD_CHUNK_SIZE, file.size], [file.size, file.size]]);
  });

  it('stops before the next chunk when cancelled and cannot cancel a commit', async () => {
    const file = new File([new Uint8Array(UPLOAD_CHUNK_SIZE + 1)], 'test.pdf');
    const control = new UploadControl();
    const send = vi.fn(async () => { control.cancel(); return { $id: 'file', chunksUploaded: 1, chunksTotal: 2 }; });
    await expect(uploadInChunks(file, 'file', [], send, control)).rejects.toThrow();
    expect(send).toHaveBeenCalledTimes(1);
    const commit = new UploadControl();
    commit.beginCommit(); commit.cancel();
    expect(commit.controller.signal.aborted).toBe(false);
    expect(commit.canCancel).toBe(false);
  });

  it('does not report success for a different file returned by storage', async () => {
    const progress = vi.fn();
    await expect(uploadInChunks(new File(['data'], 'a.pdf'), 'expected', [], async () => ({ $id: 'other' }), new UploadControl(progress))).rejects.toThrow('Invalid upload response');
    expect(progress).not.toHaveBeenCalled();
  });
});

describe('shared message identity', () => {
  for (const fixture of fixtures) {
    it(`matches ${fixture.messageId}`, async () => {
      expect(await messageOperationId(fixture.userId, fixture.threadId, fixture.operationId.toUpperCase())).toBe(fixture.messageId);
    });
  }
});
