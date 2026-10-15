// Cagnottes virtuelles dans le compte épargne. Leur total vaut toujours le solde réel :
// « Non réparti » reçoit la différence entre le solde et les cagnottes affectées.
import { fixedCostsPerPeriod } from './budget'
import { accountBalance, activeTransactions } from './transactions'
import type { AppData, Pot, PotMovement } from './types'
import { addMonths, daysBetween, sum, today, uid } from './util'

export const UNALLOCATED_POT = 'pot-non-reparti'

export function savingsBalance(data: AppData): number {
  return sum(
    data.accounts.filter((a) => a.kind === 'epargne' && !a.archived),
    (a) => accountBalance(a, data),
  )
}

export interface PotStatus {
  pot: Pot
  balance: number
  goal?: number
  /** Progression vers l'objectif, en pourcentage. */
  pct?: number
  /** Montant à verser chaque mois pour tenir la date. */
  monthlyNeeded?: number
  /** L'objectif daté ne sera pas atteint au rythme des 3 derniers mois. */
  late?: boolean
}

export function potGoal(pot: Pot, data: AppData): number | undefined {
  if (pot.type === 'precaution' && pot.goalMonths) return pot.goalMonths * fixedCostsPerPeriod(data)
  return pot.goalAmount
}

function monthsUntil(date: string): number {
  return Math.max(1, Math.ceil(daysBetween(today(), date) / 30.4))
}

export function potStatuses(data: AppData): PotStatus[] {
  const pots = data.pots.filter((p) => !p.archived)
  const balances = new Map<string, number>()
  for (const m of data.potMovements) balances.set(m.potId, (balances.get(m.potId) ?? 0) + m.amount)
  const allocated = sum(
    pots.filter((p) => p.id !== UNALLOCATED_POT),
    (p) => balances.get(p.id) ?? 0,
  )
  balances.set(UNALLOCATED_POT, savingsBalance(data) - allocated)

  const threeMonthsAgo = addMonths(today(), -3)
  return pots
    .map((pot) => {
      const balance = balances.get(pot.id) ?? 0
      const goal = potGoal(pot, data)
      const status: PotStatus = { pot, balance, goal }
      if (goal && goal > 0) {
        status.pct = Math.min(100, Math.round((balance / goal) * 100))
        if (pot.goalDate && balance < goal) {
          const months = monthsUntil(pot.goalDate)
          status.monthlyNeeded = Math.ceil((goal - balance) / months)
          const recentPace =
            sum(
              data.potMovements.filter((m) => m.potId === pot.id && m.date >= threeMonthsAgo && m.amount > 0),
              (m) => m.amount,
            ) / 3
          status.late = recentPace * months + balance < goal
        }
      }
      return status
    })
    .sort((a, b) => order(a.pot) - order(b.pot))
}

function order(p: Pot): number {
  return { precaution: 0, impots: 1, projet: 2, non_reparti: 3 }[p.type] + (p.priority ? 0 : 0.5)
}

/**
 * Proposition de répartition d'un versement : on remplit d'abord les cagnottes prioritaires
 * jusqu'à leur objectif (ou leur besoin du mois), le reste va dans « Non réparti ».
 */
export function suggestAllocation(amount: number, data: AppData): Map<string, number> {
  const out = new Map<string, number>()
  let left = amount
  // Restes de budget que Nina a choisi d'épargner récemment : leur cagnotte passe en premier.
  const recent = data.rollovers.filter((r) => r.action === 'epargne' && r.potId && r.periodStart >= addMonths(today(), -2))
  for (const r of recent) {
    const give = Math.min(left, r.amount)
    if (give <= 0) break
    out.set(r.potId!, (out.get(r.potId!) ?? 0) + give)
    left -= give
  }
  const statuses = potStatuses(data).filter((s) => s.pot.id !== UNALLOCATED_POT)
  const ranked = [...statuses.filter((s) => s.pot.priority), ...statuses.filter((s) => !s.pot.priority)]
  for (const s of ranked) {
    if (left <= 0) break
    const missing = s.goal ? Math.max(0, s.goal - s.balance) : 0
    const want = Math.min(missing, s.monthlyNeeded ?? missing)
    const give = Math.min(left, want - (out.get(s.pot.id) ?? 0))
    if (give > 0) {
      out.set(s.pot.id, (out.get(s.pot.id) ?? 0) + give)
      left -= give
    }
  }
  if (left > 0) out.set(UNALLOCATED_POT, left)
  return out
}

/**
 * Mouvements de cagnotte pour une répartition. Les versements en « Non réparti » ne créent pas de
 * mouvement : cette cagnotte est calculée à partir du solde.
 */
export function allocationMovements(split: Map<string, number>, date: string, transactionId?: string): PotMovement[] {
  return [...split]
    .filter(([potId, amount]) => potId !== UNALLOCATED_POT && amount !== 0)
    .map(([potId, amount]) => ({ id: uid(), date, potId, amount, transactionId }))
}

export function transferBetweenPots(from: string, to: string, amount: number, date: string): PotMovement[] {
  const out: PotMovement[] = []
  if (from !== UNALLOCATED_POT) out.push({ id: uid(), date, potId: from, amount: -amount, note: 'Déplacement' })
  if (to !== UNALLOCATED_POT) out.push({ id: uid(), date, potId: to, amount, note: 'Déplacement' })
  return out
}

/** Opérations du compte épargne pas encore réparties entre les cagnottes. */
export function unallocatedSavingsTransactions(data: AppData) {
  const savingsAccounts = new Set(data.accounts.filter((a) => a.kind === 'epargne').map((a) => a.id))
  const handled = new Set(data.potMovements.map((m) => m.transactionId).filter(Boolean))
  return activeTransactions(data).filter(
    (t) => savingsAccounts.has(t.accountId) && !handled.has(t.id) && !t.potSettled,
  )
}

/** Versements vers les investissements (PEA, assurance-vie…) sur une plage de dates. */
export function investmentContributions(data: AppData, categoryId: string, from: string, to: string): number {
  const cats = new Set(
    data.categories.filter((c) => c.id === categoryId || c.parentId === categoryId).map((c) => c.id),
  )
  return -sum(
    activeTransactions(data).filter(
      (t) => t.date >= from && t.date <= to && t.categoryId && cats.has(t.categoryId),
    ),
    (t) => t.amount,
  )
}
