import { UNCATEGORIZED } from './categories'
import type { Account, AppData, Split, Transaction } from './types'
import { addDays, daysBetween, sum } from './util'

/** Opérations prises en compte : une saisie manuelle rapprochée d'une ligne importée est masquée. */
export function activeTransactions(data: AppData): Transaction[] {
  return data.transactions.filter((t) => !t.matchedTxId)
}

/**
 * Répartition d'une opération par catégorie, pour les calculs de budget.
 * Montants signés : négatif = dépense, positif = revenu ou remboursement.
 *  - virement entre deux comptes courants : ignoré (c'est une allocation, pas une dépense) ;
 *  - virement d'un compte courant vers un compte épargne : compté comme de l'épargne ;
 *  - remboursement lié : vient réduire les catégories de la dépense d'origine ;
 *  - découpage : chaque part dans sa catégorie.
 */
export function allocations(tx: Transaction, data: AppData, byId?: Map<string, Transaction>): Split[] {
  if (tx.transferId) {
    const account = data.accounts.find((a) => a.id === tx.accountId)
    if (account?.kind !== 'courant' || tx.amount >= 0) return []
    const other = data.transactions.find((t) => t.transferId === tx.transferId && t.id !== tx.id)
    const dest = other && data.accounts.find((a) => a.id === other.accountId)
    if (!dest || dest.kind === 'courant') return []
    return [{ categoryId: tx.categoryId ?? dest.purposeCategoryId ?? 'cat-epargne', amount: tx.amount }]
  }
  if (tx.reimbursesId) {
    const original = byId ? byId.get(tx.reimbursesId) : data.transactions.find((t) => t.id === tx.reimbursesId)
    if (original) {
      const parts = allocations(original, data, byId)
      const total = sum(parts, (p) => p.amount)
      if (total !== 0) {
        let left = tx.amount
        return parts.map((p, i) => {
          const amount = i === parts.length - 1 ? left : Math.round((tx.amount * p.amount) / total)
          left -= amount
          return { categoryId: p.categoryId, amount }
        })
      }
    }
  }
  if (tx.splits?.length) return tx.splits
  return [{ categoryId: tx.categoryId ?? UNCATEGORIZED, amount: tx.amount }]
}

export function txIndex(data: AppData): Map<string, Transaction> {
  return new Map(data.transactions.map((t) => [t.id, t]))
}

/** Somme par catégorie sur une plage de dates incluse. */
export function totalsByCategory(data: AppData, from: string, to: string): Map<string, number> {
  const byId = txIndex(data)
  const out = new Map<string, number>()
  for (const t of activeTransactions(data)) {
    if (t.date < from || t.date > to) continue
    for (const a of allocations(t, data, byId)) out.set(a.categoryId, (out.get(a.categoryId) ?? 0) + a.amount)
  }
  return out
}

export function accountBalance(account: Account, data: AppData, upTo?: string): number {
  return (
    account.openingBalance +
    sum(
      activeTransactions(data).filter((t) => t.accountId === account.id && (!upTo || t.date <= upTo)),
      (t) => t.amount,
    )
  )
}

/** Argent versé sur un compte « enveloppe » par virement depuis un autre compte de Nina. */
export function allocatedTo(account: Account, data: AppData, from: string, to: string): number {
  return sum(
    activeTransactions(data).filter(
      (t) => t.accountId === account.id && t.transferId && t.amount > 0 && t.date >= from && t.date <= to,
    ),
    (t) => t.amount,
  )
}

export function spentOn(account: Account, data: AppData, from: string, to: string): number {
  return -sum(
    activeTransactions(data).filter(
      (t) => t.accountId === account.id && !t.transferId && t.amount < 0 && t.date >= from && t.date <= to,
    ),
    (t) => t.amount,
  )
}

const TRANSFER_WINDOW_DAYS = 3

/**
 * Repère les virements entre comptes de Nina : même montant de signe opposé,
 * sur deux comptes différents, à 3 jours d'écart au plus. Retourne les opérations mises à jour.
 */
export function pairTransfers(transactions: Transaction[], newIds: Set<string>): Transaction[] {
  const out = transactions.map((t) => ({ ...t }))
  const free = out.filter((t) => !t.transferId && !t.reimbursesId && !t.matchedTxId)
  for (const t of free) {
    if (!newIds.has(t.id) || t.transferId || t.amount === 0) continue
    const match = free
      .filter(
        (o) =>
          !o.transferId &&
          o.id !== t.id &&
          o.accountId !== t.accountId &&
          o.amount === -t.amount &&
          Math.abs(daysBetween(o.date, t.date)) <= TRANSFER_WINDOW_DAYS,
      )
      .sort((a, b) => Math.abs(daysBetween(a.date, t.date)) - Math.abs(daysBetween(b.date, t.date)))[0]
    if (match && looksLikeTransfer(t, match)) {
      const id = `vir-${t.id}`
      t.transferId = id
      match.transferId = id
      t.toReview = false
      match.toReview = false
    }
  }
  return out
}

function looksLikeTransfer(a: Transaction, b: Transaction): boolean {
  const re = /\b(VIR|VIREMENT|TRANSFER|TOP.?UP|RECHARGE|VERSEMENT|PAYMENT FROM|REVOLUT)\b/i
  return re.test(a.label) || re.test(b.label)
}

const MANUAL_WINDOW_DAYS = 5

/**
 * Rapproche les saisies manuelles des lignes importées : même compte, même montant,
 * date proche. La saisie manuelle est alors masquée, et la ligne importée récupère sa catégorie et sa note.
 */
export function matchManualEntries(transactions: Transaction[], newIds: Set<string>): Transaction[] {
  const out = transactions.map((t) => ({ ...t }))
  const manual = out.filter((t) => t.source === 'manuel' && !t.matchedTxId)
  for (const imp of out) {
    if (!newIds.has(imp.id) || imp.source !== 'import') continue
    const m = manual.find(
      (t) =>
        !t.matchedTxId &&
        t.accountId === imp.accountId &&
        t.amount === imp.amount &&
        imp.date >= addDays(t.date, -1) &&
        imp.date <= addDays(t.date, MANUAL_WINDOW_DAYS),
    )
    if (!m) continue
    m.matchedTxId = imp.id
    imp.categoryId = m.categoryId ?? imp.categoryId
    imp.splits = m.splits ?? imp.splits
    imp.note = [imp.note, m.note].filter(Boolean).join(' · ') || undefined
    imp.tags = [...new Set([...imp.tags, ...m.tags])]
    imp.toReview = false
    // Les remboursements qui visaient la saisie manuelle pointent désormais la ligne importée.
    for (const t of out) if (t.reimbursesId === m.id) t.reimbursesId = imp.id
  }
  return out
}
