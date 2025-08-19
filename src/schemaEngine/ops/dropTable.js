const {
  validateTableName,
  tableExists,
} = require('../validators/ddl');

/**
 * cmd: { op:'DROP_TABLE', name, cascade?: boolean, ifExists?: boolean }
 */
module.exports = {
  async validate(prisma, cmd) {
    const { name, ifExists } = cmd || {};
    validateTableName(name);

    const exists = await tableExists(prisma, name);
    if (!exists && !ifExists) {
      return {
        ok: false,
        error: {
          code: 'not_found',
          target: { table: name },
          message: `La tabla "${name}" no existe.`
        }
      };
    }

    // Si no existe y ifExists=true, se trata como no-op válido.
    return { ok: true };
  },

  async apply(prisma, cmd) {
    const { name, cascade, ifExists } = cmd;
    const sql = `DROP TABLE ${ifExists ? 'IF EXISTS ' : ''}"${name}" ${cascade ? 'CASCADE' : ''};`;
    await prisma.$executeRawUnsafe(sql);

    return { warnings: [] };
  }
};
