const { ValidationError } = require('../errors');

function validateDatabaseUrl(url) {
  if (typeof url !== 'string' || !url.trim()) {
    throw new ValidationError('DATABASE_URL debe ser una cadena no vacía');
  }

  // Patrón general para URI PostgreSQL
  const regex = /^postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)(\?.*)?$/;

  if (!regex.test(url)) {
    throw new ValidationError('DATABASE_URL inválido. Debe seguir el formato de PostgreSQL');
  }

  try {
    const { hostname, port, pathname, username, password, protocol } = new URL(url);
    if (protocol !== 'postgresql:') throw new Error();
    if (!hostname || !port || !pathname || !username || !password) throw new Error();
  } catch (err) {
    throw new ValidationError('DATABASE_URL con estructura inválida');
  }
}
module.exports = { validateDatabaseUrl };