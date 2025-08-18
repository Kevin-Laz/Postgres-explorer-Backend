const { Prisma } = require('@prisma/client');
const createPrismaClient = require('../utils/createPrismaClient');
const { ValidationError, DatabaseError, AppError } = require('../errors');
const { ensureTableExists } = require('../validators/ensureTableExists');
const validateColumn = require('../validators/validateColumn');
const { validateTableName } = require('../validators/tableNameValidator');
const { validateDatabaseUrl } = require('../validators/databaseUrlValidator');
const { propagateError } = require('../utils/propagateError');
const applyCommands = require('../schemaEngine/applyCommands');


const createTable = async (req, res, next) => {
  let prisma;
  try {
    const { name, columns, databaseUrl } = req.body;

    validateDatabaseUrl(databaseUrl);
    validateTableName(name);

    if (!Array.isArray(columns)) {
      return next(new ValidationError('Las columnas no se han definido correctamente'));
    }

    prisma = createPrismaClient(databaseUrl);
    
    const result = await applyCommands({
      prisma,
      dryRun: false,
      mode: 'allOrNothing',
      commands: [{ op: 'CREATE_TABLE', name, columns }]
    });

    if (!result.success) {
      // Unificar el primer error para la respuesta
      const err = result.failed?.[0] || { code: 'create_table_failed', message: 'No se pudo crear la tabla' };
      return propagateError(err, next);
    }
    res.status(200).json({ message: `Tabla "${name}" creada exitosamente.` });
  
  } catch (error) {
    return propagateError(error, next);
  } finally {
    if (prisma) await prisma.$disconnect();
  }
};


const deleteTable = async (req, res, next) => {
  let prisma;
  try {
    const { tableName } = req.params;
    const { databaseUrl } = req.body;

    validateDatabaseUrl(databaseUrl);
    if (tableName) validateTableName(tableName);
    prisma = createPrismaClient(databaseUrl);
    //Verificar si existe la tabla
    await ensureTableExists(prisma, tableName);
    //Eliminar la tabla
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "${tableName}" CASCADE`);
    res.json({ message: `Tabla "${tableName}" eliminada.` });
  } catch (error) {
    return propagateError(error, next);
  } finally {
    if (prisma) await prisma.$disconnect();
  }
};

const getSchema = async (req, res, next) => {
  let prisma;
  try {
    const { databaseUrl, tableName } = req.body;

    validateDatabaseUrl(databaseUrl);
    prisma = createPrismaClient(databaseUrl);

    if (tableName){
      validateTableName(tableName);
      await ensureTableExists(prisma, tableName);
    }

    const result = await prisma.$queryRaw`
      SELECT table_name, column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public' ${tableName ? Prisma.sql`AND table_name = ${tableName}` : Prisma.empty}
      ORDER BY table_name, ordinal_position;
    `;
    if (!Array.isArray(result)) {
      return next(new DatabaseError('Respuesta inesperada al obtener el esquema'));
    }

    res.json(result);
  } catch (error) {
    return propagateError(error, next);
  } finally {
    if (prisma) await prisma.$disconnect();
  }
};

const listTables = async (req, res, next) => {
  let prisma;
  try {
    const { databaseUrl } = req.body;
    validateDatabaseUrl(databaseUrl);

    prisma = createPrismaClient(databaseUrl);

    const result = await prisma.$queryRaw`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
    `;
    res.json(result.map(row => row.table_name));
  } catch (error) {
    return propagateError(error, next);
  } finally {
    if (prisma) await prisma.$disconnect();
  }
};

const getTableDetails = async (req, res, next) => {
  let prisma;
  try {
    const { databaseUrl } = req.body;
    const { tableName } = req.params;

    validateDatabaseUrl(databaseUrl);
    validateTableName(tableName);

    prisma = createPrismaClient(databaseUrl);
    await ensureTableExists(prisma, tableName);

    const result = await prisma.$queryRaw`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ${tableName}
      ORDER BY ordinal_position;
    `;
    res.json(result);
  } catch (error) {
    return propagateError(error, next);
  } finally {
    if (prisma) await prisma.$disconnect();
  }
};

const addColumn = async (req, res, next) => {
  let prisma;
  try {
    const { databaseUrl, tableName, column } = req.body;

    validateDatabaseUrl(databaseUrl);
    validateTableName(tableName);

    const validated = validateColumn(column, 0);

    prisma = createPrismaClient(databaseUrl);
    await ensureTableExists(prisma, tableName);

    const { name, type, isNullable, default: defaultValue, check, unique } = validated;
    const nullable = isNullable ? '' : 'NOT NULL';
    const defaultClause = defaultValue !== undefined ? `DEFAULT ${typeof defaultValue === 'string' ? `'${defaultValue}'` : defaultValue}` : '';
    const checkClause = check ? `CHECK (${check})` : '';
    const uniqueClause = unique ? 'UNIQUE' : '';

    const query = `
      ALTER TABLE "${tableName}"
      ADD COLUMN "${name}" ${type} ${nullable} ${defaultClause} ${checkClause} ${uniqueClause};
    `;
    await prisma.$executeRawUnsafe(query);
    res.json({ message: `Columna "${name}" añadida a "${tableName}".` });
  } catch (error) {
    return propagateError(error, next);
  } finally {
    if (prisma) await prisma.$disconnect();
  }
};

const deleteColumn = async (req, res, next) => {
  let prisma;
  try {
    const { databaseUrl } = req.body;
    const { tableName, columnName } = req.params;

    validateDatabaseUrl(databaseUrl);
    validateTableName(tableName);

    prisma = createPrismaClient(databaseUrl);
    await ensureTableExists(prisma, tableName);

    await prisma.$executeRawUnsafe(
      `ALTER TABLE "${tableName}" DROP COLUMN IF EXISTS "${columnName}" CASCADE;`
    );
    res.json({ message: `Columna "${columnName}" eliminada de "${tableName}".` });
  } catch (error) {
    return propagateError(error, next);
  } finally {
    if (prisma) await prisma.$disconnect();
  }
};

const renameColumn = async (req, res, next) => {
  let prisma;
  try {
    const { databaseUrl, newColumnName } = req.body;
    const { tableName, oldColumnName } = req.params;

    validateDatabaseUrl(databaseUrl);
    validateTableName(tableName);

    if (!newColumnName || typeof newColumnName !== 'string') {
      return next(new ValidationError('Nuevo nombre de columna inválido'));
    }

    prisma = createPrismaClient(databaseUrl);
    await ensureTableExists(prisma, tableName);

    await prisma.$executeRawUnsafe(
      `ALTER TABLE "${tableName}" RENAME COLUMN "${oldColumnName}" TO "${newColumnName}";`
    );
    res.json({ message: `Columna renombrada a "${newColumnName}" en "${tableName}".` });
  } catch (error) {
    return propagateError(error, next);
  } finally {
    if (prisma) await prisma.$disconnect();
  }
};

const renameTable = async (req, res, next) => {
  let prisma;
  try {
    const { databaseUrl, newTableName } = req.body;
    const { tableName } = req.params;

    validateDatabaseUrl(databaseUrl);
    validateTableName(tableName);
    validateTableName(newTableName);

    prisma = createPrismaClient(databaseUrl);
    await ensureTableExists(prisma, tableName);

    await prisma.$executeRawUnsafe(`ALTER TABLE "${tableName}" RENAME TO "${newTableName}";`);
    res.json({ message: `Tabla "${tableName}" renombrada a "${newTableName}".` });
  } catch (error) {
    return propagateError(error, next);
  } finally {
    if (prisma) await prisma.$disconnect();
  }
};

module.exports = {
  createTable,
  deleteTable,
  getSchema,
  listTables,
  getTableDetails,
  addColumn,
  deleteColumn,
  renameColumn,
  renameTable
};

