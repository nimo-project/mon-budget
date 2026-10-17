// Données des graphiques de l'accueil. Les « dépenses » sont les catégories de type dépense
// (frais fixes, enveloppes, hors budget) : l'épargne et les virements internes n'y sont pas.
import { budgetFor, monthlyAnnualProvision, topLines } from './budget'
import { categoryMap, rootOf, UNCATEGORIZED } from './categories'
import { lastPeriods, type Period } from './periods'
import { activeTransactions, allocations, txIndex } from './transactions'
import type { AppData } from './types'
import { addDays, daysBetween, sum, today } from './util'

function isSpending(data: AppData, map = categoryMap(data.categories)) {
  return (categoryId: string) => categoryId === UNCATEGORIZED || map.get(rootOf(categoryId, map))?.kind === 'depense'
}

/** Dépenses de la période par jour (centimes positifs, remboursements déduits). */
function dailySpending(data: AppData, period: Period): Map<string, number> {
  const spending = isSpending(data)
  const byId = txIndex(data)
  const out = new Map<string, number>()
  for (const t of activeTransactions(data)) {
    if (t.date < period.start || t.date > period.end) continue
    const v = -sum(
      allocations(t, data, byId).filter((a) => spending(a.categoryId)),
      (a) => a.amount,
    )
    if (v) out.set(t.date, (out.get(t.date) ?? 0) + v)
  }
  return out
}

/** Dépenses prévues sur une période : frais fixes + enveloppes + provision des dépenses annuelles. */
export function plannedSpending(data: AppData, period: Period): number {
  const lines = topLines(data, budgetFor(data, period)).filter((l) => l.kind === 'fixe' || l.kind === 'variable')
  return sum(lines, (l) => l.amount) + monthlyAnnualProvision(data)
}

export interface PacePoint {
  date: string
  /** Cumul dépensé à cette date (absent après aujourd'hui). */
  actual?: number
  /** Cumul prévu si le budget était dépensé régulièrement. */
  planned: number
}

/** Cumul des dépenses jour par jour, face à un rythme régulier du budget prévu. */
export function spendingPace(data: AppData, period: Period): PacePoint[] {
  const days = daysBetween(period.start, period.end) + 1
  const planned = plannedSpending(data, period)
  const daily = dailySpending(data, period)
  const now = today()
  const points: PacePoint[] = []
  let cumul = 0
  for (let i = 0; i < days; i++) {
    const date = addDays(period.start, i)
    cumul += daily.get(date) ?? 0
    points.push({ date, actual: date <= now ? cumul : undefined, planned: Math.round((planned * (i + 1)) / days) })
  }
  return points
}

export interface CategorySpend {
  categoryId: string
  name: string
  amount: number
}

/** Dépenses de la période par grande catégorie, de la plus grosse à la plus petite (les suivantes regroupées). */
export function spendingByCategory(data: AppData, period: Period, max = 6): CategorySpend[] {
  const map = categoryMap(data.categories)
  const spending = isSpending(data, map)
  const byId = txIndex(data)
  const totals = new Map<string, number>()
  for (const t of activeTransactions(data)) {
    if (t.date < period.start || t.date > period.end) continue
    for (const a of allocations(t, data, byId)) {
      if (!spending(a.categoryId)) continue
      const root = a.categoryId === UNCATEGORIZED ? UNCATEGORIZED : rootOf(a.categoryId, map)
      totals.set(root, (totals.get(root) ?? 0) - a.amount)
    }
  }
  const rows = [...totals]
    .filter(([, amount]) => amount > 0)
    .map(([categoryId, amount]) => ({
      categoryId,
      name: categoryId === UNCATEGORIZED ? 'À classer' : (map.get(categoryId)?.name ?? '?'),
      amount,
    }))
    .sort((a, b) => b.amount - a.amount)
  if (rows.length <= max) return rows
  const rest = rows.slice(max - 1)
  return [
    ...rows.slice(0, max - 1),
    { categoryId: 'autres', name: `Autres (${rest.length})`, amount: sum(rest, (r) => r.amount) },
  ]
}

export interface PeriodSpend {
  period: Period
  spent: number
  planned: number
}

/** Dépensé et prévu sur les dernières périodes (la période en cours incluse, partielle). */
export function spendingHistory(data: AppData, count = 6): PeriodSpend[] {
  // Pas de période avant la première opération importée : elles seraient vides.
  const first = activeTransactions(data).reduce<string | null>((m, t) => (!m || t.date < m ? t.date : m), null)
  return lastPeriods(data, count)
    .filter((period) => first !== null && period.end >= first)
    .map((period) => ({
      period,
      spent: sum([...dailySpending(data, period).values()], (v) => v),
      planned: plannedSpending(data, period),
    }))
}
