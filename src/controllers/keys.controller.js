const createPrismaClient = require('../utils/createPrismaClient');
const { ValidationError, DatabaseError, AppError } = require('../errors');
const { ensureTableExists } = require('../validators/ensureTableExists');
const { validateTableName } = require('../validators/tableNameValidator');
const { validateDatabaseUrl } = require('../validators/databaseUrlValidator');


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
    const { databaseUrl, reference } = req.body;
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
    await ensureTableExists(prisma, tableName);
    await ensureTableExists(prisma, reference.table);

    const query = `
      ALTER TABLE "${tableName}"
      ADD FOREIGN KEY ("${columnName}") REFERENCES "${reference.table}"("${reference.column}");
    `;
    await prisma.$executeRawUnsafe(query);

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
    await ensureTableExists(prisma, tableName);

    // Obtener el nombre de la constraint de la clave foránea
    const constraintResult = await prisma.$queryRaw`
      SELECT constraint_name
      FROM information_schema.key_column_usage
      WHERE table_name = ${tableName} AND column_name = ${columnName}
        AND position_in_unique_constraint IS NOT NULL
    `;

    if (!Array.isArray(constraintResult) || constraintResult.length === 0) {
      return next(new ValidationError(`No se encontró clave foránea sobre la columna "${columnName}" en la tabla "${tableName}".`));
    }

    const constraintName = constraintResult[0].constraint_name;

    const query = `ALTER TABLE "${tableName}" DROP CONSTRAINT "${constraintName}";`;
    await prisma.$executeRawUnsafe(query);

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
    const { databaseUrl, newReference } = req.body;
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
    await ensureTableExists(prisma, tableName);
    await ensureTableExists(prisma, newReference.table);

    // 1. Eliminar constraint actual
    const constraintResult = await prisma.$queryRaw`
      SELECT constraint_name
      FROM information_schema.key_column_usage
      WHERE table_name = ${tableName} AND column_name = ${columnName}
        AND position_in_unique_constraint IS NOT NULL
    `;

    if (constraintResult.length > 0) {
      const constraintName = constraintResult[0].constraint_name;
      await prisma.$executeRawUnsafe(`ALTER TABLE "${tableName}" DROP CONSTRAINT "${constraintName}";`);
    }

    // 2. Crear nueva constraint
    const addConstraintQuery = `
      ALTER TABLE "${tableName}"
      ADD FOREIGN KEY ("${columnName}") REFERENCES "${newReference.table}"("${newReference.column}");
    `;
    await prisma.$executeRawUnsafe(addConstraintQuery);

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