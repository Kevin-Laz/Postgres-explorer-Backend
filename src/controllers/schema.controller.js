const createPrismaClient = require('../utils/createPrismaClient');
const { validateDatabaseUrl } = require('../validators/databaseUrlValidator');
const { validateTableName } = require('../validators/tableNameValidator');
const { ValidationError, ConflictError } = require('../errors');
const applyCommands = require('../schemaEngine/applyCommands');
const { propagateError } = require('../utils/propagateError');
const { getSchemaSnapshot } = require('../schemaEngine/snapshot');
const { withAdvisoryLockTx } = require('../utils/advisoryLockTx');


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
    return propagateError(err, next);
  } finally {
    if (prisma) await prisma.$disconnect();
  }
};

const executeCommands = async (req, res, next) => {
  let prisma;
  try {
    const { databaseUrl, commands, mode,expectedHash } = req.body || {};
    validateDatabaseUrl(databaseUrl);
    if (!Array.isArray(commands) || commands.length === 0) {
      throw new ValidationError('Debe enviar un array "commands" con al menos una operación.');
    }
    prisma = createPrismaClient(databaseUrl);

    const before = await getSchemaSnapshot(prisma);

    if (expectedHash && expectedHash !== before.schemaHash) {
      throw new ConflictError('El esquema cambió desde tu último snapshot.', {
        target: { schema: 'public' },
        details: { expectedHash, actualHash: before.schemaHash },
        hint: 'Sincroniza y reintenta con el último hash.'
      });
    }

    // lock dentro de la MISMA conexión
    const result = await withAdvisoryLockTx(prisma, databaseUrl, async (tx) => {
      return applyCommands({
        prisma: tx,
        commands,
        dryRun: false,
        mode: mode || 'allOrNothing',
      });
    });

    // Snapshot después
    const after = await getSchemaSnapshot(prisma);

    const payload = {
      success: result.success,
      applied: result.applied,
      failed: result.failed,
      warnings: result.warnings,
      schemaHashBefore: before.schemaHash,
      schemaHashAfter: after.schemaHash
    };

    // 207 si parcial, 200 si todo ok, 400 si todo falló
    if (!result.success && result.applied?.length) {
      return res.status(207).json(payload);
    } else if (!result.success) {
      return res.status(400).json(payload);
    }
    return res.status(200).json(payload);
  } catch (err) {
    return propagateError(err, next);
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
    return propagateError(err, next);
  } finally {
    if (prisma) await prisma.$disconnect();
  }
};

module.exports = { validateCommands, executeCommands, getSnapshot };
