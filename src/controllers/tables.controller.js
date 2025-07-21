const createPrismaClient = require('../utils/createPrismaClient');
const { ValidationError, DatabaseError, AppError } = require('../errors');
const { ensureTableExists } = require('../validators/ensureTableExists');
const { throwIfTableExists } = require('../validators/throwIfTableExists');
const validateColumn = require('../validators/validateColumn');
const { validateTableName } = require('../validators/tableNameValidator');
const { validateDatabaseUrl } = require('../validators/databaseUrlValidator');

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
    
    //Verificar si la tabla ya existe
    await throwIfTableExists(prisma, name);

    //Validar clave unica
    const primaryKeys = columns.filter(col => col.isPrimary === true);
    if (primaryKeys.length > 1) return next(new ValidationError('Solo se permite una columna como clave primaria.'));

    //Construir la tabla
    const columnDefs = columns.map((col, index) => {
      const validated = validateColumn(col, index);
      const { name, type, isNullable, isPrimary } = validated;
      const nullable = isNullable ? '' : 'NOT NULL';
      const primary = isPrimary ? 'PRIMARY KEY' : '';
      return `"${name}" ${type} ${nullable} ${primary}`.trim();
    }).join(', ');

    const query = `CREATE TABLE "${name}" (${columnDefs});`;
    await prisma.$executeRawUnsafe(query);

    res.status(200).json({ message: `Tabla "${name}" creada exitosamente.` });
  } catch (error) {
    if (error instanceof AppError) return next(error);
    return next(new DatabaseError(error.message));
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
    if (error instanceof AppError) return next(error);
    next(new DatabaseError(error.message));
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

    const filter = tableName ? `AND table_name = '${tableName}'` : '';

    const query = `
      SELECT table_name, column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public' ${filter}
      ORDER BY table_name, ordinal_position;
    `;
    const result = await prisma.$queryRawUnsafe(query);
    if (!Array.isArray(result)) {
      return next(new DatabaseError('Respuesta inesperada al obtener el esquema'));
    }

    res.json(result);
  } catch (error) {
    if (error instanceof AppError) return next(error);
    next(new DatabaseError(error.message));
  } finally {
    if (prisma) await prisma.$disconnect();
  }
};

module.exports = { createTable, deleteTable, getSchema };
