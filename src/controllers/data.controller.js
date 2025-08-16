const { Prisma } = require('@prisma/client');
const createPrismaClient = require('../utils/createPrismaClient');
const { validateDatabaseUrl } = require('../validators/databaseUrlValidator');
const { validateTableName } = require('../validators/tableNameValidator');
const { ensureTableExists } = require('../validators/ensureTableExists');
const { ValidationError, DatabaseError, AppError } = require('../errors');

async function getTableColumns(prisma, table) {
  const rows = await prisma.$queryRaw`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${table}
    ORDER BY ordinal_position
  `;
  return rows.map(r => r.column_name);
}

function isValidIdentifier(name) {
  return typeof name === 'string' && /^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(name);
}

const insertData = async (req, res, next) => {
  let prisma;
  try {
    const { databaseUrl, data } = req.body;
    const { table } = req.params;

    validateDatabaseUrl(databaseUrl);
    validateTableName(table);
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return next(new ValidationError('data debe ser un objeto que contenga un array de los datos.'));
    }

    prisma = createPrismaClient(databaseUrl);
    await ensureTableExists(prisma, table);

    const keys = Object.keys(data);
    const tableCols = await getTableColumns(prisma, table);

    if (keys.length === 0) {
      return next(new ValidationError('No se proporcionaron campos para insertar.'));
    }

    // Validar nombres de columnas y existencia
    for (const k of keys) {
      if (!isValidIdentifier(k)) {
        return next(new ValidationError(`Nombre de columna inválido: "${k}"`));
      }
      if (!tableCols.includes(k)) {
        return next(new ValidationError(`La columna "${k}" no existe en "${table}".`));
      }
    }

    const values = keys.map(k => data[k]);

    // columnas validadas como identificadores, valores parametrizados
    const colsSql = Prisma.raw(keys.map(k => `"${k}"`).join(', '));
    const valsSql = Prisma.join(values.map(v => Prisma.sql`${v}`));

    const sql = Prisma.sql`INSERT INTO ${Prisma.raw(`"${table}"`)} (${colsSql}) VALUES (${valsSql}) RETURNING *;`;
    const result = await prisma.$queryRaw(sql);

    res.json(result);
  } catch (error) {
    if (error instanceof AppError) return next(error);
    next(new DatabaseError(error.message));
  } finally {
    if (prisma) await prisma.$disconnect();
  }
};


const getData = async (req, res, next) => {
  let prisma;
  try {
    const { databaseUrl, limit, offset, orderBy, orderDir } = req.body;
    const { table } = req.params;

    validateDatabaseUrl(databaseUrl);
    validateTableName(table);

    prisma = createPrismaClient(databaseUrl);
    await ensureTableExists(prisma, table);

    // Introspección de columnas para validar orderBy
    const cols = await prisma.$queryRaw`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ${table}
    `;
    const colSet = new Set(cols.map(r => r.column_name));

    const safeLimit = Math.min(Math.max(parseInt(limit ?? 100, 10) || 100, 1), 500);
    const safeOffset = Math.max(parseInt(offset ?? 0, 10) || 0, 0);
    let orderClause = Prisma.empty;

    if (orderBy) {
      if (!isValidIdentifier(orderBy) || !colSet.has(orderBy)) {
        return next(new ValidationError(`orderBy inválido o columna inexistente: "${orderBy}"`));
      }
      const dir = (String(orderDir || 'ASC').toUpperCase() === 'DESC') ? 'DESC' : 'ASC';
      orderClause = Prisma.sql` ORDER BY ${Prisma.raw(`"${orderBy}"`)} ${Prisma.raw(dir)}`;
    }

    const result = await prisma.$queryRaw(
      Prisma.sql`SELECT * FROM ${Prisma.raw(`"${table}"`)}${orderClause} LIMIT ${safeLimit} OFFSET ${safeOffset}`
    );
    res.json(result);

  } catch (error) {
    if (error instanceof AppError) return next(error);
    next(new DatabaseError(error.message));
  } finally {
    if (prisma) await prisma.$disconnect();
  }
};

const updateData = async (req, res, next) => {
  let prisma;
  try {
    const { databaseUrl, data } = req.body;
    const { table, id } = req.params;

    validateDatabaseUrl(databaseUrl);
    validateTableName(table);

    if (!id || typeof id !== 'string') {
      return next(new ValidationError('El ID proporcionado es inválido.'));
    }

    if (!data || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).length === 0) {
      return next(new ValidationError('Debe proporcionar un objeto con los datos a actualizar.'));
    }

    prisma = createPrismaClient(databaseUrl);
    await ensureTableExists(prisma, table);

    const tableCols = await getTableColumns(prisma, table);
    const entries = Object.entries(data);

    for (const [k] of entries) {
      if (!isValidIdentifier(k)) {
        return next(new ValidationError(`Nombre de columna inválido: "${k}"`));
      }
      if (!tableCols.includes(k)) {
        return next(new ValidationError(`La columna "${k}" no existe en "${table}".`));
      }
    }

    const setParts = Prisma.join(
      entries.map(([k, v]) => Prisma.sql`${Prisma.raw(`"${k}"`)} = ${v}`),
      Prisma.raw(', ')
    );

    const result = await prisma.$queryRaw(
      Prisma.sql`UPDATE ${Prisma.raw(`"${table}"`)} SET ${setParts} WHERE ${Prisma.raw(`"id"`)} = ${id} RETURNING *;`
    );

    if (!Array.isArray(result) || result.length === 0) {
      return next(new ValidationError(`No se encontró el registro con ID "${id}".`));
    }

    res.json(result[0]);

  } catch (error) {
    if (error instanceof AppError) return next(error);
    next(new DatabaseError(error.message));
  } finally {
    if (prisma) await prisma.$disconnect();
  }
};

const deleteData = async (req, res, next) => {
  let prisma;
  try {
    const { databaseUrl } = req.body;
    const { table, id } = req.params;

    validateDatabaseUrl(databaseUrl);
    validateTableName(table);

    if (!id || typeof id !== 'string') {
      return next(new ValidationError('El ID proporcionado es inválido.'));
    }

    prisma = createPrismaClient(databaseUrl);
    await ensureTableExists(prisma, table);

    const result = await prisma.$queryRaw(
      Prisma.sql`DELETE FROM ${Prisma.raw(`"${table}"`)} WHERE ${Prisma.raw(`"id"`)} = ${id} RETURNING *;`
    );

    if (!Array.isArray(result) || result.length === 0) {
      return next(new ValidationError(`No se encontró el registro con ID "${id}" para eliminar.`));
    }

    res.json({ message: `Registro con ID "${id}" eliminado.`, deleted: result[0] });
  } catch (error) {
    if (error instanceof AppError) return next(error);
    next(new DatabaseError(error.message));
  } finally {
    if (prisma) await prisma.$disconnect();
  }
};



module.exports = { insertData, getData, updateData, deleteData };
