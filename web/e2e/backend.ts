import { createHash } from 'node:crypto';
import type { Page } from '@playwright/test';

type Row = Record<string, unknown>;

export class Backend {
  sessionFails = false;
  discoveryFails = false;
  sendFailures = 0;
  sendBodies: Row[] = [];
  profileBodies: Row[] = [];
  profileGate: Promise<void> | null = null;
  historyGate: Promise<void> | null = null;
  historyRequests = 0;
  uploadGate: Promise<void> | null = null;
  uploads: Array<{ fileId: string; range: string | null }> = [];
  reconciled: string[] = [];
  private reservationCount = 0;
  discoveryRequests = 0;
  profile: Row = { $id: 'owner', firstName: 'Alex', lastName: 'Test', birthDate: '2000-01-01T00:00:00.000Z',
    city: 'Roma', bio: 'Original bio', gender: 'male', orientation: 'straight', preferredGenders: ['female'],
    minPreferredAge: 18, maxPreferredAge: 35, smokes: false, drinks: false, photoFileIds: [] };
  messages: Row[] = Array.from({ length: 120 }, (_, index) => ({ $id: `msg-${String(index).padStart(3, '0')}`,
    threadId: 'chat', senderUserId: 'peer', text: `Message ${index}`, createdAt: new Date(Date.UTC(2025, 0, 1, 12, index)).toISOString() }));

  async install(page: Page): Promise<void> {
    await page.route('**/*', (route) => route.request().url().startsWith('http://127.0.0.1:4173/') ? route.continue() : route.abort());
    await page.routeWebSocket('**/v1/realtime**', (socket) => socket.send(JSON.stringify({ type: 'connected', data: { channels: [], user: 'owner' } })));
    await page.route('https://geocoder.test/**', (route) => route.fulfill({ json: { features: [] } }));
    await page.route('https://appwrite.test/**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname.replace('/v1', '');
      const reply = (json: unknown, status = 200) => route.fulfill({ status, json,
        headers: { 'Access-Control-Allow-Origin': 'http://127.0.0.1:4173', 'Access-Control-Allow-Credentials': 'true',
          'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' } });
      if (request.method() === 'OPTIONS') return reply({});
      if (path === '/account') return this.sessionFails ? reply({ message: 'Unavailable' }, 503) : reply({ $id: 'owner', email: 'owner@example.test' });
      if (path === '/account/jwts') return reply({ jwt: 'e2e-jwt' }, 201);
      if (path.startsWith('/account/sessions')) return reply({}, request.method() === 'DELETE' ? 204 : 201);
      if (path.startsWith('/functions/')) {
        const envelope = JSON.parse(request.postDataJSON().body) as Row;
        if (path.split('/')[2] !== 'fyre-api') return reply({ message: 'Expected consolidated API' }, 400);
        const operations: Record<string, string> = {
          createorgetthread: 'create-thread', recordswipe: 'swipe', discoverprofiles: 'discover',
          manageprofile: 'profile', sendmessage: 'send-message', managerelationship: 'relationship',
          registerforevent: 'register', canceleventregistration: 'cancel', manageeventadmin: 'admin'
        };
        const functionId = operations[String(envelope.operation)];
        if (!functionId || !envelope.payload) return reply({ message: 'Invalid operation envelope' }, 400);
        const body = envelope.payload as Row;
        let payload: Row = {}; let status = 200;
        if (functionId === 'create-thread') payload = { threadId: 'chat', peer: { userId: 'peer', displayName: 'Bea', avatarUrl: null, lastSeenAt: null, presenceUpdatedAt: null } };
        if (functionId === 'swipe') payload = { matched: false };
        if (functionId === 'discover') {
          this.discoveryRequests++;
          if (this.discoveryFails) { status = 503; payload = { message: 'Offline' }; }
          else {
            const start = body.profileCursor === 'next' ? 6 : 0;
            payload = { profiles: Array.from({ length: 6 }, (_, index) => ({ id: `person-${start + index}`, name: `Person ${start + index}`, age: 25, bio: 'Profile', gender: 'female', photos: [], commonInterests: [], relationshipState: 'none' })), nextCursor: start === 0 ? 'next' : null };
          }
        }
        if (functionId === 'profile' && body.action === 'upsert') {
          this.profileBodies.push(body);
          this.profile = { ...this.profile, ...body };
          if (this.profileGate) await this.profileGate;
        }
        if (functionId === 'send-message' && body.action === 'reserveAttachment') {
          const fileId = 'u_' + String(++this.reservationCount).padStart(32, '0');
          payload = { supported: true, fileId };
        }
        if (functionId === 'send-message' && body.action === 'reconcileAttachment') {
          this.reconciled.push(String(body.attachmentFileId));
          payload = { status: 'discarded', fileId: body.attachmentFileId };
        }
        if (functionId === 'send-message' && !body.action) {
          this.sendBodies.push(body);
          if (this.sendFailures-- > 0) { status = 503; payload = { message: 'Unavailable' }; }
          else {
            const id = 'm_' + createHash('sha256').update(`owner\n${body.threadId}\n${String(body.operationId).toLowerCase()}`).digest('hex').slice(0, 32);
            const row = { ...body, $id: id, senderUserId: 'owner', createdAt: new Date().toISOString() };
            this.messages.push(row);
            payload = { ...row, messageId: id };
          }
        }
        return reply({ $id: 'execution', status: 'completed', responseStatusCode: status, responseBody: JSON.stringify(payload) }, 201);
      }
      if (path === '/storage/buckets/attachments/files' && request.method() === 'POST') {
        const body = request.postDataBuffer()?.toString('latin1') ?? '';
        const fileId = /name="fileId"\r\n\r\n([^\r]+)/.exec(body)?.[1] ?? '';
        const range = request.headers()['content-range'] ?? null;
        this.uploads.push({ fileId, range });
        if (this.uploadGate) await this.uploadGate;
        const parts = range ? /bytes (\d+)-(\d+)\/(\d+)/.exec(range) : null;
        const total = parts ? Math.ceil(Number(parts[3]) / (5 * 1024 * 1024)) : 1;
        const uploaded = parts ? Math.ceil((Number(parts[2]) + 1) / (5 * 1024 * 1024)) : 1;
        return reply({ $id: fileId, chunksTotal: total, chunksUploaded: uploaded }, 201).catch(() => undefined);
      }
      const match = /^\/tablesdb\/database\/tables\/([^/]+)\/rows(?:\/([^/]+))?$/.exec(path);
      if (!match) return reply({ message: `Unexpected request: ${path}` }, 404);
      const [, table, id] = match;
      const participants: Row[] = [{ $id: 'owner-participant', userId: 'owner', threadId: 'chat', lastReadAt: '2024-01-01T00:00:00.000Z', notificationsEnabled: true },
        { $id: 'peer-participant', userId: 'peer', threadId: 'chat' }];
      const rowsByTable: Record<string, Row[]> = { profiles: [this.profile], messages: this.messages,
        threads: [{ $id: 'chat', threadId: 'chat', createdAt: '2024-01-01T00:00:00.000Z' }], participants,
        relationships: [{ $id: 'relationship', pairKey: 'owner:peer', userAId: 'owner', userBId: 'peer', userAState: 'liked', userBState: 'liked', threadId: 'chat' }] };
      let rows = [...(rowsByTable[table] ?? [])];
      if (id) { const row = rows.find((value) => value.$id === id); return row ? reply(row) : reply({ message: 'Missing row' }, 404); }
      const queries = url.searchParams.getAll('queries[]').map((query) => JSON.parse(query) as { method: string; attribute?: string; values?: unknown[] });
      for (const query of queries) {
        if (query.method === 'equal') rows = rows.filter((row) => query.values?.includes(row[query.attribute!]));
        if (query.method === 'notEqual') rows = rows.filter((row) => !query.values?.includes(row[query.attribute!]));
        if (query.method === 'greaterThan') rows = rows.filter((row) => String(row[query.attribute!]) > String(query.values?.[0]));
      }
      const total = rows.length;
      if (table === 'messages' && queries.some((query) => query.method === 'orderDesc')) rows.sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)) || String(right.$id).localeCompare(String(left.$id)));
      const cursor = queries.find((query) => query.method === 'cursorAfter')?.values?.[0];
      if (cursor) {
        if (table === 'messages') { this.historyRequests++; if (this.historyGate) await this.historyGate; }
        rows = rows.slice(rows.findIndex((row) => row.$id === cursor) + 1);
      }
      const limit = Number(queries.find((query) => query.method === 'limit')?.values?.[0] ?? 25);
      return reply({ rows: rows.slice(0, limit), total });
    });
  }
}
