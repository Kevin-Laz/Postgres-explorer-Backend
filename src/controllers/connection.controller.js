const createPrismaClient = require('../utils/createPrismaClient');
const { validateDatabaseUrl } = require('../validators/databaseUrlValidator');
const { propagateError } = require('../utils/propagateError');
const { DatabaseError, ValidationError } = require('../errors');

const checkConnection = async (req, res, next) => {
  let prisma;
  try {
    const { databaseUrl } = req.body;

    validateDatabaseUrl(databaseUrl);
    prisma = createPrismaClient(databaseUrl);

    // Consulta simple para verificar conexión
    await prisma.$queryRawUnsafe(`SELECT 1`);

    res.json({ success: true, message: 'Conexión exitosa con la base de datos.' });
  } catch (error) {
    return propagateError(error, next);
  } finally {
    if (prisma) await prisma.$disconnect();
  }
};

module.exports = { checkConnection };