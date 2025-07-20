module.exports = (req, res, next) => {
  const { query } = req.body;
  if (
    !query.toLowerCase().startsWith('select') ||
    /(\b(insert|delete|drop|update|alter|grant|revoke|create)\b)/i.test(query)
  ) {
    return res.status(403).json({ error: 'Solo se permiten consultas SELECT' });
  }
  next();
};
