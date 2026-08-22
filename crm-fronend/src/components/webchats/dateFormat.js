export function formatChatTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function formatChatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}`;
}

export function isSameLocalDay(value, reference = new Date()) {
  if (!value) return false;
  const date = new Date(value);
  const ref = new Date(reference);
  if (Number.isNaN(date.getTime()) || Number.isNaN(ref.getTime())) return false;
  return date.getFullYear() === ref.getFullYear()
    && date.getMonth() === ref.getMonth()
    && date.getDate() === ref.getDate();
}

export function formatChatTimeOrDate(value) {
  if (!value) return '';
  return isSameLocalDay(value) ? formatChatTime(value) : formatChatDate(value);
}

export function formatChatDateTime(value) {
  if (!value) return '';
  const datePart = formatChatDate(value);
  const timePart = formatChatTime(value);
  return [datePart, timePart].filter(Boolean).join(' ');
}
