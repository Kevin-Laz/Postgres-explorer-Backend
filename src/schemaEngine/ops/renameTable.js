const { validateTableName, tableExists } = require('../validators/ddl');

module.exports = {
  async validate(prisma, cmd) {
    const { from, to } = cmd || {};
    validateTableName(from);
    validateTableName(to);

    const existsFrom = await tableExists(prisma, from);
    if (!existsFrom) {
      return { ok: false, error: { code: 'not_found', target: { table: from }, message: `La tabla "${from}" no existe.` } };
    }
    const existsTo = await tableExists(prisma, to);
    if (existsTo) {
      return { ok: false, error: { code: 'already_exists', target: { table: to }, message: `La tabla destino "${to}" ya existe.` } };
    }
    return { ok: true };
  },

  async apply(prisma, cmd) {
    const { from, to } = cmd;
    const sql = `ALTER TABLE "${from}" RENAME TO "${to}";`;
    await prisma.$executeRawUnsafe(sql);
    return { warnings: [] };
  }
};
