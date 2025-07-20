const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const insertData = async (req, res) => {
  const { table } = req.params;
  const data = req.body;

  const keys = Object.keys(data).map(k => `"${k}"`).join(", ");
  const values = Object.values(data).map(v => `'${v}'`).join(", ");
  const query = `INSERT INTO "${table}" (${keys}) VALUES (${values}) RETURNING *`;

  try {
    const result = await prisma.$queryRawUnsafe(query);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

const getData = async (req, res) => {
  const { table } = req.params;
  try {
    const result = await prisma.$queryRawUnsafe(`SELECT * FROM "${table}"`);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

module.exports = { insertData, getData };
