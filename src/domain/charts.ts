// Données des graphiques de l'accueil. Les « dépenses » sont les catégories de type dépense
// (frais fixes, enveloppes, hors budget) : l'épargne et les virements internes n'y sont pas.
import { budgetFor, monthlyAnnualProvision, topLines } from './budget'
import { categoryMap, rootOf, UNCATEGORIZED } from './categories'
import { lastPeriods, type Period } from './periods'
import { activeTransactions, allocations, txIndex } from './transactions'
import type { AppData, Transaction } from './types'
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

export interface SpendingBreakdown {
  planned: { fixe: number; variable: number; annual: number }
  spent: { fixe: number; variable: number; horsBudget: number; aClasser: number }
}

export type SpendingGroup = 'fixe' | 'variable' | 'horsBudget' | 'aClasser'

/** Classe une catégorie de dépense selon le budget de la période : frais fixe, budget variable, hors budget ou à classer. */
export function spendingGroupOf(data: AppData, period: Period): (categoryId: string) => SpendingGroup | null {
  const map = categoryMap(data.categories)
  const spending = isSpending(data, map)
  const lines = topLines(data, budgetFor(data, period))
  return (categoryId) => {
    if (!spending(categoryId)) return null
    if (categoryId === UNCATEGORIZED) return 'aClasser'
    // Ligne de budget qui couvre la catégorie : la sienne ou celle d'un parent.
    let c: string | undefined = categoryId
    while (c) {
      const line = lines.find((l) => l.categoryId === c)
      if (line) return line.kind === 'fixe' || line.kind === 'variable' ? line.kind : 'horsBudget'
      c = map.get(c)?.parentId
    }
    return 'horsBudget'
  }
}

export interface SpendingRow {
  tx: Transaction
  /** Part de l'opération retenue, en centimes positifs pour une dépense. */
  amount: number
}

/** Opérations de la période dont une part tombe dans les catégories retenues, de la plus récente à la plus ancienne. */
export function periodSpendingRows(data: AppData, period: Period, keep: (categoryId: string) => boolean): SpendingRow[] {
  const byId = txIndex(data)
  return activeTransactions(data)
    .filter((t) => t.date >= period.start && t.date <= period.end)
    .map((tx) => ({ tx, amount: -sum(allocations(tx, data, byId).filter((a) => keep(a.categoryId)), (a) => a.amount) }))
    .filter((r) => r.amount !== 0)
    .sort((a, b) => b.tx.date.localeCompare(a.tx.date))
}

/** Racine d'une catégorie pour « Où va ton argent » (« À classer » reste à part). */
export function spendingRootOf(data: AppData): (categoryId: string) => string {
  const map = categoryMap(data.categories)
  return (id) => (id === UNCATEGORIZED ? UNCATEGORIZED : rootOf(id, map))
}

/** D'où viennent le prévu et le dépensé de la période (pour expliquer le « reste à dépenser »). */
export function spendingBreakdown(data: AppData, period: Period): SpendingBreakdown {
  const lines = topLines(data, budgetFor(data, period))
  const groupOf = spendingGroupOf(data, period)
  const spent = { fixe: 0, variable: 0, horsBudget: 0, aClasser: 0 }
  const byId = txIndex(data)
  for (const t of activeTransactions(data)) {
    if (t.date < period.start || t.date > period.end) continue
    for (const a of allocations(t, data, byId)) {
      const group = groupOf(a.categoryId)
      if (group) spent[group] -= a.amount
    }
  }
  return {
    planned: {
      fixe: sum(
        lines.filter((l) => l.kind === 'fixe'),
        (l) => l.amount,
      ),
      variable: sum(
        lines.filter((l) => l.kind === 'variable'),
        (l) => l.amount,
      ),
      annual: monthlyAnnualProvision(data),
    },
    spent,
  }
}

export interface CategoryTotal {
  categoryId: string
  amount: number
}

/** Dépenses d'un groupe (ex. hors budget) par catégorie précise, de la plus grosse à la plus petite. */
export function groupByCategory(data: AppData, period: Period, group: SpendingGroup): CategoryTotal[] {
  const groupOf = spendingGroupOf(data, period)
  const byId = txIndex(data)
  const totals = new Map<string, number>()
  for (const t of activeTransactions(data)) {
    if (t.date < period.start || t.date > period.end) continue
    for (const a of allocations(t, data, byId)) {
      if (groupOf(a.categoryId) === group) totals.set(a.categoryId, (totals.get(a.categoryId) ?? 0) - a.amount)
    }
  }
  return [...totals]
    .filter(([, amount]) => amount !== 0)
    .map(([categoryId, amount]) => ({ categoryId, amount }))
    .sort((a, b) => b.amount - a.amount)
}
