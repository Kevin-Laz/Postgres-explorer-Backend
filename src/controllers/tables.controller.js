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
    await throwIfTableExists(prisma, name);

    // Validar nombres únicos
    const columnNames = columns.map(c => c.name);
    const nameSet = new Set(columnNames);
    if (nameSet.size !== columnNames.length) {
      return next(new ValidationError('Hay columnas con nombres duplicados.'));
    }

    // Validar referencias (claves foráneas)
    for (const col of columns) {
      if (col.references) {
        const { table, column } = col.references;
        if (!table || !column) {
          return next(new ValidationError(`La columna "${col.name}" tiene una referencia inválida.`));
        }
        // Validar que tabla y columna existan
        await ensureTableExists(prisma, table);
        const result = await prisma.$queryRawUnsafe(`
          SELECT column_name FROM information_schema.columns 
          WHERE table_name = '${table}' AND column_name = '${column}'
        `);
        if (result.length === 0) {
          return next(new ValidationError(`La clave foránea de "${col.name}" referencia a "${table}(${column})", pero no existe.`));
        }
      }
    }

    // Validar clave primaria compuesta (puede haber más de una)
    const primaryKeys = columns.filter(col => col.isPrimary === true);
    if (primaryKeys.length === 0) {
      return next(new ValidationError('Debe definir al menos una clave primaria.'));
    }

    // Construir definiciones de columnas
    const columnDefs = columns.map((col, index) => {
      const validated = validateColumn(col, index);
      const { name, type, isNullable, isPrimary } = validated;
      const nullable = isNullable ? '' : 'NOT NULL'; // no usar NULL explícito
      return `"${name}" ${type} ${nullable}`.trim();
    });

    // Construir constraint PRIMARY KEY compuesto
    const pkCols = columns
      .filter(col => col.isPrimary)
      .map(col => `"${col.name}"`);
    columnDefs.push(`PRIMARY KEY (${pkCols.join(', ')})`);

    // Construir claves foráneas
    for (const col of columns) {
      if (col.references) {
        const ref = col.references;
        columnDefs.push(
          `FOREIGN KEY ("${col.name}") REFERENCES "${ref.table}"("${ref.column}")`
        );
      }
    }

    // Ejecutar la creación
    const query = `CREATE TABLE "${name}" (${columnDefs.join(', ')});`;
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
