import { allowedVersion, readEvents, readInventory, readRequestJson, sameOrigin, saveEvent, sendJson, toFeedback, visitorKey } from '../lib/review-store.js';

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') return sendJson(res, toFeedback(await readEvents()));
    if (req.method !== 'POST') return sendJson(res, { error: 'Method not allowed' }, 405);
    if (!sameOrigin(req)) return sendJson(res, { error: 'Origin rejected' }, 403);
    const body = await readRequestJson(req);
    const id = String(body.id || ''), hash = String(body.hash || '').toLowerCase();
    const valid = allowedVersion(await readInventory(), id, hash);
    if (!valid) return sendJson(res, { error: 'Unknown image version' }, 400);
    const events = await readEvents();
    const key = visitorKey(req), now = Date.now();
    const recent = events.filter(event => event.visitor === key && now - Date.parse(event.time) < 60_000).length;
    if (recent >= 30) return sendJson(res, { error: 'Review rate limit reached. Try again in a minute.' }, 429);
    const time = new Date(now).toISOString();
    let event;
    if (body.kind === 'comment') {
      if (typeof body.note !== 'string' || !body.note.trim() || body.note.trim().length > 1500) return sendJson(res, { error: 'Comment must be 1 to 1500 characters' }, 400);
      event = { kind: 'comment', id, hash, time, note: body.note.trim(), visitor: key };
    } else if (body.kind === 'reaction') {
      if (!['like', 'dislike'].includes(body.vote)) return sendJson(res, { error: 'Invalid vote' }, 400);
      event = { kind: 'reaction', id, hash, time, vote: body.vote, visitor: key };
    } else if (body.kind === 'approval') {
      if (events.some(item => item.kind === 'approval' && item.id === id && item.hash === hash)) return sendJson(res, { ok: true, duplicate: true });
      event = { kind: 'approval', id, hash, time, visitor: key };
    } else return sendJson(res, { error: 'Unknown feedback type' }, 400);
    await saveEvent(event);
    return sendJson(res, { ok: true });
  } catch (error) { return sendJson(res, { error: error.message || 'Unable to save feedback' }, 400); }
}

