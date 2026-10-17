import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { categorize, confirmReview, type Remember } from '../domain/actions'
import { categoryLabel, categoryMap, subtree, UNCATEGORIZED } from '../domain/categories'
import { download, transactionsCsv } from '../domain/export'
import type { Transaction } from '../domain/types'
import { formatDate, normalizeLabel, today } from '../domain/util'
import { useStore } from '../state/store'
import { CategorySelect, Empty, Money, MoneyInput, PageHead } from '../ui/fields'
import { TransactionEditor } from './TransactionEditor'

export function Transactions() {
  const { data } = useStore()
  const toReview = data.transactions.filter((t) => t.toReview && !t.matchedTxId)
  const [tab, setTab] = useState<'review' | 'all'>(toReview.length ? 'review' : 'all')

  return (
    <div>
      <PageHead title="Opérations">
        <Link className="btn small" to="/import">
          Importer un relevé
        </Link>
      </PageHead>
      <div className="tabs" role="tablist">
        <button role="tab" className={tab === 'review' ? 'active' : ''} onClick={() => setTab('review')}>
          À vérifier {toReview.length > 0 && <span className="badge warn">{toReview.length}</span>}
        </button>
        <button role="tab" className={tab === 'all' ? 'active' : ''} onClick={() => setTab('all')}>
          Toutes
        </button>
      </div>
      {tab === 'review' ? <ReviewList items={toReview} /> : <AllTransactions />}
    </div>
  )
}

/** Écran « À vérifier » : classement rapide, ligne par ligne, avec mémorisation. */
function ReviewList({ items }: { items: Transaction[] }) {
  const { data } = useStore()
  const [editing, setEditing] = useState<Transaction | null>(null)
  const accounts = new Map(data.accounts.map((a) => [a.id, a.name]))

  if (!items.length) return <Empty>Tout est classé. Les nouvelles lignes importées arriveront ici.</Empty>

  return (
    <div className="card">
      <p className="muted small">
        Choisis une catégorie : elle est mémorisée pour ce libellé et ce montant, et appliquée aux prochains imports.
      </p>
      <ul className="list">
        {items.map((t) => (
          <ReviewRow key={t.id} tx={t} accountName={accounts.get(t.accountId) ?? ''} onOpen={() => setEditing(t)} />
        ))}
      </ul>
      {editing && <TransactionEditor tx={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function ReviewRow({ tx, accountName, onOpen }: { tx: Transaction; accountName: string; onOpen: () => void }) {
  const { data, update } = useStore()
  const [cat, setCat] = useState(tx.categoryId)
  const [remember, setRemember] = useState<Remember>('libelle-montant')
  return (
    <li>
      <div className="row between">
        <button className="item grow" onClick={onOpen} style={{ all: 'unset', cursor: 'pointer', flex: 1, minWidth: 0 }}>
          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
            <strong>{tx.label}</strong>
            {tx.priceAlert && <span className="badge warn"> nouveau prix</span>}
          </div>
          <div className="muted small">
            {formatDate(tx.date)} · {accountName}
          </div>
        </button>
        <Money cents={tx.amount} signed />
      </div>
      {tx.priceAlert ? (
        <button className="btn small" onClick={onOpen} style={{ marginTop: '0.5rem' }}>
          Voir le changement de prix
        </button>
      ) : (
        <div className="row" style={{ marginTop: '0.5rem' }}>
          <div className="grow" style={{ minWidth: 180 }}>
            <CategorySelect categories={data.categories} value={cat} onChange={setCat} />
          </div>
          <select value={remember} onChange={(e) => setRemember(e.target.value as Remember)} style={{ width: 'auto' }}>
            <option value="libelle-montant">Mémoriser libellé + montant</option>
            <option value="libelle">Mémoriser le libellé</option>
            <option value="non">Cette fois seulement</option>
          </select>
          <button
            className="btn small primary"
            disabled={!cat}
            onClick={() =>
              update((d) =>
                cat === tx.categoryId && remember === 'non' ? confirmReview(d, tx.id) : categorize(d, tx.id, cat, remember),
              )
            }
          >
            Valider
          </button>
        </div>
      )}
    </li>
  )
}

interface Filters {
  text: string
  accountId: string
  categoryId?: string
  tag: string
  from: string
  to: string
  min: number | null
  max: number | null
}

function AllTransactions() {
  const { data } = useStore()
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const [f, setF] = useState<Filters>({ text: '', accountId: '', tag: '', from: '', to: '', min: null, max: null })
  const [limit, setLimit] = useState(100)
  const map = categoryMap(data.categories)
  const accounts = new Map(data.accounts.map((a) => [a.id, a.name]))
  const tags = useMemo(() => [...new Set(data.transactions.flatMap((t) => t.tags))].sort(), [data.transactions])

  const filtered = useMemo(() => {
    const text = normalizeLabel(f.text)
    const cats = f.categoryId ? subtree(f.categoryId, data.categories) : null
    return data.transactions.filter((t) => {
      if (t.matchedTxId) return false
      if (text && !normalizeLabel(`${t.label} ${t.note ?? ''}`).includes(text)) return false
      if (f.accountId && t.accountId !== f.accountId) return false
      if (cats) {
        const ids = t.splits?.length ? t.splits.map((s) => s.categoryId) : [t.categoryId ?? UNCATEGORIZED]
        if (!ids.some((id) => cats.has(id))) return false
      }
      if (f.tag && !t.tags.includes(f.tag)) return false
      if (f.from && t.date < f.from) return false
      if (f.to && t.date > f.to) return false
      if (f.min !== null && Math.abs(t.amount) < f.min) return false
      if (f.max !== null && Math.abs(t.amount) > f.max) return false
      return true
    })
  }, [data.transactions, data.categories, f])

  const groups = useMemo(() => {
    const out: [string, Transaction[]][] = []
    for (const t of filtered.slice(0, limit)) {
      const last = out[out.length - 1]
      if (last && last[0] === t.date) last[1].push(t)
      else out.push([t.date, [t]])
    }
    return out
  }, [filtered, limit])

  if (!data.transactions.length)
    return (
      <Empty>
        Aucune opération pour l'instant. <Link to="/import">Importe un relevé</Link> ou ajoute une dépense avec le bouton +.
      </Empty>
    )

  return (
    <div className="stack">
      <div className="row">
        <input
          className="grow"
          type="search"
          placeholder="Rechercher un commerçant, une note…"
          value={f.text}
          onChange={(e) => setF({ ...f, text: e.target.value })}
          style={{ flex: 1, minWidth: 180 }}
        />
        <button className="btn small" onClick={() => setShowFilters(!showFilters)}>
          Filtres
        </button>
        <button className="btn small" onClick={() => download(`operations-${today()}.csv`, transactionsCsv(data, filtered))}>
          Exporter en CSV
        </button>
      </div>
      {showFilters && (
        <div className="card grid2">
          <label>
            Compte
            <select value={f.accountId} onChange={(e) => setF({ ...f, accountId: e.target.value })}>
              <option value="">Tous</option>
              {data.accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Catégorie
            <CategorySelect
              categories={data.categories}
              value={f.categoryId}
              onChange={(id) => setF({ ...f, categoryId: id })}
              allowEmpty="Toutes"
            />
          </label>
          <label>
            Étiquette
            <select value={f.tag} onChange={(e) => setF({ ...f, tag: e.target.value })}>
              <option value="">Toutes</option>
              {tags.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label>
            Du
            <input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} />
          </label>
          <label>
            Au
            <input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} />
          </label>
          <label>
            Montant minimum (€)
            <MoneyInput value={f.min} onChange={(v) => setF({ ...f, min: v === null ? null : Math.abs(v) })} />
          </label>
          <label>
            Montant maximum (€)
            <MoneyInput value={f.max} onChange={(v) => setF({ ...f, max: v === null ? null : Math.abs(v) })} />
          </label>
        </div>
      )}
      <p className="small muted">
        {filtered.length} opération{filtered.length > 1 ? 's' : ''}
      </p>
      {groups.map(([date, txs]) => (
        <div key={date}>
          <div className="small muted" style={{ margin: '0.5rem 0 0.25rem' }}>
            {formatDate(date)}
          </div>
          <div className="card" style={{ padding: '0 1rem' }}>
            <ul className="list">
              {txs.map((t) => (
                <li key={t.id}>
                  <button className="item" onClick={() => setEditing(t)}>
                    <div className="grow">
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.label}</div>
                      <div className="muted small">
                        {t.transferId
                          ? 'Virement entre tes comptes'
                          : t.splits?.length
                            ? `Découpée en ${t.splits.length} parts`
                            : categoryLabel(t.categoryId, map)}
                        {' · '}
                        {accounts.get(t.accountId)}
                        {t.reimbursesId && ' · remboursement'}
                        {t.source === 'manuel' && ' · saisie'}
                        {t.tags.map((tag) => (
                          <span key={tag} className="badge accent" style={{ marginLeft: 4 }}>
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                    <Money cents={t.amount} signed />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ))}
      {filtered.length > limit && (
        <button className="btn" onClick={() => setLimit(limit + 200)}>
          Afficher plus ({filtered.length - limit} restantes)
        </button>
      )}
      {editing && <TransactionEditor tx={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
