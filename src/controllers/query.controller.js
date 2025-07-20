const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const executeQuery = async (req, res) => {
  const { query } = req.body;
  try {
    const result = await prisma.$queryRawUnsafe(query);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

module.exports = { executeQuery };
