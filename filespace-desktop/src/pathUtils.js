const path = require('path');

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;

const sanitizeSegment = (value, fallback = 'Без названия') => {
  let result = String(value || '').normalize('NFC')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/[. ]+$/g, '')
    .trim();
  if (!result) result = fallback;
  if (WINDOWS_RESERVED.test(result)) result = `_${result}`;
  return result.slice(0, 120);
};

const isInside = (root, target) => {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  const relative = path.relative(resolvedRoot, resolvedTarget);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
};

const safeJoin = (root, ...segments) => {
  const target = path.resolve(root, ...segments);
  if (!isInside(root, target)) throw new Error('Путь выходит за пределы папки синхронизации');
  return target;
};

const relativeKey = (value) => String(value || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');

const uniqueSegment = (name, id, occupied) => {
  const sanitized = sanitizeSegment(name);
  const lower = sanitized.toLocaleLowerCase('ru');
  if (!occupied.has(lower)) {
    occupied.add(lower);
    return sanitized;
  }
  const extension = path.extname(sanitized);
  const base = extension ? sanitized.slice(0, -extension.length) : sanitized;
  const suffixed = `${base} [${String(id).slice(0, 6)}]${extension}`.slice(0, 120);
  occupied.add(suffixed.toLocaleLowerCase('ru'));
  return suffixed;
};

module.exports = { sanitizeSegment, isInside, safeJoin, relativeKey, uniqueSegment };
