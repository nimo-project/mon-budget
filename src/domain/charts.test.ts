import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { spendingByCategory, spendingPace } from './charts'
import { emptyData } from './defaults'
import { currentPeriod } from './periods'
import type { Transaction } from './types'

let n = 0
const tx = (p: Partial<Transaction> & Pick<Transaction, 'date' | 'amount'>): Transaction => ({
  id: `t${++n}`,
  accountId: 'a',
  label: 'X',
  tags: [],
  source: 'import',
  toReview: false,
  ...p,
})

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-15T10:00:00Z'))
})
afterEach(() => vi.useRealTimers())

describe('graphiques', () => {
  it('cumule les dépenses sans compter l’épargne ni les revenus', () => {
    const d = emptyData()
    d.accounts = [{ id: 'a', name: 'A', bank: 'boursobank', kind: 'courant', openingBalance: 0 }]
    d.budget = [{ id: 'b', categoryId: 'cat-courses', kind: 'variable', amount: 31000 }]
    d.transactions = [
      tx({ date: '2026-10-02', amount: -5000, categoryId: 'cat-courses' }),
      tx({ date: '2026-10-03', amount: -2000, categoryId: 'cat-plaisir--beaute' }),
      tx({ date: '2026-10-04', amount: -30000, categoryId: 'cat-epargne' }),
      tx({ date: '2026-10-01', amount: 200000, categoryId: 'cat-revenus--salaire' }),
    ]
    const p = currentPeriod(d)
    const pace = spendingPace(d, p)
    expect(pace.find((x) => x.date === '2026-10-15')?.actual).toBe(7000)
    expect(pace.find((x) => x.date === '2026-10-20')?.actual).toBeUndefined()
    expect(pace[pace.length - 1].planned).toBe(31000)
    expect(spendingByCategory(d, p).map((r) => [r.name, r.amount])).toEqual([
      ['Courses', 5000],
      ['Plaisir', 2000],
    ])
  })
})
