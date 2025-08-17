const crypto = require('crypto');
const { Prisma } = require('@prisma/client');

/**
 * Genera un snapshot del esquema (public): tablas, columnas, PK, UNIQUE, CHECK, FK (con onDelete/onUpdate) e índices.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{ tableName?: string }} [opts]
 * @returns {Promise<{ schemaHash: string, generatedAt: string, schema: any }>}
 */
async function getSchemaSnapshot(prisma, opts = {}) {
  const tableName = opts.tableName || null;

  const tables = await fetchTables(prisma, tableName);
  const columns = await fetchColumns(prisma, tableName);
  const pks = await fetchPrimaryKeys(prisma, tableName);
  const uniques = await fetchUniqueConstraints(prisma, tableName);
  const checks = await fetchCheckConstraints(prisma, tableName);
  const fks = await fetchForeignKeys(prisma, tableName);
  const indexes = await fetchIndexes(prisma, tableName);

  // Armar objeto por tabla
  const byTable = new Map();
  for (const t of tables) {
    byTable.set(t, {
      name: t,
      columns: [],
      primaryKey: null,
      uniques: [],
      checks: [],
      foreignKeys: [],
      indexes: []
    });
  }

  for (const c of columns) {
    const t = byTable.get(c.table_name);
    if (!t) continue;
    t.columns.push({
      name: c.column_name,
      dataType: c.data_type,
      isNullable: c.is_nullable === 'YES',
      default: c.column_default,
      ordinal: c.ordinal_position
    });
  }

  for (const pk of pks) {
    const t = byTable.get(pk.table_name);
    if (!t) continue;
    t.primaryKey = { name: pk.constraint_name, columns: pk.columns };
  }

  for (const uq of uniques) {
    const t = byTable.get(uq.table_name);
    if (!t) continue;
    t.uniques.push({ name: uq.constraint_name, columns: uq.columns });
  }

  for (const ch of checks) {
    const t = byTable.get(ch.table_name);
    if (!t) continue;
    t.checks.push({ name: ch.constraint_name, expression: ch.check_clause });
  }

  for (const fk of fks) {
    const t = byTable.get(fk.table_name);
    if (!t) continue;
    t.foreignKeys.push({
      name: fk.constraint_name,
      column: fk.column_name,
      references: { table: fk.foreign_table_name, column: fk.foreign_column_name },
      onDelete: fk.delete_rule,
      onUpdate: fk.update_rule
    });
  }

  for (const ix of indexes) {
    const t = byTable.get(ix.table_name);
    if (!t) continue;
    t.indexes.push({
      name: ix.indexname,
      unique: /UNIQUE INDEX/i.test(ix.indexdef),
      columns: extractIndexColumns(ix.indexdef),
      definition: ix.indexdef
    });
  }

  // Normalizar y ordenar para hash estable
  const schema = normalizeSchema({
    tables: Array.from(byTable.values())
  });

  const hash = stableHash(schema);
  return {
    schemaHash: hash,
    generatedAt: new Date().toISOString(),
    schema
  };
}

// helpers (SQL)

async function fetchTables(prisma, tableName) {
  if (tableName) {
    const rows = await prisma.$queryRaw`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name = ${tableName}
      ORDER BY table_name;
    `;
    return rows.map(r => r.table_name);
  }
  const rows = await prisma.$queryRaw`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name;
  `;
  return rows.map(r => r.table_name);
}

async function fetchColumns(prisma, tableName) {
  const filter = tableName ? Prisma.sql`AND table_name = ${tableName}` : Prisma.empty;
  return prisma.$queryRaw`
    SELECT table_name, column_name, data_type, is_nullable, column_default, ordinal_position
    FROM information_schema.columns
    WHERE table_schema = 'public' ${filter}
    ORDER BY table_name, ordinal_position;
  `;
}

async function fetchPrimaryKeys(prisma, tableName) {
  const filter = tableName ? Prisma.sql`AND tc.table_name = ${tableName}` : Prisma.empty;
  // Agregar columnas por constraint y preservar el orden
  const rows = await prisma.$queryRaw`
    SELECT tc.table_name, tc.constraint_name, kcu.column_name, kcu.ordinal_position
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_name = tc.constraint_name
      AND kcu.constraint_schema = tc.constraint_schema
    WHERE tc.table_schema = 'public'
      AND tc.constraint_type = 'PRIMARY KEY'
      ${filter}
    ORDER BY tc.table_name, tc.constraint_name, kcu.ordinal_position;
  `;
  // Agrupar
  const byC = new Map();
  for (const r of rows) {
    const key = `${r.table_name}::${r.constraint_name}`;
    if (!byC.has(key)) byC.set(key, { table_name: r.table_name, constraint_name: r.constraint_name, columns: [] });
    byC.get(key).columns.push(r.column_name);
  }
  return Array.from(byC.values());
}

async function fetchUniqueConstraints(prisma, tableName) {
  const filter = tableName ? Prisma.sql`AND tc.table_name = ${tableName}` : Prisma.empty;
  const rows = await prisma.$queryRaw`
    SELECT tc.table_name, tc.constraint_name, kcu.column_name, kcu.ordinal_position
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_name = tc.constraint_name
      AND kcu.constraint_schema = tc.constraint_schema
    WHERE tc.table_schema = 'public'
      AND tc.constraint_type = 'UNIQUE'
      ${filter}
    ORDER BY tc.table_name, tc.constraint_name, kcu.ordinal_position;
  `;
  const byC = new Map();
  for (const r of rows) {
    const key = `${r.table_name}::${r.constraint_name}`;
    if (!byC.has(key)) byC.set(key, { table_name: r.table_name, constraint_name: r.constraint_name, columns: [] });
    byC.get(key).columns.push(r.column_name);
  }
  return Array.from(byC.values());
}

async function fetchCheckConstraints(prisma, tableName) {
  const filter = tableName ? Prisma.sql`AND tc.table_name = ${tableName}` : Prisma.empty;
  return prisma.$queryRaw`
    SELECT tc.table_name, tc.constraint_name, cc.check_clause
    FROM information_schema.table_constraints tc
    JOIN information_schema.check_constraints cc
      ON cc.constraint_name = tc.constraint_name
      AND cc.constraint_schema = tc.constraint_schema
    WHERE tc.table_schema = 'public'
      AND tc.constraint_type = 'CHECK'
      ${filter}
    ORDER BY tc.table_name, tc.constraint_name;
  `;
}

async function fetchForeignKeys(prisma, tableName) {
  const filter = tableName ? Prisma.sql`AND tc.table_name = ${tableName}` : Prisma.empty;
  return prisma.$queryRaw`
    SELECT
      tc.table_name,
      tc.constraint_name,
      kcu.column_name,
      ccu.table_name AS foreign_table_name,
      ccu.column_name AS foreign_column_name,
      rc.update_rule,
      rc.delete_rule
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_name = tc.constraint_name
      AND kcu.constraint_schema = tc.constraint_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.constraint_schema = tc.constraint_schema
    JOIN information_schema.referential_constraints rc
      ON rc.constraint_name = tc.constraint_name
      AND rc.constraint_schema = tc.constraint_schema
    WHERE tc.table_schema = 'public'
      AND tc.constraint_type = 'FOREIGN KEY'
      ${filter}
    ORDER BY tc.table_name, tc.constraint_name, kcu.ordinal_position;
  `;
}

async function fetchIndexes(prisma, tableName) {
  if (tableName) {
    return prisma.$queryRaw`
      SELECT tablename AS table_name, indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = ${tableName}
      ORDER BY tablename, indexname;
    `;
  }
  return prisma.$queryRaw`
    SELECT tablename AS table_name, indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
    ORDER BY tablename, indexname;
  `;
}

// Helpers

function extractIndexColumns(indexdef) {
  // Ejemplo de indexof = CREATE UNIQUE INDEX ordenes_pkey ON public.ordenes USING btree (user_id, producto_id)
  const m = indexdef.match(/\(([^)]+)\)/);
  if (!m) return [];
  return m[1]
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

function normalizeSchema(schema) {
  // Ordenar tablas por nombre, columnas por ordinal y constraints por nombre
  const out = { tables: [] };
  const tables = [...(schema.tables || [])].sort((a, b) => a.name.localeCompare(b.name));
  for (const t of tables) {
    const table = {
      name: t.name,
      columns: [...(t.columns || [])].sort((a, b) => (a.ordinal ?? 0) - (b.ordinal ?? 0))
        .map(c => ({ name: c.name, dataType: c.dataType, isNullable: !!c.isNullable, default: c.default })),
      primaryKey: t.primaryKey ? { name: t.primaryKey.name, columns: [...t.primaryKey.columns] } : null,
      uniques: [...(t.uniques || [])].sort((a, b) => a.name.localeCompare(b.name))
        .map(u => ({ name: u.name, columns: [...u.columns] })),
      checks: [...(t.checks || [])].sort((a, b) => a.name.localeCompare(b.name))
        .map(c => ({ name: c.name, expression: c.expression })),
      foreignKeys: [...(t.foreignKeys || [])].sort((a, b) => a.name.localeCompare(b.name))
        .map(f => ({
          name: f.name,
          column: f.column,
          references: { table: f.references.table, column: f.references.column },
          onDelete: f.onDelete, onUpdate: f.onUpdate
        })),
      indexes: [...(t.indexes || [])].sort((a, b) => a.name.localeCompare(b.name))
        .map(i => ({ name: i.name, unique: !!i.unique, columns: [...i.columns], definition: i.definition }))
    };
    out.tables.push(table);
  }
  return out;
}

function stableHash(obj) {
  const s = stableStringify(obj);
  return crypto.createHash('sha256').update(s).digest('hex');
}

function stableStringify(obj) {
  // stringify con llaves ordenadas
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(',')}]`;
  const keys = Object.keys(obj).sort();
  const parts = keys.map(k => `${JSON.stringify(k)}:${stableStringify(obj[k])}`);
  return `{${parts.join(',')}}`;
}

module.exports = { getSchemaSnapshot };
