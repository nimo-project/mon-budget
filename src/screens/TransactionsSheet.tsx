import { useState } from 'react'
import { categoryLabel, categoryMap } from '../domain/categories'
import type { SpendingRow } from '../domain/charts'
import type { Transaction } from '../domain/types'
import { formatDate } from '../domain/util'
import { useStore } from '../state/store'
import { Money } from '../ui/fields'
import { Sheet } from '../ui/Sheet'
import { TransactionEditor } from './TransactionEditor'

/** Liste d'opérations dans une feuille ; un clic ouvre l'opération pour la modifier. */
export function TransactionsSheet({
  title,
  subtitle,
  rows,
  onClose,
}: {
  title: string
  subtitle?: string
  /** Montant affiché : la part de l'opération concernée, en positif pour une dépense. */
  rows: SpendingRow[]
  onClose: () => void
}) {
  const { data } = useStore()
  const [editing, setEditing] = useState<Transaction | null>(null)
  const map = categoryMap(data.categories)
  const accounts = new Map(data.accounts.map((a) => [a.id, a.name]))

  if (editing) return <TransactionEditor tx={editing} onClose={() => setEditing(null)} />

  return (
    <Sheet title={title} onClose={onClose}>
      <p className="small muted">
        {subtitle && `${subtitle} · `}
        {rows.length} opération{rows.length > 1 ? 's' : ''}
      </p>
      {rows.length ? (
        <ul className="list">
          {rows.map(({ tx, amount }) => (
            <li key={tx.id}>
              <button className="item" onClick={() => setEditing(tx)}>
                <div className="grow" style={{ minWidth: 0 }}>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.label}</div>
                  <div className="muted small">
                    {formatDate(tx.date)} · {categoryLabel(tx.categoryId, map)} · {accounts.get(tx.accountId)}
                    {Boolean(tx.splits?.length || tx.reimbursesId) && ' · part comptée ici'}
                  </div>
                </div>
                <Money cents={-amount} signed />
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
