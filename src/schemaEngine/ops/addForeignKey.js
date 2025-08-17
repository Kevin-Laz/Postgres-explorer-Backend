const { ValidationError } = require('../../errors');
const {
  validateTableName,
  isValidIdentifier,
  tableExists,
  columnExists,
} = require('../validators/ddl');

const ALLOWED_RULES = new Set(['NO ACTION','RESTRICT','CASCADE','SET NULL','SET DEFAULT']);

module.exports = {
  /**
   * cmd: { op:'ADD_FOREIGN_KEY', table, column, ref:{table,column}, onDelete?, onUpdate?, constraintName? }
   */
  async validate(prisma, cmd) {
    const { table, column, ref, onDelete, onUpdate } = cmd || {};
    validateTableName(table);
    if (!isValidIdentifier(column)) {
      return { ok: false, error: { code: 'invalid_name', target: { table, column }, message: 'Nombre de columna inválido.' } };
    }
    if (!ref?.table || !ref?.column) {
      return { ok: false, error: { code: 'invalid_payload', message: 'Debe incluir ref.table y ref.column.' } };
    }
    validateTableName(ref.table);
    if (!isValidIdentifier(ref.column)) {
      return { ok: false, error: { code: 'invalid_name', target: { table: ref.table, column: ref.column }, message: 'Columna de referencia inválida.' } };
    }

    if (!await tableExists(prisma, table)) {
      return { ok: false, error: { code: 'not_found', target: { table }, message: `Tabla "${table}" no existe.` } };
    }
    if (!await columnExists(prisma, table, column)) {
      return { ok: false, error: { code: 'not_found', target: { table, column }, message: `Columna "${column}" no existe.` } };
    }
    if (!await tableExists(prisma, ref.table)) {
      return { ok: false, error: { code: 'fk_table_missing', target: { table: ref.table }, message: `Tabla de referencia "${ref.table}" no existe.` } };
    }
    if (!await columnExists(prisma, ref.table, ref.column)) {
      return { ok: false, error: { code: 'fk_column_missing', target: { table: ref.table, column: ref.column }, message: `Columna de referencia "${ref.table}(${ref.column})" no existe.` } };
    }

    if (onDelete && !ALLOWED_RULES.has(onDelete.toUpperCase())) {
      return { ok: false, error: { code: 'invalid_rule', message: `onDelete inválido: ${onDelete}` } };
    }
    if (onUpdate && !ALLOWED_RULES.has(onUpdate.toUpperCase())) {
      return { ok: false, error: { code: 'invalid_rule', message: `onUpdate inválido: ${onUpdate}` } };
    }

    return { ok: true };
  },

  async apply(prisma, cmd) {
    const { table, column, ref, onDelete, onUpdate, constraintName } = cmd;
    const cname = constraintName && isValidIdentifier(constraintName)
      ? `"${constraintName}"`
      : `"${table}_${column}_fkey"`;

    const od = onDelete ? ` ON DELETE ${onDelete.toUpperCase()}` : '';
    const ou = onUpdate ? ` ON UPDATE ${onUpdate.toUpperCase()}` : '';

    const sql = `
      ALTER TABLE "${table}"
      ADD CONSTRAINT ${cname}
      FOREIGN KEY ("${column}") REFERENCES "${ref.table}"("${ref.column}")${od}${ou};
    `;
    await prisma.$executeRawUnsafe(sql);
    return { warnings: [] };
  }
};
