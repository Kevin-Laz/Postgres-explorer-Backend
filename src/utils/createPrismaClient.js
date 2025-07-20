const { PrismaClient } = require('@prisma/client');

function createPrismaClient(databaseUrl) {
  if (!databaseUrl || !databaseUrl.startsWith('postgres')) {
    throw new Error('DATABASE_URL inválida o no proporcionada');
  }

  return new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });
}

module.exports = createPrismaClient;
