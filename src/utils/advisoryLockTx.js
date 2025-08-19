const crypto = require('crypto');

function hashToInt32Pair(keyScope) {
  const h = crypto.createHash('sha256').update(String(keyScope)).digest();
  const a = h.readInt32BE(0);
  const b = h.readInt32BE(4);
  return [a, b];
}

/**
 * Ejecuta fn(tx) dentro de una transacción Prisma que:
 *  - toma pg_advisory_lock(a,b) al inicio
 *  - ejecuta el callback con el "tx" (misma conexión)
 *  - libera el lock antes de terminar
 */
async function withAdvisoryLockTx(prisma, keyScope, fn, { timeoutMs = 60_000 } = {}) {
  const [a, b] = hashToInt32Pair(keyScope);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SELECT pg_advisory_lock(${a}, ${b});`);
    try {
      return await fn(tx);
    } finally {
      try {
        await tx.$executeRawUnsafe(`SELECT pg_advisory_unlock(${a}, ${b});`);
      } catch { /* no-op */ }
    }
  }, { timeout: timeoutMs });
}

module.exports = { withAdvisoryLockTx };
