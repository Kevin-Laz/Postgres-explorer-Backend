const createPrismaClient = require('../utils/createPrismaClient');
const { validateDatabaseUrl } = require('../validators/databaseUrlValidator');
const { validateTableName } = require('../validators/tableNameValidator');
const { ensureTableExists } = require('../validators/ensureTableExists');
const { ValidationError, DatabaseError, AppError } = require('../errors');

const insertData = async (req, res, next) => {
  let prisma;
  try {
    const { databaseUrl, data } = req.body;
    const { table } = req.params;

    validateDatabaseUrl(databaseUrl);
    validateTableName(table);
    if (typeof data !== 'object' || Array.isArray(data)) {
      return next(new ValidationError('data debe ser un objeto que contenga un array de los datos.'));
    }

    prisma = createPrismaClient(databaseUrl);
    await ensureTableExists(prisma, table);

    const keys = Object.keys(data);
    const values = Object.values(data);

    if (keys.length === 0) {
      return next(new ValidationError('No se proporcionaron campos para insertar.'));
    }

    const columnNames = keys.map(k => `"${k}"`).join(', ');
    const valueLiterals = values.map(v => {
      if (typeof v === 'string') return `'${v.replace(/'/g, "''")}'`;
      if (v === null) return 'NULL';
      return v;
    }).join(', ');

    const query = `INSERT INTO "${table}" (${columnNames}) VALUES (${valueLiterals}) RETURNING *;`;

    const result = await prisma.$queryRawUnsafe(query);
    res.json(result);
  } catch (error) {
    if (error instanceof AppError) return next(error);
    next(new DatabaseError(error.message));
  } finally {
    if (prisma) await prisma.$disconnect();
  }//  --M → Falta validacion más estricta de columnas, verificar si pertenecen a la tabla, y el tipo de dato insertado
}; //       → Dependencia actual de errores genericos que lanza la base de datos


const getData = async (req, res, next) => {
  let prisma;
  try {
    const { databaseUrl } = req.body;
    const { table } = req.params;

    validateDatabaseUrl(databaseUrl);
    validateTableName(table);

    prisma = createPrismaClient(databaseUrl);
    await ensureTableExists(prisma, table);

    const result = await prisma.$queryRawUnsafe(`SELECT * FROM "${table}"`);
    res.json(result);
  } catch (error) {
    if (error instanceof AppError) return next(error);
    next(new DatabaseError(error.message));
  } finally {
    if (prisma) await prisma.$disconnect();
  }
};

module.exports = { insertData, getData };
