const { ValidationError } = require('../../errors');
const validateColumn = require('../../validators/validateColumn');
const {
  validateTableName,
  tableExists,
  columnExists,
} = require('../validators/ddl');

module.exports = {
  /**
   * cmd: { op:'CREATE_TABLE', name, columns:[ {name,type,isNullable,isPrimary,default,check,unique, references?:{table,column}} ] }
   */
  async validate(prisma, cmd) {
    const { name, columns } = cmd || {};
    validateTableName(name);

    if (!Array.isArray(columns) || columns.length === 0) {
      return { ok: false, error: { code: 'invalid_payload', message: 'Debe proveer "columns" (array no vacío).' } };
    }

    if (await tableExists(prisma, name)) {
      return { ok: false, error: { code: 'already_exists', target: { table: name }, message: `La tabla "${name}" ya existe.` } };
    }

    // duplicados
    const names = columns.map(c => c?.name);
    const set = new Set(names);
    if (set.size !== names.length) {
      return { ok: false, error: { code: 'duplicate_columns', target: { table: name }, message: 'Hay columnas con nombres duplicados.' } };
    }

    // validar columnas + FKs
    let needsGenRandomUUID = false;
    for (let i = 0; i < columns.length; i++) {
      const col = columns[i];
      try { validateColumn(col, i); }
      catch (e) {
        return { ok: false, error: { code: 'invalid_column', target: { table: name, column: col?.name }, message: e.message } };
      }

      if (typeof col.default === 'string' && col.default.toLowerCase().includes('gen_random_uuid')) {
        needsGenRandomUUID = true;
      }

      if (col.references) {
        const { table, column } = col.references;
        validateTableName(table);
        const tExists = await tableExists(prisma, table);
        if (!tExists) {
          return { ok: false, error: { code: 'fk_table_missing', target: { table: name, column: col.name }, message: `FK referencia tabla inexistente "${table}".` } };
        }
        const cExists = await columnExists(prisma, table, column);
        if (!cExists) {
          return { ok: false, error: { code: 'fk_column_missing', target: { table: name, column: col.name }, message: `FK referencia columna inexistente "${table}(${column})".` } };
        }
      }
    }

    // al menos una PK
    const primaryKeys = columns.filter(c => c.isPrimary === true);
    if (primaryKeys.length === 0) {
      return { ok: false, error: { code: 'missing_pk', target: { table: name }, message: 'Debe definir al menos una clave primaria.' } };
    }

    // gen_random_uuid disponible
    if (needsGenRandomUUID) {
      const r = await prisma.$queryRaw`
        SELECT 1 FROM pg_proc WHERE proname = 'gen_random_uuid' LIMIT 1
      `;
      if (!Array.isArray(r) || r.length === 0) {
        return {
          ok: false,
          error: {
            code: 'missing_extension',
            target: { table: name },
            message: 'gen_random_uuid() requiere extensión pgcrypto.',
            hint: 'Ejecute: CREATE EXTENSION IF NOT EXISTS "pgcrypto";'
          }
        };
      }
    }

    return { ok: true };
  },

  async apply(prisma, cmd) {
    const { name, columns } = cmd;

    const columnDefs = [];
    for (let i = 0; i < columns.length; i++) {
      const validated = validateColumn(columns[i], i);
      const { name: colName, type, isNullable, default: def, check, unique } = validated;
      const nullable = isNullable ? '' : 'NOT NULL';
      const defaultClause = def !== undefined
        ? `DEFAULT ${typeof def === 'string' && !/^gen_random_uuid\(\)$/i.test(def) ? `'${def}'` : def}`
        : '';
      const checkClause = check ? `CHECK (${check})` : '';
      const uniqueClause = unique ? 'UNIQUE' : '';
      columnDefs.push(`"${colName}" ${type} ${nullable} ${defaultClause} ${checkClause} ${uniqueClause}`.trim());
    }

    const pkCols = columns.filter(c => c.isPrimary).map(c => `"${c.name}"`);
    columnDefs.push(`PRIMARY KEY (${pkCols.join(', ')})`);

    for (const col of columns) {
      if (col.references) {
        const ref = col.references;
        columnDefs.push(`FOREIGN KEY ("${col.name}") REFERENCES "${ref.table}"("${ref.column}")`);
      }
    }

    const sql = `CREATE TABLE "${name}" (${columnDefs.join(', ')});`;
    await prisma.$executeRawUnsafe(sql);
    return { warnings: [] };
  }
};
