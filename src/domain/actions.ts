// Modifications des données déclenchées par Nina. Fonctions pures : AppData → AppData.
import { learnRule, matchRule, updateRuleAmount } from './rules'
import type { AppData, RolloverAction, Split, Transaction } from './types'
import { uid } from './util'

function patchTx(data: AppData, id: string, patch: Partial<Transaction>): AppData {
  return { ...data, transactions: data.transactions.map((t) => (t.id === id ? { ...t, ...patch } : t)) }
}

export function addTransaction(data: AppData, tx: Omit<Transaction, 'id'>): AppData {
  const full = { ...tx, id: uid() }
  return { ...data, transactions: [full, ...data.transactions].sort((a, b) => b.date.localeCompare(a.date)) }
}

export type Remember = 'non' | 'libelle' | 'libelle-montant'

/**
 * Classe une opération. Si Nina le demande, la correction devient une règle, appliquée aussitôt
 * aux autres opérations encore « À vérifier » qui correspondent.
 */
export function categorize(data: AppData, txId: string, categoryId: string | undefined, remember: Remember): AppData {
  const tx = data.transactions.find((t) => t.id === txId)
  if (!tx) return data
  let next = patchTx(data, txId, { categoryId, splits: undefined, toReview: false, priceAlert: undefined })
  if (remember === 'non' || !categoryId) return next
  const { rules, rule } = learnRule(
    next.rules,
    tx.label,
    tx.amount,
    categoryId,
    remember === 'libelle-montant',
    next.settings.ruleTolerance,
  )
  next = { ...next, rules }
  next = patchTx(next, txId, { ruleId: rule.id })
  return applyRulesToReview(next)
}

export function applyRulesToReview(data: AppData): AppData {
  return {
    ...data,
    transactions: data.transactions.map((t) => {
      if (!t.toReview || t.transferId || t.priceAlert) return t
      const m = matchRule(t.label, t.amount, data.rules, data.settings.ruleTolerance)
      if (!m || m.priceChanged) return t
      return { ...t, categoryId: m.rule.categoryId, ruleId: m.rule.id, toReview: false }
    }),
  }
}

export function confirmReview(data: AppData, txId: string): AppData {
  return patchTx(data, txId, { toReview: false })
}

export function setSplits(data: AppData, txId: string, splits: Split[] | undefined): AppData {
  const tx = data.transactions.find((t) => t.id === txId)
  if (!tx) return data
  if (splits && splits.reduce((s, x) => s + x.amount, 0) !== tx.amount) throw new Error('Le total des parts doit égaler le montant')
  return patchTx(data, txId, { splits: splits?.length ? splits : undefined, toReview: false })
}

export function updateDetails(data: AppData, txId: string, patch: Pick<Partial<Transaction>, 'note' | 'tags' | 'date' | 'label' | 'amount' | 'accountId'>): AppData {
  return patchTx(data, txId, patch)
}

export function linkReimbursement(data: AppData, txId: string, originalId: string | undefined): AppData {
  return patchTx(data, txId, { reimbursesId: originalId, toReview: false })
}

export function markTransfer(data: AppData, a: string, b: string): AppData {
  const id = `vir-${uid()}`
  return patchTx(patchTx(data, a, { transferId: id, toReview: false }), b, { transferId: id, toReview: false })
}

export function unmarkTransfer(data: AppData, txId: string): AppData {
  const tx = data.transactions.find((t) => t.id === txId)
  if (!tx?.transferId) return data
  return {
    ...data,
    transactions: data.transactions.map((t) => (t.transferId === tx.transferId ? { ...t, transferId: undefined, toReview: true } : t)),
  }
}

/** Nina accepte le nouveau prix d'un abonnement : la règle prend le nouveau montant. */
export function acceptPriceChange(data: AppData, txId: string): AppData {
  const tx = data.transactions.find((t) => t.id === txId)
  if (!tx?.priceAlert) return data
  const next = { ...data, rules: updateRuleAmount(data.rules, tx.priceAlert.ruleId, tx.amount) }
  return patchTx(next, txId, { priceAlert: undefined, toReview: false })
}

export function dismissPriceAlert(data: AppData, txId: string): AppData {
  return patchTx(data, txId, { priceAlert: undefined })
}

export function deleteTransaction(data: AppData, txId: string): AppData {
  return {
    ...data,
    transactions: data.transactions
      .filter((t) => t.id !== txId)
      .map((t) => ({
        ...t,
        matchedTxId: t.matchedTxId === txId ? undefined : t.matchedTxId,
        reimbursesId: t.reimbursesId === txId ? undefined : t.reimbursesId,
      })),
    potMovements: data.potMovements.filter((m) => m.transactionId !== txId),
  }
}

export function decideRollover(
  data: AppData,
  periodStart: string,
  categoryId: string,
  amount: number,
  action: RolloverAction,
  potId?: string,
): AppData {
  const rollovers = [
    ...data.rollovers.filter((r) => !(r.periodStart === periodStart && r.categoryId === categoryId)),
    { periodStart, categoryId, amount, action, potId },
  ]
  // « Épargne » ne crée pas de mouvement : l'argent n'est sur le compte épargne qu'une fois viré.
  // La cagnotte choisie est proposée en premier quand ce virement arrive (voir suggestAllocation).
  return { ...data, rollovers }
}
