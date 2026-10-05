/** Fechas capturadas por inputs datetime-local se interpretan en horario local. */
export function toLocalDate(value: string | undefined | null) {
  if (!value) return null
  if (/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    const instant = new Date(value)
    return Number.isNaN(instant.getTime()) ? null : instant
  }
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?$/)
  if (match) {
    const [, year, month, day, hour = '0', minute = '0', second = '0'] = match
    const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second))
    return Number.isNaN(date.getTime()) || date.getFullYear() !== Number(year) || date.getMonth() !== Number(month)-1 || date.getDate() !== Number(day) || date.getHours() !== Number(hour) || date.getMinutes() !== Number(minute) || date.getSeconds() !== Number(second) ? null : date
  }
  return null
}

/** Días de calendario pendientes, sin que la hora del día altere el conteo. */
export function daysUntil(value: string | undefined | null, from = new Date()) {
  const target = toLocalDate(value)
  if (!target) return null
  const startOfToday = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  const startOfTarget = new Date(target.getFullYear(), target.getMonth(), target.getDate())
  return Math.max(0, Math.round((startOfTarget.getTime() - startOfToday.getTime()) / 86_400_000))
}
