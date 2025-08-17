const { validateTableName, isValidIdentifier, tableExists, columnExists, getColumnType, requiresUsing } = require('../validators/ddl');

module.exports = {
  async validate(prisma, cmd) {
    const { table, column, newType, using } = cmd || {};
    validateTableName(table);
    if (!isValidIdentifier(column)) {
      return { ok: false, error: { code: 'invalid_name', target: { table, column }, message: 'Nombre de columna inválido.' } };
    }
    if (!newType || typeof newType !== 'string') {
      return { ok: false, error: { code: 'invalid_type', target: { table, column }, message: 'newType requerido (string).' } };
    }

    if (!await tableExists(prisma, table))
      return { ok: false, error: { code: 'not_found', target: { table }, message: `La tabla "${table}" no existe.` } };

    if (!await columnExists(prisma, table, column))
      return { ok: false, error: { code: 'not_found', target: { table, column }, message: `La columna "${column}" no existe.` } };

    const curr = await getColumnType(prisma, table, column);
    if (requiresUsing(curr, newType) && !using) {
      return {
        ok: false,
        error: {
          code: 'conversion_required',
          target: { table, column },
          message: `Cambio de tipo ${curr} → ${newType} puede requerir USING.`,
          hint: `Ejemplo: {"using": "${column}::${newType.toLowerCase().split('(')[0]}"}`
        }
      };
    }

    return { ok: true };
  },

  async apply(prisma, cmd) {
    const { table, column, newType, using } = cmd;
    const sql = `
      ALTER TABLE "${table}"
      ALTER COLUMN "${column}" TYPE ${newType}${using ? ` USING ${using}` : ''};
    `;
    await prisma.$executeRawUnsafe(sql);
    return { warnings: [] };
  }
};
