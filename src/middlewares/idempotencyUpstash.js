// Idempotencia distribuida usando Upstash Redis
const crypto = require('crypto');

/** Crea una clave estable: método + ruta + hash(DB) + idempotency-key */
function defaultHasher(req) {
  const key = req.headers['x-idempotency-key'] || req.headers['idempotency-key'];
  if (!key) return null;
  const rawDb = typeof req.body?.databaseUrl === 'string' ? req.body.databaseUrl : '';
  const dbHash = crypto.createHash('sha256').update(rawDb).digest('hex').slice(0, 16);
  // incluir baseUrl+path para aislar por endpoint
  return `${req.method}:${req.baseUrl}${req.path}:${dbHash}:${key}`;
}

/**
 * Usa dos claves:
 *  - resultKey: guarda {status, body, headers} (JSON)
 *  - lockKey:   reserva ejecución (SET NX PX)
 * Si hay lock activo y aún no aparece el resultado, espera un poco (polling).
 */
function idempotencyUpstash(redis, {
  ttlMs = 10 * 60 * 1000,
  hasher = defaultHasher,
  waitMs = 1500,
  pollEveryMs = 120
} = {}) {
  return async function(req, res, next) {
    const cacheKey = hasher(req);
    if (!cacheKey) return next();

    const resultKey = `idem:result:${cacheKey}`;
    const lockKey   = `idem:lock:${cacheKey}`;

    try {
      // 1) ¿Hay resultado guardado?
      const existing = await redis.get(resultKey);
      if (existing) {
        const payload = typeof existing === 'string' ? JSON.parse(existing) : existing;
        if (payload.headers) for (const [k, v] of Object.entries(payload.headers)) res.setHeader(k, v);
        res.setHeader('x-idempotent-replay', '1');
        return res.status(payload.status).json(payload.body);
      }

      // 2) Intentar reservar ejecución (SET NX PX)
      // Upstash SDK: { nx: true, px: ttlMs } → devuelve "OK" si se setea
      const reserved = await redis.set(lockKey, 'pending', { nx: true, px: Math.max(ttlMs, 60_000) });
      if (reserved === 'OK') {
        // Este request es el "dueño" que ejecuta
        const originalJson = res.json.bind(res);
        res.json = async (body) => {
          const payload = {
            status: res.statusCode || 200,
            body,
            headers: {
              'x-idempotency-key': req.headers['x-idempotency-key'] || req.headers['idempotency-key']
            }
          };
          await redis.set(resultKey, JSON.stringify(payload), { px: ttlMs });
          await redis.del(lockKey); // liberar lock (opc: dejar expirar)
          return originalJson(body);
        };
        return next();
      }

      // 3) Otro request ejecutando → esperar a que aparezca el resultado
      const deadline = Date.now() + waitMs;
      while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, pollEveryMs));
        const again = await redis.get(resultKey);
        if (again) {
          const payload = typeof again === 'string' ? JSON.parse(again) : again;
          if (payload.headers) for (const [k, v] of Object.entries(payload.headers)) res.setHeader(k, v);
          res.setHeader('x-idempotent-replay', '1');
          return res.status(payload.status).json(payload.body);
        }
        const lockVal = await redis.get(lockKey);
        if (!lockVal) break; // lock expiró y no hay resultado → permitir re-ejecución
      }

      // 4) Sigue “en progreso” → pedir reintento suave
      res.setHeader('retry-after', '1');
      return res.status(409).json({
        error: true,
        code: 'idempotency_in_progress',
        message: 'La operación está en curso. Intenta nuevamente en breve.'
      });
    } catch (e) {
      // Si falla Upstash, no se bloquea la operación
      return next();
    }
  };
}

module.exports = { idempotencyUpstash };
