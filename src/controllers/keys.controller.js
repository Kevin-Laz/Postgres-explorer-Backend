const createPrismaClient = require('../utils/createPrismaClient');
const { ValidationError, DatabaseError, AppError } = require('../errors');
const { ensureTableExists } = require('../validators/ensureTableExists');
const { validateTableName } = require('../validators/tableNameValidator');
const { validateDatabaseUrl } = require('../validators/databaseUrlValidator');
const applyCommands = require('../schemaEngine/applyCommands');


function isValidIdentifier(name) {
  return typeof name === 'string' && /^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(name);
}

const listForeignKeys = async (req, res, next) => {
  let prisma;
  try {
    const { databaseUrl } = req.body;
    const { tableName } = req.params;

    validateDatabaseUrl(databaseUrl);
    validateTableName(tableName);

    prisma = createPrismaClient(databaseUrl);
    await ensureTableExists(prisma, tableName);

    const result = await prisma.$queryRaw`
      SELECT
        tc.constraint_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_name = ${tableName};
    `;

    res.json(result);
  } catch (error) {
    if (error instanceof AppError) return next(error);
    next(new DatabaseError(error.message));
  } finally {
    if (prisma) await prisma.$disconnect();
  }
};

const addForeignKey = async (req, res, next) => {
  let prisma;
  try {
    const { databaseUrl, reference, onDelete, onUpdate, constraintName } = req.body;
    const { tableName, columnName } = req.params;

    validateDatabaseUrl(databaseUrl);
    validateTableName(tableName);
    if (!isValidIdentifier(columnName)) return next(new ValidationError('Nombre de columna inválido.'));


    if (!reference?.table || !reference?.column) {
      return next(new ValidationError('La referencia debe incluir "table" y "column".'));
    }

    validateTableName(reference.table);
    if (!isValidIdentifier(reference.column)) return next(new ValidationError('Columna de referencia inválida.'));

    prisma = createPrismaClient(databaseUrl);
    
    const result = await applyCommands({
      prisma,
      dryRun: false,
      mode: 'allOrNothing',
      commands: [{
        op: 'ADD_FOREIGN_KEY',
        table: tableName,
        column: columnName,
        ref: { table: reference.table, column: reference.column },
        onDelete, onUpdate, constraintName
      }]
    });

    if (!result.success) {
      const err = result.failed?.[0] || {};
      return next(new DatabaseError(err.message || 'No se pudo agregar la clave foránea.'));
    }

    res.json({ message: `Clave foránea agregada a "${columnName}" en "${tableName}".` });
  } catch (error) {
    if (error instanceof AppError) return next(error);
    next(new DatabaseError(error.message));
  } finally {
    if (prisma) await prisma.$disconnect();
  }
};


const dropForeignKey = async (req, res, next) => {
  let prisma;
  try {
    const { databaseUrl } = req.body;
    const { tableName, columnName } = req.params;

    validateDatabaseUrl(databaseUrl);
    validateTableName(tableName);
    if (!isValidIdentifier(columnName)) return next(new ValidationError('Nombre de columna inválido.'));

    prisma = createPrismaClient(databaseUrl);
    
    const result = await applyCommands({
      prisma,
      dryRun: false,
      mode: 'allOrNothing',
      commands: [{ op: 'DROP_FOREIGN_KEY', table: tableName, column: columnName }]
    });

    if (!result.success) {
      const err = result.failed?.[0] || {};
      return next(new DatabaseError(err.message || 'No se pudo eliminar la clave foránea.'));
    }

    res.json({ message: `Clave foránea eliminada de "${columnName}" en "${tableName}".` });
  } catch (error) {
    if (error instanceof AppError) return next(error);
    next(new DatabaseError(error.message));
  } finally {
    if (prisma) await prisma.$disconnect();
  }
};

const updateForeignKey = async (req, res, next) => {
  let prisma;
  try {
    const { databaseUrl, newReference, onDelete, onUpdate, constraintName } = req.body;
    const { tableName, columnName } = req.params;

    validateDatabaseUrl(databaseUrl);
    validateTableName(tableName);
    if (!isValidIdentifier(columnName)) return next(new ValidationError('Nombre de columna inválido.'));

    if (!newReference?.table || !newReference?.column) {
      return next(new ValidationError('Referencia inválida. Debe incluir "table" y "column".'));
    }

    validateTableName(newReference.table);
    if (!isValidIdentifier(newReference.column)) return next(new ValidationError('Columna de referencia inválida.'));


    prisma = createPrismaClient(databaseUrl);
    
    const result = await applyCommands({
      prisma,
      dryRun: false,
      mode: 'allOrNothing',
      commands: [{
        op: 'UPDATE_FOREIGN_KEY',
        table: tableName,
        column: columnName,
        ref: { table: newReference.table, column: newReference.column },
        onDelete, onUpdate, constraintName
      }]
    });

    if (!result.success) {
      const err = result.failed?.[0] || {};
      return next(new DatabaseError(err.message || 'No se pudo actualizar la clave foránea.'));
    }
  
    res.json({ message: `Clave foránea actualizada para "${columnName}" en "${tableName}".` });
  } catch (error) {
    if (error instanceof AppError) return next(error);
    next(new DatabaseError(error.message));
  } finally {
    if (prisma) await prisma.$disconnect();
  }
};

module.exports = {
  listForeignKeys,
  addForeignKey,
  updateForeignKey,
  dropForeignKey
};