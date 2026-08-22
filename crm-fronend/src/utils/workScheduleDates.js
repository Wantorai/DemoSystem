const DEFAULT_WORK_ON_WEEKEND = {
  holiday: false,
  saturday: false,
  sunday: false,
};

export const parseLocalDate = (value) => {
  if (!value) return null;
  const datePart = String(value).slice(0, 10);
  const [year, month, day] = datePart.split("-").map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const formatLocalDateOnly = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const getActiveHolidayDates = (holidayConfigs = []) =>
  new Set(
    holidayConfigs
      .filter((config) => config?.isHoliday !== false)
      .map((config) => String(config.date).slice(0, 10))
  );

export const isWorkingDate = (
  value,
  workOnWeekendConfig = DEFAULT_WORK_ON_WEEKEND,
  holidayDates = new Set()
) => {
  const date = value instanceof Date ? new Date(value) : parseLocalDate(value);
  if (!date) return false;

  const config = { ...DEFAULT_WORK_ON_WEEKEND, ...(workOnWeekendConfig || {}) };
  const dayOfWeek = date.getDay();

  // Суббота и воскресенье управляются своими отдельными флагами, даже если
  // соответствующая дата также присутствует в календаре праздников.
  if (dayOfWeek === 6) return Boolean(config.saturday);
  if (dayOfWeek === 0) return Boolean(config.sunday);

  if (holidayDates.has(formatLocalDateOnly(date))) {
    return Boolean(config.holiday);
  }

  return true;
};

export const addCalendarDays = (value, days) => {
  const date = value instanceof Date ? new Date(value) : parseLocalDate(value);
  if (!date || !Number.isFinite(days)) return null;
  date.setDate(date.getDate() + days);
  return date;
};

export const calendarDayDifference = (fromValue, toValue) => {
  const from = fromValue instanceof Date ? new Date(fromValue) : parseLocalDate(fromValue);
  const to = toValue instanceof Date ? new Date(toValue) : parseLocalDate(toValue);
  if (!from || !to) return NaN;
  const fromUtc = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const toUtc = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((toUtc - fromUtc) / 86400000);
};
