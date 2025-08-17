function withOpResult(cmd, status, error = null, warnings = []) {
  return { status, error, warnings };
}

function normalizeError(e) {
  if (!e) return { code: 'unknown', message: 'Error desconocido' };
  if (typeof e === 'string') return { code: 'error', message: e };
  if (e.code || e.message || e.target) return {
    code: e.code || 'error',
    message: e.message || 'Error',
    target: e.target || null,
    details: e.details || null,
    hint: e.hint || null
  };
  return { code: 'error', message: String(e) };
}

module.exports = { withOpResult, normalizeError };
