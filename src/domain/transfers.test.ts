import { describe, expect, it } from 'vitest'
import { emptyData } from './defaults'
import { potForTransaction, suggestAllocation } from './savings'
import { transferFlows } from './transfers'
import type { Transaction } from './types'

const tx = (p: Partial<Transaction> & Pick<Transaction, 'id' | 'date' | 'amount' | 'accountId'>): Transaction => ({
  label: 'VIR',
  tags: [],
  source: 'import',
  toReview: false,
  ...p,
})

function data() {
  const d = emptyData()
  d.accounts = [
    { id: 'c', name: 'Courant', bank: 'boursobank', kind: 'courant', openingBalance: 0 },
    { id: 'e', name: 'Livret', bank: 'boursobank', kind: 'epargne', openingBalance: 0 },
  ]
  d.transactions = [
    tx({ id: 'o1', accountId: 'c', date: '2026-10-02', amount: -20000, transferId: 'v1', categoryId: 'cat-epargne--precaution' }),
    tx({ id: 'i1', accountId: 'e', date: '2026-10-02', amount: 20000, transferId: 'v1' }),
    tx({ id: 'o2', accountId: 'c', date: '2026-10-09', amount: -5000, transferId: 'v2' }),
    tx({ id: 'i2', accountId: 'e', date: '2026-10-09', amount: 5000, transferId: 'v2' }),
  ]
  return d
}

describe('virements et cagnottes', () => {
  it('additionne les virements de compte à compte', () => {
    expect(transferFlows(data(), '2026-10-01', '2026-10-31')).toEqual([
      { fromName: 'Courant', toName: 'Livret', amount: 25000, count: 2 },
    ])
  })

  it('envoie un versement classé Précaution dans la cagnotte de précaution', () => {
    const d = data()
    const arrival = d.transactions.find((t) => t.id === 'i1')!
    const pot = potForTransaction(arrival, d)
    expect(pot?.type).toBe('precaution')
    expect([...suggestAllocation(20000, d, arrival)]).toEqual([[pot!.id, 20000]])
    expect(potForTransaction(d.transactions.find((t) => t.id === 'i2')!, d)).toBeUndefined()
  })
})

describe('hors budget', () => {
  it('détaille tout ce que compte la case Hors budget, épargne et à classer compris', async () => {
    const { summarize, unbudgetedByCategory } = await import('./budget')
    const { currentPeriod } = await import('./periods')
    const d = data()
    d.transactions = [
      tx({ id: 'a', accountId: 'c', date: '2026-10-05', amount: -3000, categoryId: 'cat-epargne--precaution' }),
      tx({ id: 'b', accountId: 'c', date: '2026-10-06', amount: -1000 }),
    ]
    const p = { ...currentPeriod(d), start: '2026-10-01', end: '2026-10-31' }
    const rows = unbudgetedByCategory(d, p)
    expect(rows.reduce((s, r) => s + r.amount, 0)).toBe(summarize(d, p).unbudgeted)
    expect(rows.map((r) => r.categoryId)).toContain('cat-epargne--precaution')
  })
})
