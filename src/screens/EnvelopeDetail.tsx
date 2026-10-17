import { useState } from 'react'
import type { EnvelopeStatus } from '../domain/budget'
import { categoryLabel, categoryMap, subtree } from '../domain/categories'
import { periodLabel, type Period } from '../domain/periods'
import { activeTransactions, allocations, txIndex } from '../domain/transactions'
import type { Transaction } from '../domain/types'
import { formatDate, sum } from '../domain/util'
import { useStore } from '../state/store'
import { Money } from '../ui/fields'
import { Sheet } from '../ui/Sheet'
import { TransactionEditor } from './TransactionEditor'

/** Opérations qui alimentent une ligne de budget sur la période, avec la part comptée dans la ligne. */
export function EnvelopeDetail({ envelope, period, onClose }: { envelope: EnvelopeStatus; period: Period; onClose: () => void }) {
  const { data } = useStore()
  const [editing, setEditing] = useState<Transaction | null>(null)
  const map = categoryMap(data.categories)
  const ids = subtree(envelope.line.categoryId, data.categories)
  const byId = txIndex(data)
  const accounts = new Map(data.accounts.map((a) => [a.id, a.name]))

  const rows = activeTransactions(data)
    .filter((t) => t.date >= period.start && t.date <= period.end)
    .map((t) => {
      const parts = allocations(t, data, byId).filter((a) => ids.has(a.categoryId))
      return { t, amount: sum(parts, (a) => a.amount), partial: Boolean(t.splits?.length || t.reimbursesId) }
    })
    .filter((r) => r.amount !== 0)
    .sort((a, b) => b.t.date.localeCompare(a.t.date))

  if (editing) return <TransactionEditor tx={editing} onClose={() => setEditing(null)} />

  return (
    <Sheet title={envelope.name} onClose={onClose}>
      <p className="small muted">
        Période {periodLabel(period)} · {rows.length} opération{rows.length > 1 ? 's' : ''}
      </p>
      {rows.length ? (
        <ul className="list">
          {rows.map(({ t, amount, partial }) => (
            <li key={t.id}>
              <button className="item" onClick={() => setEditing(t)}>
                <div className="grow" style={{ minWidth: 0 }}>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.label}</div>
                  <div className="muted small">
                    {formatDate(t.date)} · {categoryLabel(t.categoryId, map)} · {accounts.get(t.accountId)}
                    {partial && ' · part comptée ici'}
                  </div>
                </div>
                <Money cents={amount} signed />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">Aucune opération sur cette période.</p>
      )}
    </Sheet>
  )
}
