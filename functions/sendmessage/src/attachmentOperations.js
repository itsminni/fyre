import { randomUUID } from "node:crypto";

// Reserved IDs are allocated by this backend before a client uploads any bytes.
// Never turn a legacy file into a managed file: an older execution may still reference it.
export const isManagedAttachment = (fileId) => /^u_[a-f0-9]{32}$/.test(fileId ?? "");
export const isManagedProfileUpload = (fileId) => /^p_[a-f0-9]{32}$/.test(fileId ?? "");

export function attachmentOperations(request, { profile = false } = {}) {
  const managed = profile ? isManagedProfileUpload : isManagedAttachment;
  const fail = (statusCode, message) => Object.assign(new Error(message), { statusCode });
  const rowsPath = (config, tableId) => `/tablesdb/${encodeURIComponent(config.databaseId)}/tables/${encodeURIComponent(tableId)}/rows`;
  const ledgerPath = (config) => {
    if (!config.attachmentOperationsTableId) throw fail(503, "Attachment operations unavailable");
    return rowsPath(config, config.attachmentOperationsTableId);
  };
  const decisionId = (fileId) => `${profile ? "q" : "d"}_${fileId.slice(2)}`;
  const optional = async (config, path) => {
    try { return await request(config, "GET", path); }
    catch (error) { if (error.statusCode === 404) return null; throw error; }
  };
  const validate = (row, ownerUserId, threadId, fileId) => {
    if (!row || row.ownerUserId !== ownerUserId || row.threadId !== threadId || row.fileId !== fileId) {
      throw fail(403, "Attachment reservation unavailable");
    }
    return row;
  };
  const reservation = async (config, ownerUserId, threadId, fileId) => {
    if (!managed(fileId)) throw fail(400, "Unmanaged attachment");
    const row = validate(await optional(config, `${ledgerPath(config)}/${fileId}`), ownerUserId, threadId, fileId);
    if (row.kind !== "reserved") throw fail(409, "Invalid attachment reservation");
    return row;
  };

  async function reserve(config, ownerUserId, threadId, messageId) {
    if (!config.attachmentOperationsTableId) return { supported: false };
    const fileId = `${profile ? "p" : "u"}_${randomUUID().replaceAll("-", "")}`;
    await request(config, "POST", ledgerPath(config), {
      rowId: fileId, data: { ownerUserId, threadId, fileId, kind: "reserved", messageId }, permissions: []
    });
    return { supported: true, fileId };
  }

  async function createMessage(config, messageId, data, permissions) {
    const fileId = data.attachmentFileId;
    if (!isManagedAttachment(fileId)) {
      return request(config, "POST", rowsPath(config, config.messagesTableId), { rowId: messageId, data, permissions });
    }
    await validateReservation(config, data.senderUserId, data.threadId, fileId, messageId);
    const transaction = await request(config, "POST", "/tablesdb/transactions", { ttl: 60 });
    if (!transaction?.$id) throw fail(502, "Invalid transaction response");
    const transactionPath = `/tablesdb/transactions/${encodeURIComponent(transaction.$id)}`;
    try {
      // The message and decision become visible together. A cleanup that wins this
      // unique row ID prevents this entire transaction from committing, even much later.
      await request(config, "POST", ledgerPath(config), {
        rowId: decisionId(fileId),
        data: { ownerUserId: data.senderUserId, threadId: data.threadId, fileId, kind: "committed", messageId },
        permissions: [], transactionId: transaction.$id
      });
      await request(config, "POST", rowsPath(config, config.messagesTableId), {
        rowId: messageId, data, permissions, transactionId: transaction.$id
      });
      return await request(config, "PATCH", transactionPath, { commit: true });
    } catch (error) {
      // A lost commit response is uncertain. Rollback is best effort; never delete a file here.
      try { await request(config, "PATCH", transactionPath, { rollback: true }); } catch {}
      throw error;
    }
  }

  async function reconcile(config, ownerUserId, threadId, fileId) {
    await reservation(config, ownerUserId, threadId, fileId);
    const path = `${ledgerPath(config)}/${decisionId(fileId)}`;
    let decision = await optional(config, path);
    if (!decision) {
      try {
        decision = await request(config, "POST", ledgerPath(config), {
          rowId: decisionId(fileId), data: { ownerUserId, threadId, fileId, kind: "discarded" }, permissions: []
        });
      } catch (error) {
        if (error.statusCode !== 409) throw error;
        decision = await optional(config, path);
      }
    }
    validate(decision, ownerUserId, threadId, fileId);
    if (decision.kind === "committed") {
      return { status: "referenced", fileId, messageId: decision.messageId };
    }
    if (decision.kind !== "discarded") throw fail(409, "Invalid attachment decision");
    const bucketId = profile ? config.avatarsBucketId : config.chatAttachmentsBucketId;
    if (!bucketId) throw fail(503, "Missing upload bucket");
    const filePath = `/storage/buckets/${encodeURIComponent(bucketId)}/files/${fileId}`;
    const file = await optional(config, filePath);
    if (file) {
      const permissions = new Set(file.$permissions ?? []);
      if (!permissions.has(`update("user:${ownerUserId}")`) || !permissions.has(`delete("user:${ownerUserId}")`)) {
        throw fail(403, "Attachment ownership required");
      }
      try { await request(config, "DELETE", filePath); }
      catch (error) { if (error.statusCode !== 404) throw error; }
    }
    // Retain both rows permanently: retries of old sends must keep losing the same decision.
    return { status: "discarded", fileId };
  }

  async function validateReservation(config, ownerUserId, threadId, fileId, messageId) {
    const reserved = await reservation(config, ownerUserId, threadId, fileId);
    if (reserved.messageId !== messageId) throw fail(409, "Attachment reserved for another operation");
    const decision = await optional(config, `${ledgerPath(config)}/${decisionId(fileId)}`);
    if (decision) {
      validate(decision, ownerUserId, threadId, fileId);
      if (decision.kind === "discarded") throw fail(409, "Attachment was discarded");
      if (decision.kind !== "committed" || decision.messageId !== messageId) {
        throw fail(409, "Invalid attachment decision");
      }
    }
  }

  async function commitProfile(config, ownerUserId, fileIds, write) {
    const pending = [];
    for (const fileId of new Set(fileIds.filter(isManagedProfileUpload))) {
      await validateReservation(config, ownerUserId, "profile", fileId, ownerUserId);
      const decision = await optional(config, `${ledgerPath(config)}/${decisionId(fileId)}`);
      if (!decision) pending.push(fileId);
      else if (decision.kind !== "committed") throw fail(409, "Profile upload was discarded");
    }
    if (!pending.length) return write(undefined);
    const transaction = await request(config, "POST", "/tablesdb/transactions", { ttl: 60 });
    if (!transaction?.$id) throw fail(502, "Invalid transaction response");
    const path = `/tablesdb/transactions/${encodeURIComponent(transaction.$id)}`;
    try {
      for (const fileId of pending) {
        await request(config, "POST", ledgerPath(config), {
          rowId: decisionId(fileId), data: { ownerUserId, threadId: "profile", fileId, kind: "committed", messageId: ownerUserId },
          permissions: [], transactionId: transaction.$id
        });
      }
      await write(transaction.$id);
      return await request(config, "PATCH", path, { commit: true });
    } catch (error) {
      try { await request(config, "PATCH", path, { rollback: true }); } catch {}
      throw error;
    }
  }

  return { reserve, createMessage, reconcile, validateReservation, commitProfile };
}
