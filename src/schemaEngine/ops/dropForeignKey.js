const {
  validateTableName,
  isValidIdentifier,
  tableExists,
} = require('../validators/ddl');

module.exports = {
  /**
   * cmd: { op:'DROP_FOREIGN_KEY', table, column }
   */
  async validate(prisma, cmd) {
    const { table, column } = cmd || {};
    validateTableName(table);
    if (!isValidIdentifier(column)) {
      return { ok: false, error: { code: 'invalid_name', target: { table, column }, message: 'Nombre de columna inválido.' } };
    }
    if (!await tableExists(prisma, table)) {
      return { ok: false, error: { code: 'not_found', target: { table }, message: `Tabla "${table}" no existe.` } };
    }
    return { ok: true };
  },

  async apply(prisma, cmd) {
    const { table, column } = cmd;

    const r = await prisma.$queryRaw`
      SELECT constraint_name
      FROM information_schema.key_column_usage
      WHERE table_schema = 'public'
        AND table_name = ${table}
        AND column_name = ${column}
        AND position_in_unique_constraint IS NOT NULL
      LIMIT 1;
    `;
    if (!Array.isArray(r) || r.length === 0) {
      throw { code: 'not_found', target: { table, column }, message: `No se encontró clave foránea sobre "${column}".` };
    }
    const cname = r[0].constraint_name;
    await prisma.$executeRawUnsafe(`ALTER TABLE "${table}" DROP CONSTRAINT "${cname}";`);
    return { warnings: [] };
  }
};
