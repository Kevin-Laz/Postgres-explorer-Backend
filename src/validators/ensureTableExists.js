const { ValidationError } = require('../errors');

/**
 * Verifica si una tabla existe en la base de datos.
 * Lanza un ValidationError si no existe.
 * 
 * @param {PrismaClient} prisma - instancia de Prisma conectada
 * @param {string} tableName - nombre de la tabla a verificar
 */
async function ensureTableExists(prisma, tableName) {
  const query = `
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = $name
    ) AS "exists";
  `;

  const result = await prisma.$queryRawUnsafe(
    query.replace('$name', `'${tableName}'`)
  );

  if (!result[0]?.exists) {
    throw new ValidationError(`La tabla "${tableName}" no existe.`);
  }
}

module.exports = { ensureTableExists };
