const AppError = require('../errors/AppError');

function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    const { method, originalUrl } = req;
    console.error(
      `[${method}] ${originalUrl} → ${err.name}: ${err.message} (status: ${err.statusCode})`
    );
    return res.status(err.statusCode).json({ error: err.message });
  }

  console.error('Error no controlado:', err);
  return res.status(500).json({ error: 'Error interno del servidor' });
}

module.exports = errorHandler;
