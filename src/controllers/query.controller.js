const createPrismaClient = require('../utils/createPrismaClient');
const { validateDatabaseUrl } = require('../validators/databaseUrlValidator');
const { propagateError } = require('../utils/propagateError');
const { DatabaseError, ValidationError } = require('../errors');

const executeQuery = async (req, res, next) => {
  let prisma;
  try {
    const { databaseUrl, query } = req.body;

    validateDatabaseUrl(databaseUrl);
    if (!query || typeof query !== 'string') {
      throw new ValidationError('Debe enviar el SQL en "query" (string).');
    }

    prisma = createPrismaClient(databaseUrl);
    const result = await prisma.$queryRawUnsafe(query);
    res.json(result);
  } catch (err) {
    return propagateError(error, next);
  } finally {
    if (prisma) await prisma.$disconnect();
  }
};

module.exports = { executeQuery };
