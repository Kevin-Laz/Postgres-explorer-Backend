const { ValidationError } = require('../errors');

async function throwIfTableExists(prisma, tableName) {
  const result = await prisma.$queryRaw`
    SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ${tableName}
    ) AS "exists";
  `;
  if (Array.isArray(result) && result[0]?.exists) {
    throw new ValidationError(`La tabla "${tableName}" ya existe.`);
  }
}

module.exports = { throwIfTableExists };