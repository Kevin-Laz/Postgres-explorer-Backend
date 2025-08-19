const { normalizeError } = require('../utils/errorNormalizer');
const { redactDbUrl } = require('../utils/sanitize');

function safeLogError(err, req) {
  try {
    // Evita imprimir databaseUrl completo en logs
    const body = { ...req.body };
    if (body && body.databaseUrl) body.databaseUrl = redactDbUrl(body.databaseUrl);

    // Log breve con requestId
    console.error(
      `[${req.method}] ${req.originalUrl} (reqId=${req.requestId || '-'}) → ${err.name || 'Error'}: ${err.message}`
    );

    // Log técnico resumido
    /*if (process.env.NODE_ENV !== 'production') {
      console.error('stack:', err.stack);
      console.error('sanitized body:', body);
    }*/
  } catch (e) {
    // no-op
  }
}

function errorHandler(err, req, res, _next) {
  const requestId = req?.context?.requestId || null;
  const out = normalizeError(err, requestId);

  safeLogError(err, req);

  return res.status(out.status).json(out.body);
}

module.exports = errorHandler;
