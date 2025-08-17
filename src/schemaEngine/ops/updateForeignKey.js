const addFK = require('./addForeignKey');
const dropFK = require('./dropForeignKey');

module.exports = {
  /**
   * cmd: { op:'UPDATE_FOREIGN_KEY', table, column, ref:{table,column}, onDelete?, onUpdate?, constraintName? }
   */
  async validate(prisma, cmd) {
    // Validar que existan tabla/columna y que ref sea válida
    const drop = await dropFK.validate(prisma, { table: cmd.table, column: cmd.column });
    if (!drop.ok) return drop;
    const add = await addFK.validate(prisma, cmd);
    if (!add.ok) return add;
    return { ok: true };
  },

  async apply(prisma, cmd) {
    await dropFK.apply(prisma, { table: cmd.table, column: cmd.column });
    await addFK.apply(prisma, cmd);
    return { warnings: [] };
  }
};
