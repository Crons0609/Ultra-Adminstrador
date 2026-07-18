const functions = require('firebase-functions');
const admin = require('firebase-admin');

const TIMEZONE = 'America/Managua';

function localTimestamp() {
  return {
    epochMs: Date.now(),
    iso: new Date().toISOString(),
    timezone: TIMEZONE
  };
}

async function cleanupExpiredSessions(db, now) {
  const snap = await db.ref('sessions').once('value');
  if (!snap.exists()) return 0;

  const updates = {};
  let count = 0;
  snap.forEach(child => {
    const session = child.val() || {};
    if (session.expiresAt && Number(session.expiresAt) < now) {
      updates[`sessions/${child.key}`] = null;
      count += 1;
    }
  });

  if (count) await db.ref().update(updates);
  return count;
}

async function verifySaasPlans(db, now) {
  const snap = await db.ref('companies').once('value');
  if (!snap.exists()) return 0;

  const updates = {};
  let count = 0;
  snap.forEach(child => {
    const company = child.val() || {};
    if (company.planExpiresAt && Number(company.planExpiresAt) < now && company.status !== 'FALTA_PAGO') {
      updates[`companies/${child.key}/status`] = 'FALTA_PAGO';
      updates[`companies/${child.key}/statusReason`] = 'Plan SaaS vencido automáticamente';
      updates[`companies/${child.key}/updatedAtLocal`] = localTimestamp();
      updates[`${child.key}/config/status`] = 'FALTA_PAGO';
      updates[`${child.key}/config/statusReason`] = 'Plan SaaS vencido automáticamente';
      count += 1;
    }
  });

  if (count) await db.ref().update(updates);
  return count;
}

exports.systemMaintenance = functions.pubsub
  .schedule('every 15 minutes')
  .timeZone(TIMEZONE)
  .onRun(async () => {
    const db = admin.database();
    const now = Date.now();

    const expiredSessions = await cleanupExpiredSessions(db, now);
    const expiredPlans = await verifySaasPlans(db, now);

    await db.ref('system/cron/maintenance').set({
      ok: true,
      ranAt: admin.database.ServerValue.TIMESTAMP,
      ranAtLocal: localTimestamp(),
      expiredSessions,
      expiredPlans
    });

    return null;
  });
