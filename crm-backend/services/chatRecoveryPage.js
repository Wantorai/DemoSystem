'use strict';
const { Op } = require('sequelize');

// Opt-in mode on existing authenticated history routes. ID cursors do not lose
// rows with equal createdAt or a removed pivot. No changes to ordinary history.
module.exports = async function chatRecoveryPage({ query, model, where, include, decorate, readState }) {
  const invalid = () => Object.assign(new Error('Invalid recovery cursor'), { status: 400 });
  const integer = (value, optional = false) => {
    if (optional && value == null) return null;
    if (!/^\d+$/.test(String(value))) throw invalid();
    const id = Number(value);
    if (!Number.isSafeInteger(id) || id < 0) throw invalid();
    return id;
  };
  const after = integer(query.recoveryAfterId, true);
  const requestedCeiling = integer(query.recoveryCeiling, true);
  const known = String(query.knownIds || '').split(',').filter(Boolean).map(value => integer(value));
  if (known.length > 40 || known.some(id => id <= 0) || new Set(known).size !== known.length) throw invalid();
  const limit = Math.min(40, Math.max(1, integer(query.limit ?? 40)));
  const maximum = requestedCeiling == null ? Number(await model.max('id', { where })) || 0 : requestedCeiling;
  const ceiling = Math.max(after ?? 0, maximum);
  if (requestedCeiling != null && requestedCeiling < (after ?? 0)) throw invalid();
  const fresh = await model.findAll({
    where: { [Op.and]: [where, { id: after == null ? { [Op.lte]: ceiling } : { [Op.gt]: after, [Op.lte]: ceiling } }] },
    include, order: [['id', after == null ? 'DESC' : 'ASC']], limit: after == null ? limit : limit + 1,
  });
  const hasMore = after != null && fresh.length > limit;
  const page = fresh.slice(0, limit);
  if (after == null) page.reverse();
  const cursor = hasMore ? Number(page[page.length - 1].id) : ceiling;
  const knownRows = known.length ? await model.findAll({ where: { [Op.and]: [where, { id: { [Op.in]: known } }] }, include }) : [];
  const found = new Set(knownRows.map(row => Number(row.id)));
  const merged = new Map(page.map(row => [Number(row.id), row]));
  knownRows.forEach(row => merged.set(Number(row.id), row));
  return {
    messages: await decorate([...merged.values()]),
    ...(readState ? await readState([...merged.keys()], ceiling) : {}),
    recovery: { version: 1, cursor, ceiling, hasMore, checkedIds: known, missingIds: known.filter(id => !found.has(id)) },
  };
};
