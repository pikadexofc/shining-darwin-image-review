import { readInventory, sendJson } from '../lib/review-store.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return sendJson(res, { error: 'Method not allowed' }, 405);
  try {
    const inventory = await readInventory();
    sendJson(res, inventory.rows.map(({ id, service, title, role, status, currentHash, versions }) => ({
      id, service, title, role, status, currentHash,
      versions: versions.map(({ hash, label, current, time }) => ({ hash, label, current: !!current, time }))
    })));
  } catch (error) { sendJson(res, { error: error.message }, 503); }
}

