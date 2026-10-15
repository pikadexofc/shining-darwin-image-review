import { get } from '@vercel/blob';
import { Readable } from 'node:stream';
import { allowedVersion, readInventory, sendJson } from '../lib/review-store.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return sendJson(res, { error: 'Method not allowed' }, 405);
  try {
    const id = String(req.query?.id || '');
    const hash = String(req.query?.hash || '').toLowerCase();
    if (!/^[a-z0-9-]{3,120}$/.test(id) || !/^[a-f0-9]{64}$/.test(hash)) { res.statusCode = 400; return res.end('Invalid image reference'); }
    const item = allowedVersion(await readInventory(), id, hash);
    if (!item) { res.statusCode = 404; return res.end('Image version not found'); }
    const result = await get(item.version.assetKey, { access: 'private', ifNoneMatch: req.headers['if-none-match'] });
    if (!result) { res.statusCode = 404; return res.end('Image not found'); }
    res.setHeader('Cache-Control', 'private, no-cache');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('ETag', result.blob.etag);
    if (result.statusCode === 304) { res.statusCode = 304; return res.end(); }
    res.setHeader('Content-Type', result.blob.contentType || 'application/octet-stream');
    res.setHeader('Content-Length', String(result.blob.size || ''));
    return Readable.fromWeb(result.stream).pipe(res);
  } catch (error) { return sendJson(res, { error: error.message }, 503); }
}

