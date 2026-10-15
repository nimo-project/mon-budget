import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { categorize, decideRollover, linkReimbursement } from './actions'
import { pendingRollovers, summarize } from './budget'
import { mergeCategory } from './categories'
import { emptyData } from './defaults'
import { analyze, forecast, recurringDebits } from './insights'
import { currentPeriod, periodFor, previousPeriod } from './periods'
import { potStatuses, suggestAllocation, UNALLOCATED_POT } from './savings'
import type { AppData, Transaction } from './types'

let n = 0
function tx(p: Partial<Transaction> & Pick<Transaction, 'date' | 'amount'>): Transaction {
  return { id: `t${++n}`, accountId: 'bourso', label: 'X', tags: [], source: 'import', toReview: false, ...p }
}

function base(): AppData {
  const d = emptyData()
  d.accounts = [
    { id: 'bourso', name: 'Boursobank', bank: 'boursobank', kind: 'courant', openingBalance: 0, isSalaryAccount: true },
    { id: 'sg', name: 'SG', bank: 'sg', kind: 'courant', openingBalance: 0, purposeCategoryId: 'cat-plaisir' },
    { id: 'livret', name: 'Livret', bank: 'boursobank', kind: 'epargne', openingBalance: 100000 },
  ]
  const salary = 'cat-revenus--salaire'
  d.transactions = [
    tx({ date: '2026-08-28', amount: 250000, categoryId: salary, label: 'VIR SALAIRE' }),
    tx({ date: '2026-09-29', amount: 250000, categoryId: salary, label: 'VIR SALAIRE' }),
    tx({ date: '2026-10-27', amount: 250000, categoryId: salary, label: 'VIR SALAIRE' }),
  ]
  d.settings.budgetSince = '2026-08-28'
  d.budget = [
    { id: 'b1', categoryId: 'cat-logement', kind: 'fixe', amount: 90000 },
    { id: 'b2', categoryId: 'cat-plaisir', kind: 'variable', amount: 20000 },
    { id: 'b3', categoryId: 'cat-plaisir--beaute', kind: 'variable', amount: 5000 },
    { id: 'b4', categoryId: 'cat-epargne', kind: 'epargne', amount: 30000 },
  ]
  return d
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-15T10:00:00Z'))
})
afterEach(() => vi.useRealTimers())

describe('périodes de paie', () => {
  it('commencent le jour du salaire, même si la date varie', () => {
    const d = base()
    expect(currentPeriod(d)).toEqual({ start: '2026-09-29', end: '2026-10-26', estimated: false })
    expect(previousPeriod(currentPeriod(d), d)).toEqual({ start: '2026-08-28', end: '2026-09-28', estimated: false })
  })

  it('estime la fin quand le prochain salaire n’est pas arrivé', () => {
    const d = base()
    expect(periodFor('2026-11-02', d)).toEqual({ start: '2026-10-27', end: '2026-11-26', estimated: true })
  })
})

describe('budget prévu / réel', () => {
  it('compte parent et sous-catégorie sans doubler, ignore les virements internes', () => {
    const d = base()
    d.transactions.push(
      tx({ date: '2026-10-01', amount: -80000, categoryId: 'cat-logement--loyer' }),
      tx({ date: '2026-10-02', amount: -3000, categoryId: 'cat-plaisir--beaute', accountId: 'sg' }),
      tx({ date: '2026-10-03', amount: -6000, categoryId: 'cat-plaisir--vetements', accountId: 'sg' }),
      // virement Bourso → SG : allocation, pas une dépense
      tx({ date: '2026-10-01', amount: -20000, transferId: 'v1', label: 'VIR SG' }),
      tx({ date: '2026-10-01', amount: 20000, transferId: 'v1', accountId: 'sg', label: 'VIR RECU' }),
      // virement Bourso → livret : compté comme épargne
      tx({ date: '2026-10-02', amount: -30000, transferId: 'v2', label: 'VIR LIVRET' }),
      tx({ date: '2026-10-02', amount: 30000, transferId: 'v2', accountId: 'livret', label: 'VIR RECU' }),
    )
    const s = summarize(d, currentPeriod(d))
    const env = (id: string) => s.envelopes.find((e) => e.line.id === id)!
    expect(env('b1').actual).toBe(80000)
    expect(env('b2').actual).toBe(9000)
    expect(env('b3').actual).toBe(3000)
    expect(env('b4').actual).toBe(30000)
    expect(s.plannedOut).toBe(90000 + 20000 + 30000)
    expect(s.actualOut).toBe(80000 + 9000 + 30000)
    expect(s.income).toBe(250000)
  })

  it('déduit un remboursement de la dépense d’origine', () => {
    let d = base()
    const resto = tx({ date: '2026-10-05', amount: -8000, categoryId: 'cat-plaisir--resto' })
    const remb = tx({ date: '2026-10-06', amount: 4000, label: 'VIR COPAIN', toReview: true })
    d.transactions.push(resto, remb)
    d = linkReimbursement(d, remb.id, resto.id)
    const s = summarize(d, currentPeriod(d))
    expect(s.envelopes.find((e) => e.line.id === 'b2')!.actual).toBe(4000)
    expect(s.income).toBe(250000)
  })

  it('met en avant les restes et applique le report choisi', () => {
    let d = base()
    d.transactions.push(tx({ date: '2026-09-10', amount: -12000, categoryId: 'cat-plaisir--resto' }))
    const cur = currentPeriod(d)
    const pending = pendingRollovers(d, cur)
    expect(pending.find((p) => p.categoryId === 'cat-plaisir')!.amount).toBe(8000)
    d = decideRollover(d, previousPeriod(cur, d).start, 'cat-plaisir', 8000, 'garder')
    expect(pendingRollovers(d, cur).find((p) => p.categoryId === 'cat-plaisir')).toBeUndefined()
    const env = summarize(d, cur).envelopes.find((e) => e.line.id === 'b2')!
    expect(env.carried).toBe(8000)
    expect(env.available).toBe(28000)
  })
})

describe('cagnottes', () => {
  it('le total des cagnottes égale le solde du compte épargne', () => {
    const d = base()
    d.potMovements = [
      { id: 'm1', date: '2026-10-01', potId: 'pot-precaution', amount: 60000 },
      { id: 'm2', date: '2026-10-01', potId: 'pot-impots', amount: 15000 },
    ]
    const st = potStatuses(d)
    expect(st.reduce((s, x) => s + x.balance, 0)).toBe(100000)
    expect(st.find((x) => x.pot.id === UNALLOCATED_POT)!.balance).toBe(25000)
    // objectif précaution = 3 mois de frais fixes (900 €)
    expect(st.find((x) => x.pot.id === 'pot-precaution')!.goal).toBe(270000)
  })

  it('propose de remplir d’abord les cagnottes prioritaires', () => {
    const d = base()
    d.pots.find((p) => p.id === 'pot-impots')!.goalAmount = 10000
    const split = suggestAllocation(300000, d)
    expect(split.get('pot-precaution')).toBe(270000)
    expect(split.get('pot-impots')).toBe(10000)
    expect(split.get(UNALLOCATED_POT)).toBe(20000)
  })
})

describe('règles et catégories', () => {
  it('une correction mémorisée classe les autres lignes à vérifier', () => {
    let d = base()
    const a = tx({ date: '2026-10-03', amount: -1199, label: 'PRLV AMAZON PRIME', toReview: true })
    const b = tx({ date: '2026-10-04', amount: -1199, label: 'PRLV AMAZON PRIME', toReview: true })
    const c = tx({ date: '2026-10-04', amount: -5400, label: 'PRLV AMAZON PRIME', toReview: true })
    d.transactions.push(a, b, c)
    d = categorize(d, a.id, 'cat-abonnements--streaming', 'libelle-montant')
    const get = (id: string) => d.transactions.find((t) => t.id === id)!
    expect(get(b.id)).toMatchObject({ categoryId: 'cat-abonnements--streaming', toReview: false })
    expect(get(c.id).toReview).toBe(true)
  })

  it('fusionner une catégorie déplace l’historique, les règles et le budget', () => {
    let d = base()
    d.transactions.push(tx({ date: '2026-10-03', amount: -1000, categoryId: 'cat-plaisir--beaute' }))
    d = mergeCategory(d, 'cat-plaisir--beaute', 'cat-plaisir--loisirs')
    expect(d.categories.some((c) => c.id === 'cat-plaisir--beaute')).toBe(false)
    expect(d.transactions.some((t) => t.categoryId === 'cat-plaisir--beaute')).toBe(false)
    expect(d.budget.find((b) => b.id === 'b3')!.categoryId).toBe('cat-plaisir--loisirs')
  })
})

describe('anticipation', () => {
  it('détecte les prélèvements mensuels et prévoit la fin de période', () => {
    const d = base()
    for (const date of ['2026-07-05', '2026-08-05', '2026-09-05', '2026-10-05'])
      d.transactions.push(tx({ date, amount: -1399, label: 'PRLV NETFLIX', categoryId: 'cat-abonnements--streaming' }))
    d.transactions.push(tx({ date: '2026-09-20', amount: -4500, label: 'EDF', categoryId: 'cat-logement--energie' }))
    d.transactions.push(tx({ date: '2026-08-20', amount: -4500, label: 'EDF', categoryId: 'cat-logement--energie' }))
    const rec = recurringDebits(d)
    expect(rec.map((r) => r.label).sort()).toEqual(['EDF', 'PRLV NETFLIX'])
    const fc = forecast(d)
    expect(fc.upcoming).toBe(4500) // EDF le 20/10 ; Netflix déjà passé ce mois-ci
    expect(fc.income).toBe(250000)
    expect(analyze(d).length).toBeGreaterThan(0)
  })
})
