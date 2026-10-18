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
  grouped,
  onClose,
}: {
  title: string
  subtitle?: string
  /** Montant affiché : la part de l'opération concernée, en positif pour une dépense. */
  rows: SpendingRow[]
  /** Regroupe les opérations par catégorie, avec un total par catégorie (cliquer pour déplier). */
  grouped?: boolean
  onClose: () => void
}) {
  const { data } = useStore()
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const map = categoryMap(data.categories)

  const byCategory = new Map<string, SpendingRow[]>()
  for (const r of rows) byCategory.set(r.tx.categoryId ?? '', [...(byCategory.get(r.tx.categoryId ?? '') ?? []), r])
  const groups = [...byCategory]
    .map(([key, rs]) => ({ key, label: categoryLabel(key || undefined, map), rows: rs, total: rs.reduce((v, r) => v + r.amount, 0) }))
    .sort((a, b) => b.total - a.total)

  if (editing) return <TransactionEditor tx={editing} onClose={() => setEditing(null)} />

  return (
    <Sheet title={title} onClose={onClose}>
      <p className="small muted">
        {subtitle && `${subtitle} · `}
        {rows.length} opération{rows.length > 1 ? 's' : ''}
      </p>
      {!rows.length ? (
        <p className="muted">Aucune opération sur cette période.</p>
      ) : grouped ? (
        <ul className="list">
          {groups.map((g) => (
            <li key={g.key}>
              <button className="item" aria-expanded={open === g.key} onClick={() => setOpen(open === g.key ? null : g.key)}>
                <div className="grow">
                  <strong>{g.label}</strong>
                  <div className="muted small">
                    {g.rows.length} opération{g.rows.length > 1 ? 's' : ''} · {open === g.key ? 'masquer' : 'voir le détail'}
                  </div>
                </div>
                <Money cents={-g.total} signed />
              </button>
              {open === g.key && <TxList rows={g.rows} onOpen={setEditing} />}
            </li>
          ))}
        </ul>
      ) : (
        <TxList rows={rows} onOpen={setEditing} />
      )}
    </Sheet>
  )
}

function TxList({ rows, onOpen }: { rows: SpendingRow[]; onOpen: (tx: Transaction) => void }) {
  const { data } = useStore()
  const map = categoryMap(data.categories)
  const accounts = new Map(data.accounts.map((a) => [a.id, a.name]))
  return (
    <ul className="list">
      {rows.map(({ tx, amount }) => (
        <li key={tx.id}>
          <button className="item" onClick={() => onOpen(tx)}>
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
  )
}
