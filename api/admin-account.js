import usersHandler from '../lib/admin-handlers/admin-users.js';
import activateHandler from '../lib/admin-handlers/admin-activate-user.js';
import disableHandler from '../lib/admin-handlers/admin-disable-user.js';
import logsHandler from '../lib/admin-handlers/admin-logs.js';
import { setCors } from '../lib/cors.js';

function getRoute(req) {
  const q = String(req.query?.action || req.query?.route || '').trim().toLowerCase();
  if (q) return q;
  const b = String(req.body?.adminAction || req.body?.route || req.body?.action || '').trim().toLowerCase();
  if (b === 'bulk_extend_preview' || b === 'bulk_extend_apply') return 'activate';
  return b;
}

export default async function handler(req, res) {
  if (setCors(req, res)) return;
  const route = getRoute(req);
  if (route === 'users' || route === 'list-users' || route === 'list') return usersHandler(req, res);
  if (route === 'activate' || route === 'extend' || route === 'bulk-extend') return activateHandler(req, res);
  if (route === 'disable' || route === 'lock' || route === 'cancel-pro') return disableHandler(req, res);
  if (route === 'logs' || route === 'revenue' || route === 'orders' || route === 'reset-history') {
    if ((route === 'revenue' || route === 'orders' || route === 'reset-history') && !req.query.type && !req.body?.type) {
      req.query.type = route;
    }
    return logsHandler(req, res);
  }
  return res.status(400).json({
    success: false,
    error: 'Thiếu action admin-account. Dùng action=users, activate, disable, logs, revenue, orders hoặc reset-history.'
  });
}
