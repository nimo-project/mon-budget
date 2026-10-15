import { describe, expect, it } from 'vitest'
import { emptyData } from '../domain/defaults'
import { learnRule } from '../domain/rules'
import type { AppData, Transaction } from '../domain/types'
import { importRows } from './importRows'
import { parseStatement } from './parse'

const enc = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer

const BOURSO = `dateOp;dateVal;label;category;categoryParent;supplierFound;amount;comment;accountNum;accountLabel;accountbalance
2026-10-02;2026-10-02;"CB CARREFOUR 01/10/26";"Alimentation";"Vie quotidienne";"carrefour";"-45,20";;00001;"BoursoBank";"1200,00"
2026-10-03;2026-10-03;"PRLV SEPA GOOGLE";"Abonnements";"Loisirs";"google";"-2,99";;00001;"BoursoBank";"1155,00"
2026-10-04;2026-10-04;"VIR REVOLUT NINA";"Virement";"Virements";"";"-200,00";;00001;"BoursoBank";"955,00"
2026-09-28;2026-09-28;"VIR SALAIRE ACME";"Salaire";"Revenus";"";"2 450,00";;00001;"BoursoBank";"3000,00"
`

const SG = `="00012345678";Compte courant
Solde au 15/10/2026;812,34
Date de l'opération;Libellé;Détail de l'écriture;Montant de l'opération;Devise
14/10/2026;CARTE X1234 13/10 SEPHORA;SEPHORA PARIS;-32,50;EUR
12/10/2026;VIR RECU NINA;VIR RECU DE NINA MORIN;200,00;EUR
`

const REVOLUT = `Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance
TOPUP,Current,2026-10-04 09:00:00,2026-10-05 09:00:01,Top-Up by *1234,200.00,0.00,EUR,COMPLETED,200.00
CARD_PAYMENT,Current,2026-10-06 12:00:00,2026-10-07 08:00:00,Monoprix,-23.40,0.00,EUR,COMPLETED,176.60
CARD_PAYMENT,Current,2026-10-08 12:00:00,,Picard,-10.00,0.00,EUR,PENDING,166.60
`

describe('lecture des relevés', () => {
  it('lit un export Boursobank', () => {
    const r = parseStatement('export.csv', enc(BOURSO))
    expect(r.bank).toBe('boursobank')
    expect(r.rows).toHaveLength(4)
    expect(r.rows[0]).toEqual({ date: '2026-10-02', label: 'CB CARREFOUR 01/10/26', amount: -4520 })
    expect(r.rows[3].amount).toBe(245000)
  })

  it('lit un export SG avec lignes d’en-tête et Windows-1252', () => {
    const bytes = new Uint8Array([...SG].map((c) => c.charCodeAt(0)))
    const r = parseStatement('sg.csv', bytes.buffer)
    expect(r.bank).toBe('sg')
    expect(r.rows).toHaveLength(2)
    expect(r.rows[0]).toEqual({ date: '2026-10-14', label: 'CARTE X1234 13/10 SEPHORA — SEPHORA PARIS', amount: -3250 })
  })

  it('lit un export Revolut et ignore les opérations en attente', () => {
    const r = parseStatement('revolut.csv', enc(REVOLUT))
    expect(r.bank).toBe('revolut')
    expect(r.rows.map((x) => x.amount)).toEqual([20000, -2340])
    expect(r.skipped).toBe(1)
  })

  it('lit un fichier OFX', () => {
    const ofx = `<OFX><BANKTRANLIST><STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261010<TRNAMT>-12.50<FITID>ABC1<NAME>FNAC</STMTTRN></BANKTRANLIST></OFX>`
    expect(parseStatement('a.ofx', enc(ofx)).rows).toEqual([
      { date: '2026-10-10', label: 'FNAC', amount: -1250, externalId: 'ABC1' },
    ])
  })
})

function setup(): AppData {
  const d = emptyData()
  d.accounts = [
    { id: 'bourso', name: 'Boursobank', bank: 'boursobank', kind: 'courant', openingBalance: 0, isSalaryAccount: true },
    { id: 'revolut', name: 'Revolut', bank: 'revolut', kind: 'courant', openingBalance: 0, purposeCategoryId: 'cat-commun' },
  ]
  return d
}

describe('import', () => {
  it('ignore les doublons quand on réimporte', () => {
    const rows = parseStatement('b.csv', enc(BOURSO)).rows
    const first = importRows(setup(), 'bourso', rows)
    expect(first.stats.added).toBe(4)
    const again = importRows(first.data, 'bourso', rows)
    expect(again.stats.added).toBe(0)
    expect(again.stats.duplicates).toBe(4)
  })

  it('applique les règles libellé + montant et signale un changement de prix', () => {
    let d = setup()
    d.rules = learnRule(d.rules, 'PRLV SEPA GOOGLE', -299, 'cat-abonnements--apps', true, 10).rules
    const rows = [
      { date: '2026-10-03', label: 'PRLV SEPA GOOGLE', amount: -299 },
      { date: '2026-10-03', label: 'PRLV SEPA GOOGLE', amount: -4500 },
      { date: '2026-10-05', label: 'PRLV SEPA GOOGLE', amount: -349 },
    ]
    const { data, stats } = importRows(d, 'bourso', rows)
    const [a, b, c] = ['-299', '-4500', '-349'].map((amt) => data.transactions.find((t) => t.amount === +amt)!)
    expect(a.categoryId).toBe('cat-abonnements--apps')
    expect(a.toReview).toBe(false)
    expect(b.categoryId).toBeUndefined()
    expect(b.toReview).toBe(true)
    expect(c.priceAlert).toEqual({ ruleId: expect.any(String), previousAmount: -299 })
    expect(stats.priceAlerts).toBe(1)
  })

  it('reconnaît un virement entre deux comptes et propose la catégorie du compte enveloppe', () => {
    const d1 = importRows(setup(), 'bourso', parseStatement('b.csv', enc(BOURSO)).rows).data
    const { data, stats } = importRows(d1, 'revolut', parseStatement('r.csv', enc(REVOLUT)).rows)
    expect(stats.transfers).toBe(1)
    const legs = data.transactions.filter((t) => t.transferId)
    expect(legs.map((t) => t.amount).sort()).toEqual([-20000, 20000])
    const mono = data.transactions.find((t) => t.label === 'Monoprix')!
    expect(mono.categoryId).toBe('cat-commun')
    expect(mono.toReview).toBe(true)
  })

  it('rapproche une saisie manuelle de la ligne importée', () => {
    const d = setup()
    const manual: Transaction = {
      id: 'm1',
      accountId: 'revolut',
      date: '2026-10-06',
      amount: -2340,
      label: 'Courses Monop',
      categoryId: 'cat-courses--alimentation',
      tags: ['semaine'],
      source: 'manuel',
      toReview: false,
    }
    d.transactions = [manual]
    const { data, stats } = importRows(d, 'revolut', parseStatement('r.csv', enc(REVOLUT)).rows)
    expect(stats.matchedManual).toBe(1)
    const mono = data.transactions.find((t) => t.label === 'Monoprix')!
    expect(mono.categoryId).toBe('cat-courses--alimentation')
    expect(mono.tags).toEqual(['semaine'])
    expect(data.transactions.find((t) => t.id === 'm1')!.matchedTxId).toBe(mono.id)
  })
})
