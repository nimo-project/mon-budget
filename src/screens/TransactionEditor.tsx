import { useMemo, useState } from 'react'
import {
  acceptPriceChange,
  categorize,
  deleteTransaction,
  dismissPriceAlert,
  linkReimbursement,
  markTransfer,
  setSplits,
  unmarkTransfer,
  updateDetails,
  type Remember,
} from '../domain/actions'
import { categoryLabel, categoryMap } from '../domain/categories'
import type { AppData, Split, Transaction } from '../domain/types'
import { addDays, formatDate, formatMoney, sum } from '../domain/util'
import { useStore } from '../state/store'
import { CategorySelect, Money, MoneyInput, TagInput } from '../ui/fields'
import { Sheet } from '../ui/Sheet'

export function TransactionEditor({ tx, onClose }: { tx: Transaction; onClose: () => void }) {
  const { data, update } = useStore()
  const map = categoryMap(data.categories)
  const account = data.accounts.find((a) => a.id === tx.accountId)
  const [categoryId, setCategoryId] = useState(tx.categoryId)
  const [remember, setRemember] = useState<Remember>(tx.source === 'import' && !tx.ruleId ? 'libelle-montant' : 'non')
  const [splitting, setSplitting] = useState(!!tx.splits?.length)
  const [splits, setSplitRows] = useState<Split[]>(
    tx.splits?.length ? tx.splits : [{ categoryId: tx.categoryId ?? '', amount: tx.amount }, { categoryId: '', amount: 0 }],
  )
  const [tags, setTags] = useState(tx.tags)
  const [note, setNote] = useState(tx.note ?? '')
  const [label, setLabel] = useState(tx.label)
  const [date, setDate] = useState(tx.date)
  const [amount, setAmount] = useState<number | null>(tx.amount)
  const [reimburses, setReimburses] = useState(tx.reimbursesId)
  const [transferWith, setTransferWith] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const allTags = useMemo(() => [...new Set(data.transactions.flatMap((t) => t.tags))], [data.transactions])

  const splitTotal = sum(splits, (s) => s.amount)
  const manual = tx.source === 'manuel'
  const candidatesReimb = useMemo(() => reimbursementCandidates(data, tx), [data, tx])
  const candidatesTransfer = useMemo(() => transferCandidates(data, tx), [data, tx])

  const save = () => {
    setError(null)
    if (splitting) {
      const clean = splits.filter((s) => s.categoryId && s.amount !== 0)
      if (sum(clean, (s) => s.amount) !== (manual ? amount : tx.amount))
        return setError(`Le total des parts doit faire ${formatMoney(Math.abs(tx.amount))}.`)
      if (clean.length < 2) return setError('Indique au moins deux parts.')
    }
    try {
      update((d) => {
        let n: AppData = d
        if (manual && amount !== null)
          n = updateDetails(n, tx.id, { label: label.trim() || tx.label, date, amount })
        n = updateDetails(n, tx.id, { tags, note: note.trim() || undefined })
        if (transferWith) n = markTransfer(n, tx.id, transferWith)
        else if (tx.amount > 0 && reimburses !== tx.reimbursesId) n = linkReimbursement(n, tx.id, reimburses)
        if (splitting) n = setSplits(n, tx.id, splits.filter((s) => s.categoryId && s.amount !== 0))
        else if (!tx.transferId && !transferWith) n = categorize(n, tx.id, categoryId, remember)
        return n
      })
      onClose()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <Sheet title={manual ? 'Saisie manuelle' : 'Opération'} onClose={onClose}>
      <div className="stack">
        <div>
          <div className="row between">
            <strong>{tx.label}</strong>
            <Money cents={tx.amount} signed />
          </div>
          <div className="muted small">
            {formatDate(tx.date)} · {account?.name}
            {tx.ruleId && ' · classée par une règle'}
          </div>
        </div>

        {tx.priceAlert && (
          <div className="card warn">
            <p>
              Cet abonnement coûtait {formatMoney(-tx.priceAlert.previousAmount)}, il passe à {formatMoney(-tx.amount)}.
            </p>
            <div className="row">
              <button
                className="btn small primary"
                onClick={() => {
                  update((d) => acceptPriceChange(d, tx.id))
                  onClose()
                }}
              >
                Mettre à jour la règle
              </button>
              <button className="btn small" onClick={() => update((d) => dismissPriceAlert(d, tx.id))}>
                Ce n'est pas le même abonnement
              </button>
            </div>
          </div>
        )}

        {manual && (
          <div className="grid2">
            <label>
              Libellé
              <input value={label} onChange={(e) => setLabel(e.target.value)} />
            </label>
            <label>
              Date
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label>
              Montant (négatif pour une dépense)
              <MoneyInput value={amount} onChange={setAmount} />
            </label>
          </div>
        )}

        {tx.transferId ? (
          <div className="card">
            <p>Virement entre tes comptes : il n'est compté ni comme dépense ni comme revenu.</p>
            <button
              className="btn small"
              onClick={() => {
                update((d) => unmarkTransfer(d, tx.id))
                onClose()
              }}
            >
              Ce n'est pas un virement interne
            </button>
          </div>
        ) : (
          <>
            {!splitting ? (
              <div>
                <label>
                  Catégorie
                  <CategorySelect categories={data.categories} value={categoryId} onChange={setCategoryId} />
                </label>
                {categoryId && categoryId !== tx.categoryId && (
                  <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
                    <legend className="small muted" style={{ marginBottom: '0.25rem' }}>
                      Mémoriser pour les prochains imports
                    </legend>
                    <label className="inline">
                      <input type="radio" checked={remember === 'libelle-montant'} onChange={() => setRemember('libelle-montant')} />
                      Ce libellé avec ce montant ({formatMoney(Math.abs(tx.amount))})
                    </label>
                    <label className="inline">
                      <input type="radio" checked={remember === 'libelle'} onChange={() => setRemember('libelle')} />
                      Ce libellé, quel que soit le montant
                    </label>
                    <label className="inline">
                      <input type="radio" checked={remember === 'non'} onChange={() => setRemember('non')} />
                      Seulement cette fois
                    </label>
                  </fieldset>
                )}
                <button className="btn small" onClick={() => setSplitting(true)}>
                  Découper entre plusieurs catégories
                </button>
              </div>
            ) : (
              <div>
                <h3>Découpage</h3>
                {splits.map((s, i) => (
                  <div className="row" key={i} style={{ marginBottom: '0.5rem' }}>
                    <div className="grow">
                      <CategorySelect
                        categories={data.categories}
                        value={s.categoryId || undefined}
                        allowEmpty="Choisir…"
                        onChange={(id) => setSplitRows(splits.map((x, j) => (j === i ? { ...x, categoryId: id ?? '' } : x)))}
                      />
                    </div>
                    <div style={{ width: 120 }}>
                      <MoneyInput
                        key={`${i}-${splits.length}`}
                        value={Math.abs(s.amount)}
                        onChange={(v) =>
                          setSplitRows(splits.map((x, j) => (j === i ? { ...x, amount: Math.sign(tx.amount) * Math.abs(v ?? 0) } : x)))
                        }
                      />
                    </div>
                  </div>
                ))}
                <div className="row between small">
                  <button className="btn small" onClick={() => setSplitRows([...splits, { categoryId: '', amount: 0 }])}>
                    Ajouter une part
                  </button>
                  <span className={splitTotal === tx.amount ? 'muted' : 'over'}>
                    Reste à répartir : {formatMoney(Math.abs(tx.amount - splitTotal))}
                  </span>
                </div>
                <button
                  className="btn small ghost"
                  onClick={() => {
                    setSplitting(false)
                    update((d) => setSplits(d, tx.id, undefined))
                  }}
                >
                  Annuler le découpage
                </button>
              </div>
            )}

            {tx.amount > 0 && candidatesReimb.length > 0 && (
              <label>
                Remboursement d'une dépense
                <select value={reimburses ?? ''} onChange={(e) => setReimburses(e.target.value || undefined)}>
                  <option value="">Non</option>
                  {candidatesReimb.map((c) => (
                    <option key={c.id} value={c.id}>
                      {formatDate(c.date)} · {c.label} · {formatMoney(-c.amount)} · {categoryLabel(c.categoryId, map)}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {candidatesTransfer.length > 0 && (
              <label>
                Virement entre mes comptes
                <select value={transferWith} onChange={(e) => setTransferWith(e.target.value)}>
                  <option value="">Non</option>
                  {candidatesTransfer.map((c) => (
                    <option key={c.id} value={c.id}>
                      {formatDate(c.date)} · {data.accounts.find((a) => a.id === c.accountId)?.name} · {c.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </>
        )}

        <div>
          <div className="small muted" style={{ marginBottom: '0.25rem' }}>
            Étiquettes
          </div>
          <TagInput tags={tags} onChange={setTags} suggestions={allTags} />
        </div>
        <label>
          Note
          <input value={note} onChange={(e) => setNote(e.target.value)} />
        </label>

        {error && <p className="error">{error}</p>}
        <div className="row between">
          {manual ? (
            <button
              className="btn danger small"
              onClick={() => {
                if (confirm('Supprimer cette saisie ?')) {
                  update((d) => deleteTransaction(d, tx.id))
                  onClose()
                }
              }}
            >
              Supprimer
            </button>
          ) : (
            <span />
          )}
          <div className="row">
            <button className="btn" onClick={onClose}>
              Annuler
            </button>
            <button className="btn primary" onClick={save}>
              Enregistrer
            </button>
          </div>
        </div>
      </div>
    </Sheet>
  )
}

function reimbursementCandidates(data: AppData, tx: Transaction): Transaction[] {
  const from = addDays(tx.date, -120)
  return data.transactions
    .filter((t) => t.amount < 0 && !t.transferId && !t.matchedTxId && t.date >= from && t.date <= tx.date)
    .sort((a, b) => Math.abs(a.amount + tx.amount) - Math.abs(b.amount + tx.amount))
    .slice(0, 40)
}

function transferCandidates(data: AppData, tx: Transaction): Transaction[] {
  if (tx.transferId) return []
  return data.transactions.filter(
    (t) =>
      t.accountId !== tx.accountId &&
      !t.transferId &&
      !t.matchedTxId &&
      t.amount === -tx.amount &&
      t.date >= addDays(tx.date, -7) &&
      t.date <= addDays(tx.date, 7),
  )
}
