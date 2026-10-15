import { useMemo, useState, type FormEvent } from 'react'
import { addTransaction } from '../domain/actions'
import { categoryMap, categoryLabel } from '../domain/categories'
import { today } from '../domain/util'
import { useStore } from '../state/store'
import { AccountSelect, CategorySelect, MoneyInput, TagInput } from '../ui/fields'
import { Sheet } from '../ui/Sheet'

/** Saisie rapide d'une dépense (ou d'un revenu) depuis n'importe quel écran. */
export function QuickAdd({ onClose }: { onClose: () => void }) {
  const { data, update } = useStore()
  const accounts = data.accounts.filter((a) => !a.archived && a.kind === 'courant')
  const [amount, setAmount] = useState<number | null>(null)
  const [income, setIncome] = useState(false)
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '')
  const account = data.accounts.find((a) => a.id === accountId)
  const [categoryId, setCategoryId] = useState<string | undefined>(account?.purposeCategoryId)
  const [label, setLabel] = useState('')
  const [date, setDate] = useState(today())
  const [note, setNote] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  const map = categoryMap(data.categories)
  // Catégories les plus utilisées ces derniers temps, en raccourcis.
  const frequent = useMemo(() => {
    const counts = new Map<string, number>()
    for (const t of data.transactions.slice(0, 300))
      if (t.categoryId && t.amount < 0 && !t.transferId) counts.set(t.categoryId, (counts.get(t.categoryId) ?? 0) + 1)
    return [...counts]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([id]) => id)
      .filter((id) => map.has(id))
  }, [data.transactions, map])
  const allTags = useMemo(() => [...new Set(data.transactions.flatMap((t) => t.tags))], [data.transactions])

  if (!accounts.length) {
    return (
      <Sheet title="Ajouter une dépense" onClose={onClose}>
        <p>Ajoute d'abord tes comptes dans Réglages.</p>
      </Sheet>
    )
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!amount || amount <= 0) return setError('Indique un montant.')
    const signed = income ? Math.abs(amount) : -Math.abs(amount)
    update((d) =>
      addTransaction(d, {
        accountId,
        date,
        amount: signed,
        label: label.trim() || (categoryId ? categoryLabel(categoryId, map) : 'Dépense'),
        note: note.trim() || undefined,
        categoryId,
        tags,
        source: 'manuel',
        toReview: !categoryId,
      }),
    )
    onClose()
  }

  return (
    <Sheet title={income ? 'Ajouter un revenu' : 'Ajouter une dépense'} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="chips" style={{ justifyContent: 'center', marginBottom: '0.75rem' }}>
          <button type="button" className={`chip ${!income ? 'active' : ''}`} onClick={() => setIncome(false)}>
            Dépense
          </button>
          <button type="button" className={`chip ${income ? 'active' : ''}`} onClick={() => setIncome(true)}>
            Revenu
          </button>
        </div>
        <label>
          Montant (€)
          <MoneyInput value={amount} onChange={setAmount} className="amount-input" autoFocus />
        </label>
        {frequent.length > 0 && (
          <div className="chips" style={{ marginBottom: '0.75rem' }}>
            {frequent.map((id) => (
              <button
                type="button"
                key={id}
                className={`chip ${categoryId === id ? 'active' : ''}`}
                onClick={() => setCategoryId(id)}
              >
                {map.get(id)!.name}
              </button>
            ))}
          </div>
        )}
        <div className="grid2">
          <label>
            Catégorie
            <CategorySelect categories={data.categories} value={categoryId} onChange={setCategoryId} />
          </label>
          <label>
            Compte
            <AccountSelect
              accounts={accounts}
              value={accountId}
              onChange={(id) => {
                setAccountId(id)
                const purpose = data.accounts.find((a) => a.id === id)?.purposeCategoryId
                if (purpose && !income) setCategoryId(purpose)
              }}
            />
          </label>
          <label>
            Libellé
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex. Boulangerie" />
          </label>
          <label>
            Date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>
        <label>
          Note
          <input value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <div className="small muted" style={{ marginBottom: '0.25rem' }}>Étiquettes</div>
        <TagInput tags={tags} onChange={setTags} suggestions={allTags} />
        {error && <p className="error">{error}</p>}
        <div className="row end" style={{ marginTop: '1rem' }}>
          <button type="button" className="btn" onClick={onClose}>
            Annuler
          </button>
          <button className="btn primary">Enregistrer</button>
        </div>
      </form>
    </Sheet>
  )
}
