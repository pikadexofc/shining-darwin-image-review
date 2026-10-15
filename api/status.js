import { readInventory, sendJson } from '../lib/review-store.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return sendJson(res, { error: 'Method not allowed' }, 405);
  try {
    const inventory = await readInventory();
    sendJson(res, inventory.status);
  } catch (error) { sendJson(res, { error: error.message }, 503); }
}

