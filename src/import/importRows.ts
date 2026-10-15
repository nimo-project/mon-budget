import { matchRule } from '../domain/rules'
import { matchManualEntries, pairTransfers } from '../domain/transactions'
import type { AppData, Transaction } from '../domain/types'
import { normalizeLabel, uid } from '../domain/util'
import type { ParsedRow } from './parse'

export interface ImportStats {
  added: number
  duplicates: number
  toReview: number
  categorized: number
  transfers: number
  matchedManual: number
  priceAlerts: number
}

/** Empreinte stable d'une ligne : deux lignes identiques le même jour reçoivent un rang (#1, #2…). */
export function importKeys(accountId: string, rows: ParsedRow[]): string[] {
  const seen = new Map<string, number>()
  return rows.map((r) => {
    if (r.externalId) return `${accountId}|id|${r.externalId}`
    const base = `${accountId}|${r.date}|${r.amount}|${normalizeLabel(r.label)}`
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    return `${base}#${n}`
  })
}

export function importRows(data: AppData, accountId: string, rows: ParsedRow[]): { data: AppData; stats: ImportStats } {
  const account = data.accounts.find((a) => a.id === accountId)
  if (!account) throw new Error('Compte inconnu')
  const existing = new Set(data.transactions.map((t) => t.importKey).filter(Boolean))
  const keys = importKeys(accountId, rows)
  const stats: ImportStats = {
    added: 0,
    duplicates: 0,
    toReview: 0,
    categorized: 0,
    transfers: 0,
    matchedManual: 0,
    priceAlerts: 0,
  }

  const added: Transaction[] = []
  rows.forEach((r, i) => {
    if (existing.has(keys[i])) {
      stats.duplicates++
      return
    }
    existing.add(keys[i])
    const match = matchRule(r.label, r.amount, data.rules, data.settings.ruleTolerance)
    const tx: Transaction = {
      id: uid(),
      accountId,
      date: r.date,
      amount: r.amount,
      label: r.label,
      tags: [],
      source: 'import',
      importKey: keys[i],
      toReview: true,
    }
    if (match) {
      tx.categoryId = match.rule.categoryId
      tx.ruleId = match.rule.id
      tx.toReview = !!match.priceChanged
      if (match.priceChanged) tx.priceAlert = { ruleId: match.rule.id, previousAmount: match.rule.amount! }
    } else if (account.purposeCategoryId && r.amount < 0) {
      // Compte « enveloppe » : la catégorie du compte est proposée, à confirmer dans « À vérifier ».
      tx.categoryId = account.purposeCategoryId
    }
    added.push(tx)
  })

  const newIds = new Set(added.map((t) => t.id))
  let transactions = [...data.transactions, ...added]
  transactions = matchManualEntries(transactions, newIds)
  transactions = pairTransfers(transactions, newIds)

  for (const t of transactions) {
    if (!newIds.has(t.id)) continue
    stats.added++
    if (t.transferId) stats.transfers++
    if (t.priceAlert) stats.priceAlerts++
    if (t.toReview) stats.toReview++
    else if (!t.transferId) stats.categorized++
  }
  stats.matchedManual = transactions.filter((t) => t.matchedTxId && newIds.has(t.matchedTxId)).length

  transactions.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  return { data: { ...data, transactions }, stats }
}
