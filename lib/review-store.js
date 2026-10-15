import { get, list, put } from '@vercel/blob';
import { createHash, randomUUID } from 'node:crypto';

export const INVENTORY_PATH = 'data/review-inventory.json';
export const INITIAL_FEEDBACK_PATH = 'data/initial-feedback.json';

export function sendJson(res, value, status = 200) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(value));
}

export async function readBlobJson(pathname) {
  const result = await get(pathname, { access: 'private' });
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  return new Response(result.stream).json();
}

export async function readInventory() {
  const data = await readBlobJson(INVENTORY_PATH);
  if (!data || !Array.isArray(data.rows)) throw new Error('Review inventory is unavailable');
  return data;
}

export async function readEvents() {
  const initial = (await readBlobJson(INITIAL_FEEDBACK_PATH)) || { events: [] };
  const events = Array.isArray(initial.events) ? [...initial.events] : [];
  let cursor;
  do {
    const page = await list({ prefix: 'feedback/events/', limit: 1000, cursor });
    for (const blob of page.blobs || []) {
      const event = await readBlobJson(blob.pathname);
      if (event && typeof event === 'object') events.push(event);
    }
    cursor = page.cursor;
  } while (cursor);
  return events;
}

export function toFeedback(events) {
  const comments = [], reactions = [], approvals = [];
  for (const event of events) {
    const row = { time: event.time, slot: event.id, asset_sha256: event.hash };
    if (event.kind === 'comment') comments.push({ ...row, note: event.note, status: 'open' });
    if (event.kind === 'reaction') reactions.push({ ...row, vote: event.vote });
    if (event.kind === 'approval') approvals.push({ ...row, status: 'approved', source: 'review portal' });
  }
  return { comments, reactions, approvals };
}

export function allowedVersion(inventory, id, hash) {
  const row = inventory.rows.find(item => item.id === id);
  const version = row?.versions.find(item => item.hash === hash);
  return row && version ? { row, version } : null;
}

export async function readRequestJson(req, maxBytes = 4000) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new Error('Request too large');
    chunks.push(Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
}

export function visitorKey(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const raw = forwarded || String(req.headers['x-real-ip'] || 'unknown');
  return createHash('sha256').update(`${process.env.RATE_LIMIT_SALT || 'darwin-review'}:${raw}`).digest('hex').slice(0, 20);
}

export async function saveEvent(event) {
  const pathname = `feedback/events/${Date.now()}-${randomUUID()}.json`;
  await put(pathname, JSON.stringify(event), {
    access: 'private',
    addRandomSuffix: false,
    contentType: 'application/json',
    cacheControlMaxAge: 0,
  });
}

