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
    const { tableName } = req.params;
    const { databaseUrl, cascade, ifExist } = req.body;

    validateDatabaseUrl(databaseUrl);
    if (tableName) validateTableName(tableName);

    prisma = createPrismaClient(databaseUrl);
    
    const result = await applyCommands({
      prisma,
      dryRun: false,
      mode: 'allOrNothing',
      commands: [{
        op: 'DROP_TABLE',
        name: tableName,
        cascade: !!cascade,     // default: false
        ifExists: !!ifExists    // default: false
      }]
    });

    if (!result.success) {
      const err = result.failed?.[0] || { code: 'drop_table_failed', message: 'No se pudo eliminar la tabla' };
      return propagateError(err, next);
    }

    res.json({ message: `Tabla "${tableName}" eliminada.` });
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

    validateColumn(column, 0);

    prisma = createPrismaClient(databaseUrl);
    const result = await applyCommands({
      prisma,
      dryRun: false,
      mode: 'allOrNothing',
      commands: [{ op: 'ADD_COLUMN', table: tableName, column }]
    });

    if (!result.success) return propagateError(result.failed?.[0], next);
    res.json({ message: `Columna "${column.name}" añadida a "${tableName}".` });

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
    const result = await applyCommands({
      prisma,
      dryRun: false,
      mode: 'allOrNothing',
      commands: [{ op: 'DROP_COLUMN', table: tableName, column: columnName, cascade: true }]
    });

    if (!result.success) return propagateError(result.failed?.[0], next);
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
    const result = await applyCommands({
      prisma,
      dryRun: false,
      mode: 'allOrNothing',
      commands: [{ op: 'RENAME_COLUMN', table: tableName, from: oldColumnName, to: newColumnName }]
    });

    if (!result.success) return propagateError(result.failed?.[0], next);
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
    const result = await applyCommands({
      prisma,
      dryRun: false,
      mode: 'allOrNothing',
      commands: [{ op: 'RENAME_TABLE', from: tableName, to: newTableName }]
    });

    if (!result.success) return propagateError(result.failed?.[0], next);
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

