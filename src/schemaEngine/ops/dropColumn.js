const { validateTableName, isValidIdentifier, tableExists, columnExists } = require('../validators/ddl');

module.exports = {
  async validate(prisma, cmd) {
    const { table, column } = cmd || {};
    validateTableName(table);
    if (!isValidIdentifier(column))
      return { ok: false, error: { code: 'invalid_name', target: { table, column }, message: 'Nombre de columna inválido.' } };

    if (!await tableExists(prisma, table))
      return { ok: false, error: { code: 'not_found', target: { table }, message: `La tabla "${table}" no existe.` } };

    if (!await columnExists(prisma, table, column))
      return { ok: false, error: { code: 'not_found', target: { table, column }, message: `La columna "${column}" no existe.` } };

    return { ok: true };
  },

  async apply(prisma, cmd) {
    const { table, column, cascade } = cmd;
    const sql = `ALTER TABLE "${table}" DROP COLUMN "${column}" ${cascade ? 'CASCADE' : ''};`;
    await prisma.$executeRawUnsafe(sql);
    return { warnings: [] };
  }
};
