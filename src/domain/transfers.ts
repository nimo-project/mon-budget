// Virements entre les comptes de Nina (les deux lignes rapprochées par transferId).
import { activeTransactions } from './transactions'
import type { Account, AppData, Transaction } from './types'

export interface TransferPair {
  id: string
  date: string
  from?: Account
  to?: Account
  /** Montant viré, en centimes positifs. */
  amount: number
  out?: Transaction
  in?: Transaction
}

/** Virements internes entre deux dates (incluses), du plus récent au plus ancien. */
export function transferPairs(data: AppData, from = '0000-00-00', to = '9999-99-99'): TransferPair[] {
  const accounts = new Map(data.accounts.map((a) => [a.id, a]))
  const byId = new Map<string, TransferPair>()
  for (const t of activeTransactions(data)) {
    if (!t.transferId) continue
    const pair = byId.get(t.transferId) ?? { id: t.transferId, date: t.date, amount: Math.abs(t.amount) }
    if (t.amount < 0) {
      pair.out = t
      pair.from = accounts.get(t.accountId)
      pair.date = t.date
    } else {
      pair.in = t
      pair.to = accounts.get(t.accountId)
    }
    byId.set(t.transferId, pair)
  }
  return [...byId.values()].filter((p) => p.date >= from && p.date <= to).sort((a, b) => b.date.localeCompare(a.date))
}

export interface TransferFlow {
  fromName: string
  toName: string
  amount: number
  count: number
}

/** Total viré de compte à compte sur la période. */
export function transferFlows(data: AppData, from: string, to: string): TransferFlow[] {
  const flows = new Map<string, TransferFlow>()
  for (const p of transferPairs(data, from, to)) {
    const fromName = p.from?.name ?? '?'
    const toName = p.to?.name ?? '?'
    const key = `${fromName}→${toName}`
    const f = flows.get(key) ?? { fromName, toName, amount: 0, count: 0 }
    f.amount += p.amount
    f.count++
    flows.set(key, f)
  }
  return [...flows.values()].sort((a, b) => b.amount - a.amount)
}
