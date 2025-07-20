const createPrismaClient = require('../utils/createPrismaClient');
const { ValidationError, DatabaseError, AppError } = require('../errors');
const validateColumn = require('../validators/validateColumn');

const createTable = async (req, res, next) => {
  const { name, columns, databaseUrl } = req.body;

  if (!name || !Array.isArray(columns) || !databaseUrl) {
    return next(new ValidationError('Faltan parámetros requeridos'));
  }
  //Verificar si la tabla ya existe
  const prisma = createPrismaClient(databaseUrl);
  try {
    const existsQuery = `
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = $name
      ) AS "exists";
    `;

    const checkResult = await prisma.$queryRawUnsafe(
      existsQuery.replace('$name', `'${name}'`) 
    );

    if (checkResult[0]?.exists) {
      return next(new ValidationError(`La tabla "${name}" ya existe.`));
    }

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
    await prisma.$disconnect();
  }
};

const deleteTable = async (req, res, next) => {
  const { tableName } = req.params;
  const { databaseUrl } = req.body;

  if (!databaseUrl) return next(new ValidationError('DATABASE_URL requerido'));

  const prisma = createPrismaClient(databaseUrl);
  try {
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "${tableName}" CASCADE`);
    res.json({ message: `Tabla "${tableName}" eliminada.` });
  } catch (err) {
    if (error instanceof AppError) return next(error);
    next(new DatabaseError(err.message));
  } finally {
    await prisma.$disconnect();
  }
};

const getSchema = async (req, res, next) => {
  const { databaseUrl } = req.body;
  if (!databaseUrl) return next(new ValidationError('DATABASE_URL requerido'));

  const prisma = createPrismaClient(databaseUrl);
  const query = `
    SELECT table_name, column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position;
  `;
  try {
    const result = await prisma.$queryRawUnsafe(query);
    res.json(result);
  } catch (err) {
    if (error instanceof AppError) return next(error);
    next(new DatabaseError(err.message));
  } finally {
    await prisma.$disconnect();
  }
};

module.exports = { createTable, deleteTable, getSchema };
