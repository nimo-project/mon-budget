// Les périodes de budget commencent le jour où le salaire arrive.
import { subtree } from './categories'
import { activeTransactions } from './transactions'
import type { AppData } from './types'
import { addDays, addMonths, daysBetween, today } from './util'

export interface Period {
  start: string
  end: string
  /** La fin est estimée (prochain salaire pas encore arrivé). */
  estimated: boolean
}

/** Salaires arrivés dans les 10 jours suivant un autre sont considérés comme le même versement. */
const SAME_PAY_DAYS = 10

export function salaryCategoryIds(data: AppData): Set<string> {
  const ids = new Set<string>()
  for (const c of data.categories) if (c.isSalary) for (const id of subtree(c.id, data.categories)) ids.add(id)
  return ids
}

export function salaryDates(data: AppData): string[] {
  const salaryCats = salaryCategoryIds(data)
  const dates = activeTransactions(data)
    .filter((t) => t.amount > 0 && t.categoryId && salaryCats.has(t.categoryId))
    .map((t) => t.date)
    .sort()
  const out: string[] = []
  for (const d of dates) if (!out.length || daysBetween(out[out.length - 1], d) > SAME_PAY_DAYS) out.push(d)
  return out
}

export function periodFor(date: string, data: AppData, dates = salaryDates(data)): Period {
  const before = dates.filter((d) => d <= date)
  const after = dates.filter((d) => d > date)
  if (before.length) {
    const start = before[before.length - 1]
    if (after.length) return { start, end: addDays(after[0], -1), estimated: false }
    return { start, end: addDays(addMonths(start, 1), -1), estimated: true }
  }
  // Pas encore de salaire avant cette date : on prend le mois calendaire, coupé au prochain salaire.
  const monthStart = date.slice(0, 8) + '01'
  const monthEnd = addDays(addMonths(monthStart, 1), -1)
  if (after.length && after[0] <= monthEnd) return { start: monthStart, end: addDays(after[0], -1), estimated: false }
  return { start: monthStart, end: monthEnd, estimated: false }
}

export function currentPeriod(data: AppData): Period {
  return periodFor(today(), data)
}

export function previousPeriod(p: Period, data: AppData): Period {
  return periodFor(addDays(p.start, -1), data)
}

export function nextPeriod(p: Period, data: AppData): Period {
  return periodFor(addDays(p.end, 1), data)
}

/** Les `count` dernières périodes, de la plus ancienne à la plus récente (incluse `from`). */
export function lastPeriods(data: AppData, count: number, from = currentPeriod(data)): Period[] {
  const out = [from]
  while (out.length < count) out.unshift(previousPeriod(out[0], data))
  return out
}

export function periodLabel(p: Period): string {
  const fmt = (d: string) => `${d.slice(8)}/${d.slice(5, 7)}`
  return `du ${fmt(p.start)} au ${fmt(p.end)}${p.estimated ? ' (estimé)' : ''}`
}
