const { ValidationError } = require('../../errors');
const { validateTableName } = require('../../validators/tableNameValidator');

function isValidIdentifier(name) {
  return typeof name === 'string' && /^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(name);
}

function validateIdentifierOrThrow(name, target = 'identifier') {
  if (!isValidIdentifier(name)) {
    throw new ValidationError(`${target} inválido: "${name}". Use [A-Za-z_][A-Za-z0-9_]{0,62}`);
  }
}

async function tableExists(prisma, table) {
  const r = await prisma.$queryRaw`
    SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ${table}
    ) AS "exists";
  `;
  return !!r?.[0]?.exists;
}

async function columnExists(prisma, table, column) {
  const r = await prisma.$queryRaw`
    SELECT EXISTS (
      SELECT FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ${table} AND column_name = ${column}
    ) AS "exists";
  `;
  return !!r?.[0]?.exists;
}

async function getColumnType(prisma, table, column) {
  const r = await prisma.$queryRaw`
    SELECT data_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${table} AND column_name = ${column}
    LIMIT 1;
  `;
  return r?.[0]?.data_type || null;
}

// Heurística simple para requerir USING
function requiresUsing(fromType, toType) {
  if (!fromType || !toType) return false;
  const f = fromType.toLowerCase();
  const t = toType.toLowerCase();
  if (f === t) return false;

  const numeric = ['smallint','integer','bigint','numeric','decimal','real','double precision'];
  const isNumeric = (x) => numeric.includes(x);
  const isTextual = (x) => ['text','character varying','character','varchar','char'].includes(x);
  const isBool = (x) => ['boolean'].includes(x);
  const isTimey = (x) => ['timestamp without time zone','timestamp with time zone','date','time without time zone','time with time zone'].includes(x);
  const isUuid = (x) => ['uuid'].includes(x);

  // Text → Numeric/Bool/Time/UUID: casi siempre requiere USING
  if (isTextual(f) && (isNumeric(t) || isBool(t) || isTimey(t) || isUuid(t))) return true;
  // Numeric ↔ Bool/Time: también suele requerir USING
  if (isNumeric(f) && (isBool(t) || isTimey(t))) return true;

  return false;
}

module.exports = {
  isValidIdentifier,
  validateIdentifierOrThrow,
  tableExists,
  columnExists,
  getColumnType,
  requiresUsing,
  validateTableName
};
