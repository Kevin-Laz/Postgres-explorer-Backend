const { validateTableName, isValidIdentifier, tableExists, columnExists } = require('../validators/ddl');
const validateColumn = require('../../validators/validateColumn');

module.exports = {
  async validate(prisma, cmd) {
    const { table, column } = cmd || {};
    validateTableName(table);
    if (!column || typeof column !== 'object') {
      return { ok: false, error: { code: 'invalid_payload', message: 'Debe proveer "column" como objeto.' } };
    }

    const existsT = await tableExists(prisma, table);
    if (!existsT) {
      return { ok: false, error: { code: 'not_found', target: { table }, message: `La tabla "${table}" no existe.` } };
    }

    try { validateColumn(column, 0); }
    catch (e) {
      return { ok: false, error: { code: 'invalid_column', target: { table, column: column?.name }, message: e.message } };
    }

    if (await columnExists(prisma, table, column.name)) {
      return { ok: false, error: { code: 'already_exists', target: { table, column: column.name }, message: `La columna "${column.name}" ya existe.` } };
    }

    return { ok: true };
  },

  async apply(prisma, cmd) {
    const { table, column } = cmd;
    const { name, type, isNullable, default: def, check, unique } = validateColumn(column, 0);

    const nullable = isNullable ? '' : 'NOT NULL';
    const defaultClause = def !== undefined ? `DEFAULT ${typeof def === 'string' ? `'${def}'` : def}` : '';
    const checkClause = check ? `CHECK (${check})` : '';
    const uniqueClause = unique ? 'UNIQUE' : '';

    const sql = `
      ALTER TABLE "${table}"
      ADD COLUMN "${name}" ${type} ${nullable} ${defaultClause} ${checkClause} ${uniqueClause};
    `;
    await prisma.$executeRawUnsafe(sql);
    return { warnings: [] };
  }
};
