import { categoryLabel, categoryMap } from './categories'
import type { AppData, Transaction } from './types'

function cell(v: string): string {
  return /[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

/** Export CSV (séparateur « ; », décimales à la virgule, lisible directement dans Excel en français). */
export function transactionsCsv(data: AppData, txs: Transaction[]): string {
  const map = categoryMap(data.categories)
  const accounts = new Map(data.accounts.map((a) => [a.id, a.name]))
  const header = ['Date', 'Compte', 'Libellé', 'Montant', 'Catégorie', 'Étiquettes', 'Note', 'Type']
  const lines = txs.flatMap((t) => {
    const type = t.transferId ? 'Virement interne' : t.reimbursesId ? 'Remboursement' : t.source === 'manuel' ? 'Saisie' : 'Import'
    const parts = t.splits?.length ? t.splits : [{ categoryId: t.categoryId ?? '', amount: t.amount }]
    return parts.map((p) =>
      [
        t.date,
        accounts.get(t.accountId) ?? '',
        t.label,
        (p.amount / 100).toFixed(2).replace('.', ','),
        categoryLabel(p.categoryId || undefined, map),
        t.tags.join(', '),
        t.note ?? '',
        type,
      ]
        .map(cell)
        .join(';'),
    )
  })
  return '﻿' + [header.join(';'), ...lines].join('\r\n')
}

export function download(name: string, content: string, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
