const { ValidationError } = require('../errors');
const { withOpResult, normalizeError } = require('./helpers/opResult');
const { resolveOp } = require('./ops/registry');

/**
 * commands: [{ op: 'RENAME_TABLE', ... }, ...]
 * mode: 'allOrNothing' | 'bestEffort'
 * dryRun: true | false
 */
async function applyCommands({ prisma, commands, dryRun = true, mode = 'allOrNothing' }) {
  const applied = [];
  const failed = [];
  const warnings = [];

  // Validar formato básico
  if (!Array.isArray(commands) || commands.length === 0) {
    throw new ValidationError('Debe enviar "commands" como un array no vacío');
  }

  // Helper para ejecutar una sola op (dryRun o real)
  const execOne = async (cmd) => {
    const impl = resolveOp(cmd?.op);
    if (!impl) {
      return withOpResult(cmd, 'ERROR', {
        code: 'unknown_op',
        message: `Operación no soportada: ${String(cmd?.op)}`
      });
    }
    try {
      // Validación/pre-checks
      const pre = await impl.validate(prisma, cmd);
      if (!pre.ok) {
        return withOpResult(cmd, 'ERROR', pre.error);
      }
      if (dryRun) {
        return withOpResult(cmd, 'OK', null, pre.warnings || []);
      }
      // Aplicar
      const out = await impl.apply(prisma, cmd);
      return withOpResult(cmd, 'OK', null, out.warnings || []);
    } catch (e) {
      return withOpResult(cmd, 'ERROR', normalizeError(e));
    }
  };

  if (dryRun || mode === 'bestEffort') {
    for (const c of commands) {
      const r = await execOne(c);
      if (r.status === 'OK') {
        applied.push({ op: c.op, status: 'OK' });
        if (r.warnings?.length) warnings.push(...r.warnings);
      } else {
        failed.push({ op: c.op, status: 'ERROR', ...r.error });
      }
    }
    return { success: failed.length === 0, applied, failed, warnings };
  }

  // allOrNothing (transacción)
  return await prisma.$transaction(async (tx) => {
    for (const c of commands) {
      const r = await execOne(c);
      if (r.status === 'OK') {
        applied.push({ op: c.op, status: 'OK' });
        if (r.warnings?.length) warnings.push(...r.warnings);
      } else {
        // aborta transacción
        throw new ValidationError(JSON.stringify({
          code: r.error?.code || 'op_failed',
          target: r.error?.target || null,
          message: r.error?.message || 'Operación fallida',
          details: r.error?.details || null
        }));
      }
    }
    return { success: true, applied, failed: [], warnings };
  }).catch((e) => {
    // parsear error para exponer primer fallo
    let parsed;
    try { parsed = JSON.parse(e.message); } catch { parsed = null; }
    return {
      success: false,
      applied,
      failed: parsed ? [{ status: 'ERROR', ...parsed }] : [{ status: 'ERROR', code: 'transaction_failed', message: e.message }],
      warnings
    };
  });
}

module.exports = applyCommands;
