const createPrismaClient = require('../utils/createPrismaClient');
const { validateDatabaseUrl } = require('../validators/databaseUrlValidator');
const { validateTableName } = require('../validators/tableNameValidator');
const { ValidationError, DatabaseError, AppError } = require('../errors');
const applyCommands = require('../schemaEngine/applyCommands');
const { getSchemaSnapshot } = require('../schemaEngine/snapshot');

const validateCommands = async (req, res, next) => {
  let prisma;
  try {
    const { databaseUrl, commands, mode } = req.body || {};
    validateDatabaseUrl(databaseUrl);
    if (!Array.isArray(commands) || commands.length === 0) {
      throw new ValidationError('Debe enviar un array "commands" con al menos una operación.');
    }
    prisma = createPrismaClient(databaseUrl);

    const result = await applyCommands({
      prisma,
      commands,
      dryRun: true,
      mode: mode || 'allOrNothing',
    });

    res.status(result.success ? 200 : 400).json(result);
  } catch (err) {
    if (err instanceof AppError) return next(err);
    next(new DatabaseError(err.message));
  } finally {
    if (prisma) await prisma.$disconnect();
  }
};

const executeCommands = async (req, res, next) => {
  let prisma;
  try {
    const { databaseUrl, commands, mode } = req.body || {};
    validateDatabaseUrl(databaseUrl);
    if (!Array.isArray(commands) || commands.length === 0) {
      throw new ValidationError('Debe enviar un array "commands" con al menos una operación.');
    }
    prisma = createPrismaClient(databaseUrl);

    const result = await applyCommands({
      prisma,
      commands,
      dryRun: false,
      mode: mode || 'allOrNothing',
    });

    // 207 si parcial, 200 si todo ok, 400 si todo falló
    if (!result.success && result.applied?.length) {
      res.status(207).json(result);
    } else if (!result.success) {
      res.status(400).json(result);
    } else {
      res.status(200).json(result);
    }
  } catch (err) {
    if (err instanceof AppError) return next(err);
    next(new DatabaseError(err.message));
  } finally {
    if (prisma) await prisma.$disconnect();
  }
};

const getSnapshot = async (req, res, next) => {
  let prisma;
  try {
    const { databaseUrl, tableName } = req.body || {};
    validateDatabaseUrl(databaseUrl);
    if (tableName) validateTableName(tableName);

    prisma = createPrismaClient(databaseUrl);
    const out = await getSchemaSnapshot(prisma, { tableName: tableName || null });

    res.status(200).json(out);
  } catch (err) {
    if (err instanceof AppError) return next(err);
    next(new DatabaseError(err.message));
  } finally {
    if (prisma) await prisma.$disconnect();
  }
};

module.exports = { validateCommands, executeCommands, getSnapshot };
