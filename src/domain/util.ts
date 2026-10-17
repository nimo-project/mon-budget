export function uid(): string {
  return crypto.randomUUID()
}

const euro = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })

export function formatMoney(cents: number): string {
  // `|| 0` évite l'affichage « -0,00 € »
  return euro.format(cents / 100 || 0)
}

/** "12,50", "-1 234.5", "1.234,56 €" → centimes. Retourne null si illisible. */
export function parseMoney(input: string): number | null {
  let s = input.replace(/[\s  €$£]/g, '').replace(/^\+/, '')
  if (!s) return null
  const neg = /^-|^\(.*\)$|-$/.test(s)
  s = s.replace(/[()-]/g, '')
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  if (lastComma > lastDot) {
    s = s.replace(/\./g, '').replace(',', '.')
  } else if (lastDot > lastComma && lastComma >= 0) {
    s = s.replace(/,/g, '')
  } else if (lastComma === -1 && lastDot >= 0) {
    // "1.234" sans décimales est ambigu : si 3 chiffres après le point et plusieurs points, c'est un séparateur de milliers
    if ((s.match(/\./g) ?? []).length > 1) s = s.replace(/\./g, '')
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return null
  const cents = Math.round(parseFloat(s) * 100)
  return neg ? -cents : cents
}

/** "15/10/2026", "2026-10-15", "15-10-2026", "2026-10-15 10:23:45", "20261015" → "2026-10-15". */
export function parseDate(input: string): string | null {
  const s = input.trim()
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return iso(+m[1], +m[2], +m[3])
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/)
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3]
    return iso(y, +m[2], +m[1])
  }
  m = s.match(/^(\d{4})(\d{2})(\d{2})/)
  if (m) return iso(+m[1], +m[2], +m[3])
  return null
}

function iso(y: number, mo: number, d: number): string | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export function today(): string {
  const d = new Date()
  return iso(d.getFullYear(), d.getMonth() + 1, d.getDate())!
}

export function addDays(date: string, days: number): string {
  const d = new Date(date + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function addMonths(date: string, months: number): string {
  const d = new Date(date + 'T12:00:00Z')
  const day = d.getUTCDate()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() + months)
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  d.setUTCDate(Math.min(day, last))
  return d.toISOString().slice(0, 10)
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000)
}

export function formatDate(date: string): string {
  const [y, m, d] = date.split('-')
  return `${d}/${m}/${y}`
}

const monthNames = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']

export function formatMonth(date: string): string {
  const [y, m] = date.split('-')
  return `${monthNames[+m - 1]} ${y}`
}

/** Libellé bancaire normalisé : majuscules, sans accents, sans chiffres de référence ni dates. */
export function normalizeLabel(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\b(CB|PRLV|SEPA|VIR|CARTE|PAIEMENT|PAR|DU|X\d+)\b/g, ' ')
    // Dates collées au libellé : 15/10, 15.10.26, 15-10-2026, 2026-10-15, 15OCT, 15 OCT 26…
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, ' ')
    .replace(/\d{1,2}[/.-]\d{1,2}([/.-]\d{2,4})?/g, ' ')
    .replace(/\b\d{1,2} ?(JAN|FEV|FEB|MAR|AVR|APR|MAI|MAY|JUN|JUIN|JUL|JUIL|AOU|AUG|SEP|OCT|NOV|DEC)[A-Z]*( ?\d{2,4})?\b/g, ' ')
    .replace(/\b\d{4,}\b/g, ' ')
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function sum<T>(items: T[], f: (t: T) => number): number {
  let s = 0
  for (const i of items) s += f(i)
  return s
}
