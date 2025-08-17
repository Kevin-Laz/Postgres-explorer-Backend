const { validateTableName, isValidIdentifier, tableExists, columnExists } = require('../validators/ddl');

module.exports = {
  async validate(prisma, cmd) {
    const { table, from, to } = cmd || {};
    validateTableName(table);
    if (!isValidIdentifier(from)) return { ok: false, error: { code: 'invalid_name', target: { table, column: from }, message: 'Nombre de columna inválido (from).' } };
    if (!isValidIdentifier(to)) return { ok: false, error: { code: 'invalid_name', target: { table, column: to }, message: 'Nombre de columna inválido (to).' } };

    if (!await tableExists(prisma, table))
      return { ok: false, error: { code: 'not_found', target: { table }, message: `La tabla "${table}" no existe.` } };

    if (!await columnExists(prisma, table, from))
      return { ok: false, error: { code: 'not_found', target: { table, column: from }, message: `La columna "${from}" no existe.` } };

    if (await columnExists(prisma, table, to))
      return { ok: false, error: { code: 'already_exists', target: { table, column: to }, message: `La columna destino "${to}" ya existe.` } };

    return { ok: true };
  },

  async apply(prisma, cmd) {
    const { table, from, to } = cmd;
    const sql = `ALTER TABLE "${table}" RENAME COLUMN "${from}" TO "${to}";`;
    await prisma.$executeRawUnsafe(sql);
    return { warnings: [] };
  }
};
