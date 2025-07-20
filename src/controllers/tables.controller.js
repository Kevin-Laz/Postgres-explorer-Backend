const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const createTable = async (req, res) => {
  const { name, columns } = req.body;
  try {
    return res.status(200).json({ message: 'Tabla creada (simulada)' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const deleteTable = async (req, res) => {
  const { tableName } = req.params;
  try {
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "${tableName}" CASCADE`);
    res.json({ message: `Tabla ${tableName} eliminada` });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

const getSchema = async (req, res) => {
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
    res.status(500).json({ error: err.message });
  }
};

module.exports = { createTable, deleteTable, getSchema };
