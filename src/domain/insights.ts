// Anticipation et compréhension : prélèvements récurrents, abonnements, prévision de fin de période,
// tendances, patrimoine et bouton « Analyser mes dépenses » (calculé dans l'app, rien n'en sort).
import { summarize, type PeriodSummary } from './budget'
import { categoryLabel, categoryMap, rootOf, subtree, UNCATEGORIZED } from './categories'
import { currentPeriod, lastPeriods, salaryDates, type Period } from './periods'
import { potStatuses } from './savings'
import { accountBalance, activeTransactions, allocations, txIndex } from './transactions'
import type { AppData } from './types'
import { addMonths, daysBetween, formatMoney, normalizeLabel, sum, today } from './util'

export interface Recurring {
  key: string
  label: string
  amount: number
  categoryId?: string
  lastDate: string
  nextDate: string
  count: number
  yearlyCost: number
}

/** Débits qui reviennent chaque mois avec un montant proche (±10 %), sur au moins 2 mois récents. */
export function recurringDebits(data: AppData, asOf = today()): Recurring[] {
  const since = addMonths(asOf, -4)
  const groups = new Map<string, typeof data.transactions>()
  for (const t of activeTransactions(data)) {
    if (t.amount >= 0 || t.transferId || t.date < since || t.date > asOf) continue
    const rule = t.ruleId ? data.rules.find((r) => r.id === t.ruleId) : undefined
    const key = rule?.amount !== undefined ? `r:${rule.id}` : `l:${normalizeLabel(t.label)}`
    groups.set(key, [...(groups.get(key) ?? []), t])
  }
  const out: Recurring[] = []
  for (const [key, txs] of groups) {
    txs.sort((a, b) => a.date.localeCompare(b.date))
    const months = new Set(txs.map((t) => t.date.slice(0, 7)))
    if (months.size < 2) continue
    const last = txs[txs.length - 1]
    const stable = txs.every((t) => Math.abs(t.amount - last.amount) <= Math.abs(last.amount) * 0.1)
    // Plusieurs débits par mois (courses, cafés…) : ce n'est pas un prélèvement.
    if (!stable || txs.length > months.size + 1) continue
    out.push({
      key,
      label: last.label,
      amount: -last.amount,
      categoryId: last.categoryId,
      lastDate: last.date,
      nextDate: addMonths(last.date, 1),
      count: txs.length,
      yearlyCost: -last.amount * 12,
    })
  }
  return out.sort((a, b) => a.nextDate.localeCompare(b.nextDate))
}

export function subscriptions(data: AppData): Recurring[] {
  const subs = subtree('cat-abonnements', data.categories)
  return recurringDebits(data)
    .filter((r) => r.categoryId && subs.has(r.categoryId))
    .sort((a, b) => b.yearlyCost - a.yearlyCost)
}

/** Prélèvements attendus entre aujourd'hui et la fin de la période. */
export function upcomingDebits(data: AppData, period = currentPeriod(data)): Recurring[] {
  const now = today()
  return recurringDebits(data).filter((r) => r.nextDate > now && r.nextDate <= period.end)
}

export interface Forecast {
  period: Period
  income: number
  spentSoFar: number
  upcoming: number
  /** Dépenses variables restantes estimées au rythme actuel. */
  variablePace: number
  projectedLeft: number
  daysLeft: number
}

export function forecast(data: AppData, summary = summarize(data, currentPeriod(data))): Forecast {
  const period = summary.period
  const now = today()
  const elapsed = Math.max(1, daysBetween(period.start, now < period.end ? now : period.end) + 1)
  const total = daysBetween(period.start, period.end) + 1
  const daysLeft = Math.max(0, total - elapsed)
  const upcoming = sum(upcomingDebits(data, period), (r) => r.amount)
  const variable = summary.envelopes.filter((e) => e.line.kind === 'variable' && !e.isChild)
  const variableSpent = sum(variable, (e) => e.actual) + summary.unbudgeted
  const variableRemainingBudget = sum(variable, (e) => Math.max(0, e.available - e.actual))
  // Rythme actuel des dépenses variables, plafonné à ce qui reste dans les enveloppes s'il est plus bas.
  const pace = Math.round((variableSpent / elapsed) * daysLeft)
  const variablePace = Math.max(pace, 0) || variableRemainingBudget
  // Revenu attendu : celui de la période, ou à défaut le dernier salaire connu.
  const income = summary.income || lastSalaryAmount(data)
  return {
    period,
    income,
    spentSoFar: summary.actualOut,
    upcoming,
    variablePace,
    projectedLeft: income - summary.actualOut - upcoming - variablePace,
    daysLeft,
  }
}

function lastSalaryAmount(data: AppData): number {
  const dates = salaryDates(data)
  if (!dates.length) return 0
  const last = dates[dates.length - 1]
  return sum(
    activeTransactions(data).filter((t) => t.date === last && t.amount > 0),
    (t) => t.amount,
  )
}

export interface TrendPoint {
  period: Period
  amount: number
}

/** Dépenses d'une catégorie (et de ses sous-catégories) sur les dernières périodes. */
export function categoryTrend(data: AppData, categoryId: string, count = 12): TrendPoint[] {
  const ids = subtree(categoryId, data.categories)
  const byId = txIndex(data)
  return lastPeriods(data, count).map((period) => ({
    period,
    amount: -sum(
      activeTransactions(data).filter((t) => t.date >= period.start && t.date <= period.end),
      (t) => sum(allocations(t, data, byId).filter((a) => ids.has(a.categoryId)), (a) => a.amount),
    ),
  }))
}

export interface NetWorthPoint {
  date: string
  current: number
  savings: number
}

/** Total des comptes courants et épargne en fin de mois, sur 12 mois (hors solde des investissements). */
export function netWorth(data: AppData, months = 12): NetWorthPoint[] {
  const out: NetWorthPoint[] = []
  const end = today()
  for (let i = months - 1; i >= 0; i--) {
    const monthEnd = i === 0 ? end : lastDayOfMonth(addMonths(end, -i))
    let current = 0
    let savings = 0
    for (const a of data.accounts) {
      if (a.kind === 'investissement') continue
      const b = accountBalance(a, data, monthEnd)
      if (a.kind === 'epargne') savings += b
      else current += b
    }
    out.push({ date: monthEnd, current, savings })
  }
  return out
}

function lastDayOfMonth(date: string): string {
  const [y, m] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
}

export interface PeriodReview {
  summary: PeriodSummary
  overspent: { name: string; over: number }[]
  saved: number
  topCategories: { name: string; amount: number }[]
  vsAverage: { name: string; amount: number; average: number }[]
}

/** Bilan d'une période : dépassements, épargne, principaux postes et écarts à la moyenne des 3 précédentes. */
export function periodReview(data: AppData, period: Period): PeriodReview {
  const summary = summarize(data, period)
  const map = categoryMap(data.categories)
  const byRoot = (p: Period) => {
    const out = new Map<string, number>()
    const byId = txIndex(data)
    for (const t of activeTransactions(data)) {
      if (t.date < p.start || t.date > p.end) continue
      for (const a of allocations(t, data, byId)) {
        const root = a.categoryId === UNCATEGORIZED ? UNCATEGORIZED : rootOf(a.categoryId, map)
        if (map.get(root)?.kind !== 'depense' && root !== UNCATEGORIZED) continue
        out.set(root, (out.get(root) ?? 0) - a.amount)
      }
    }
    return out
  }
  const now = byRoot(period)
  // Moyenne sur les périodes précédentes qui ont des opérations (pas avant le premier relevé importé).
  const firstDate = activeTransactions(data).reduce((m, t) => (t.date < m ? t.date : m), period.start)
  const previous = lastPeriods(data, 4, period)
    .slice(0, 3)
    .filter((p) => p.start >= firstDate)
    .map(byRoot)
  const name = (id: string) => categoryLabel(id, map)
  return {
    summary,
    overspent: summary.envelopes.filter((e) => e.state === 'depasse').map((e) => ({ name: e.name, over: -e.remaining })),
    saved: sum(
      summary.envelopes.filter((e) => !e.isChild && (e.line.kind === 'epargne' || e.line.kind === 'investissement')),
      (e) => e.actual,
    ),
    topCategories: [...now]
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, amount]) => ({ name: name(id), amount })),
    vsAverage: [...now]
      .map(([id, amount]) => ({
        name: name(id),
        amount,
        average: Math.round(sum(previous, (m) => m.get(id) ?? 0) / Math.max(1, previous.length)),
      }))
      .filter((x) => x.amount > 0 || x.average > 0),
  }
}

export interface Insight {
  level: 'info' | 'attention' | 'alerte'
  text: string
}

/** Bouton « Analyser mes dépenses » : recommandations calculées par règles, à la demande. */
export function analyze(data: AppData): Insight[] {
  const out: Insight[] = []
  const periods = lastPeriods(data, 4)
  const current = periods[periods.length - 1]
  const summaries = periods.map((p) => summarize(data, p))
  const cur = summaries[summaries.length - 1]
  const past = summaries.slice(0, -1)
  const map = categoryMap(data.categories)

  // 1. Enveloppes dépassées plusieurs périodes de suite : budget sous-estimé ?
  for (const e of cur.envelopes) {
    const streak = summaries.filter((s) =>
      s.envelopes.some((x) => x.line.id === e.line.id && x.state === 'depasse'),
    ).length
    if (streak >= 2) {
      const avgOver = Math.round(
        sum(summaries, (s) => Math.max(0, -(s.envelopes.find((x) => x.line.id === e.line.id)?.remaining ?? 0))) /
          streak,
      )
      out.push({
        level: 'alerte',
        text: `${e.name} dépasse son budget sur ${streak} des 4 dernières périodes (de ${formatMoney(avgOver)} en moyenne). Le budget est peut-être sous-estimé, ou c'est un poste à surveiller.`,
      })
    } else if (e.state === 'depasse') {
      out.push({ level: 'attention', text: `${e.name} dépasse déjà son budget de ${formatMoney(-e.remaining)} cette période.` })
    }
  }

  // 2. Hausse par rapport à l'historique (catégories de dépense de premier niveau).
  const review = periodReview(data, current)
  for (const c of review.vsAverage) {
    if (c.name !== 'À classer' && c.average >= 3000 && c.amount > c.average * 1.3) {
      const pct = Math.round((c.amount / c.average - 1) * 100)
      out.push({
        level: 'attention',
        text: `${c.name} : ${formatMoney(c.amount)} cette période, +${pct} % par rapport à ta moyenne des 3 précédentes (${formatMoney(c.average)}).`,
      })
    }
  }

  // 3. Repère 50/30/20 sur la dernière période complète (ou l'actuelle s'il n'y en a pas).
  const ref = past.length && past[past.length - 1].income > 0 ? past[past.length - 1] : cur
  if (ref.income > 0) {
    const needsRoots = new Set(['cat-logement', 'cat-transport', 'cat-courses', 'cat-sante', 'cat-impots-et-frais', 'cat-commun'])
    let needs = 0
    let wants = 0
    let savings = 0
    const byId = txIndex(data)
    for (const t of activeTransactions(data)) {
      if (t.date < ref.period.start || t.date > ref.period.end) continue
      for (const a of allocations(t, data, byId)) {
        const root = rootOf(a.categoryId, map)
        const kind = map.get(root)?.kind
        if (kind === 'epargne' || kind === 'investissement') savings -= a.amount
        else if (kind === 'depense') {
          if (needsRoots.has(root)) needs -= a.amount
          else wants -= a.amount
        }
      }
    }
    const p = (v: number) => Math.round((v / ref.income) * 100)
    const text = `Répartition de tes revenus : besoins ${p(needs)} %, envies ${p(wants)} %, épargne ${p(savings)} %. Le repère courant est 50 / 30 / 20.`
    out.push({ level: p(wants) > 35 || p(savings) < 10 ? 'attention' : 'info', text })
  }

  // 4. Petites dépenses répétées.
  const small = new Map<string, { count: number; total: number }>()
  for (const t of activeTransactions(data)) {
    if (t.date < cur.period.start || t.date > cur.period.end || t.amount >= 0 || t.amount < -1500 || t.transferId)
      continue
    const key = normalizeLabel(t.label).split(' ').slice(0, 2).join(' ')
    const s = small.get(key) ?? { count: 0, total: 0 }
    small.set(key, { count: s.count + 1, total: s.total - t.amount })
  }
  for (const [key, s] of small) {
    if (s.count >= 6 && s.total >= 3000)
      out.push({
        level: 'info',
        text: `${s.count} petites dépenses chez ${key} cette période, pour ${formatMoney(s.total)} au total.`,
      })
  }

  // 5. Abonnements : coût annuel et hausses de prix en attente.
  const subs = subscriptions(data)
  if (subs.length)
    out.push({
      level: 'info',
      text: `${subs.length} abonnements détectés, pour ${formatMoney(sum(subs, (s) => s.yearlyCost))} par an.`,
    })
  const alerts = data.transactions.filter((t) => t.priceAlert)
  for (const t of alerts)
    out.push({
      level: 'attention',
      text: `${t.label} est passé de ${formatMoney(-t.priceAlert!.previousAmount)} à ${formatMoney(-t.amount)}.`,
    })

  // 6. Cagnottes en retard sur leur objectif.
  for (const s of potStatuses(data)) {
    if (s.late)
      out.push({
        level: 'attention',
        text: `La cagnotte ${s.pot.name} n'atteindra pas son objectif à temps au rythme actuel : il faudrait ${formatMoney(s.monthlyNeeded ?? 0)} par mois.`,
      })
  }

  if (!out.length) out.push({ level: 'info', text: "Rien de particulier à signaler pour l'instant. Importe quelques relevés pour une analyse plus fine." })
  const rank = { alerte: 0, attention: 1, info: 2 }
  return out.sort((a, b) => rank[a.level] - rank[b.level])
}
