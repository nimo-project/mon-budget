import { categoryMap, subtree } from './categories'
import { previousPeriod, type Period } from './periods'
import { totalsByCategory } from './transactions'
import type { AppData, BudgetKind, BudgetLine, CategoryKind } from './types'
import { sum } from './util'

export interface EnvelopeStatus {
  line: BudgetLine
  name: string
  planned: number
  /** Reste de la période précédente gardé dans l'enveloppe. */
  carried: number
  available: number
  /** Dépensé (ou épargné) sur la période, en centimes positifs. */
  actual: number
  remaining: number
  /** actual / available, en pourcentage. */
  pct: number
  state: 'ok' | 'alerte' | 'depasse'
  /** Lignes enfants (budget fixé aussi sur une sous-catégorie). */
  isChild: boolean
}

export interface PeriodSummary {
  period: Period
  envelopes: EnvelopeStatus[]
  income: number
  plannedOut: number
  actualOut: number
  /** Dépenses hors budget (catégories sans enveloppe), positives. */
  unbudgeted: number
  /** Reste « extra » décidé en début de période. */
  extra: number
  annualProvision: number
}

const OUTFLOW: CategoryKind[] = ['depense', 'epargne', 'investissement']

/** Lignes de budget dont aucun ancêtre n'a déjà une ligne : évite de compter deux fois. */
export function topLines(data: AppData): BudgetLine[] {
  const map = categoryMap(data.categories)
  const withLine = new Set(data.budget.map((b) => b.categoryId))
  return data.budget.filter((b) => {
    let p = map.get(b.categoryId)?.parentId
    while (p) {
      if (withLine.has(p)) return false
      p = map.get(p)?.parentId
    }
    return true
  })
}

export function monthlyAnnualProvision(data: AppData): number {
  return Math.round(sum(data.annualExpenses, (e) => e.amount) / 12)
}

export function summarize(data: AppData, period: Period): PeriodSummary {
  const totals = totalsByCategory(data, period.start, period.end)
  const map = categoryMap(data.categories)
  const prev = previousPeriod(period, data)
  const tops = new Set(topLines(data).map((l) => l.id))
  const covered = new Set<string>()

  const envelopes: EnvelopeStatus[] = data.budget.map((line) => {
    const ids = subtree(line.categoryId, data.categories)
    for (const id of ids) covered.add(id)
    const kind = map.get(line.categoryId)?.kind ?? 'depense'
    const raw = sum([...ids], (id) => totals.get(id) ?? 0)
    const actual = OUTFLOW.includes(kind) ? -raw : raw
    const carried = sum(
      data.rollovers.filter(
        (r) => r.periodStart === prev.start && r.categoryId === line.categoryId && r.action === 'garder',
      ),
      (r) => r.amount,
    )
    const available = line.amount + carried
    const pct = available > 0 ? Math.round((actual / available) * 100) : actual > 0 ? 100 : 0
    const state = actual > available ? 'depasse' : pct >= data.settings.alertThreshold ? 'alerte' : 'ok'
    return {
      line,
      name: map.get(line.categoryId)?.name ?? '?',
      planned: line.amount,
      carried,
      available,
      actual,
      remaining: available - actual,
      pct,
      state,
      isChild: !tops.has(line.id),
    }
  })

  let income = 0
  let unbudgeted = 0
  for (const [catId, amount] of totals) {
    const kind = map.get(catId)?.kind
    if (kind === 'revenu') income += amount
    else if (!covered.has(catId)) unbudgeted -= amount
  }
  // Remboursements non liés classés en dépense : ils diminuent le hors-budget, jamais en dessous de zéro.
  unbudgeted = Math.max(0, unbudgeted)

  const topEnvelopes = envelopes.filter((e) => !e.isChild)
  return {
    period,
    envelopes,
    income,
    plannedOut: sum(topEnvelopes, (e) => e.planned) + monthlyAnnualProvision(data),
    actualOut: sum(topEnvelopes, (e) => e.actual) + unbudgeted,
    unbudgeted,
    extra: sum(
      data.rollovers.filter((r) => r.periodStart === prev.start && r.action === 'extra'),
      (r) => r.amount,
    ),
    annualProvision: monthlyAnnualProvision(data),
  }
}

export interface PendingRollover {
  categoryId: string
  name: string
  amount: number
}

/** Restes de la période précédente pas encore décidés (enveloppes variables uniquement). */
export function pendingRollovers(data: AppData, current: Period): PendingRollover[] {
  const prev = previousPeriod(current, data)
  if (prev.start === current.start) return []
  const summary = summarize(data, prev)
  return summary.envelopes
    .filter((e) => e.line.kind === 'variable' && e.remaining > 0)
    .filter((e) => !data.rollovers.some((r) => r.periodStart === prev.start && r.categoryId === e.line.categoryId))
    .map((e) => ({ categoryId: e.line.categoryId, name: e.name, amount: e.remaining }))
}

export function fixedCostsPerPeriod(data: AppData): number {
  return sum(
    topLines(data).filter((l) => l.kind === 'fixe'),
    (l) => l.amount,
  )
}

export const BUDGET_KIND_LABEL: Record<BudgetKind, string> = {
  fixe: 'Frais fixes',
  variable: 'Budgets variables',
  epargne: 'Épargne',
  investissement: 'Investissements',
}
