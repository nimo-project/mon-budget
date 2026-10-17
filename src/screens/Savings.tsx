import { useState } from 'react'
import { fixedCostsPerPeriod } from '../domain/budget'
import { categoryLabel, categoryMap } from '../domain/categories'
import { currentPeriod } from '../domain/periods'
import {
  allocationMovements,
  investmentContributions,
  potStatuses,
  savingsBalance,
  suggestAllocation,
  transferBetweenPots,
  UNALLOCATED_POT,
  unallocatedSavingsTransactions,
} from '../domain/savings'
import type { Pot, Transaction } from '../domain/types'
import { addMonths, formatDate, formatMoney, today, uid } from '../domain/util'
import { useStore } from '../state/store'
import { CategorySelect, Money, MoneyInput, PageHead, ProgressBar } from '../ui/fields'
import { Sheet } from '../ui/Sheet'

const POT_TYPE_LABEL = { precaution: 'Précaution', projet: 'Projet', impots: 'Impôts', non_reparti: 'Non réparti' }

export function SavingsScreen() {
  const { data } = useStore()
  const hasSavingsAccount = data.accounts.some((a) => a.kind === 'epargne' && !a.archived)
  const statuses = potStatuses(data)
  const total = savingsBalance(data)
  const pending = unallocatedSavingsTransactions(data)
  const [editing, setEditing] = useState<Pot | null>(null)
  const [moving, setMoving] = useState(false)
  const [allocating, setAllocating] = useState<Transaction | null>(null)

  return (
    <div className="stack">
      <PageHead title="Épargne">
        <button className="btn small" onClick={() => setMoving(true)}>
          Déplacer entre cagnottes
        </button>
        <button className="btn small primary" onClick={() => setEditing({ id: '', name: '', type: 'projet', priority: false })}>
          Nouveau projet
        </button>
      </PageHead>

      {!hasSavingsAccount && (
        <div className="card warn">
          Ajoute ton compte épargne dans Réglages pour suivre son solde et le répartir en cagnottes.
        </div>
      )}

      {pending.length > 0 && (
        <div className="card highlight">
          <h2>À répartir</h2>
          <ul className="list">
            {pending.slice(0, 10).map((t) => (
              <li key={t.id} className="row between">
                <span>
                  {formatDate(t.date)} · {t.amount > 0 ? 'Versement' : 'Retrait'} <Money cents={t.amount} signed />
                </span>
                <button className="btn small primary" onClick={() => setAllocating(t)}>
                  Répartir
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card">
        <div className="row between">
          <span className="muted">Solde du compte épargne</span>
          <strong style={{ fontSize: '1.4rem' }}>
            <Money cents={total} />
          </strong>
        </div>
        <SplitBar items={statuses.map((s) => ({ name: s.pot.name, value: Math.max(0, s.balance), type: s.pot.type }))} />
      </div>

      <div className="grid2">
        {statuses.map((s) => (
          <div className="card" key={s.pot.id}>
            <div className="row between">
              <strong>{s.pot.name}</strong>
              <Money cents={s.balance} />
            </div>
            <div className="small muted" style={{ marginBottom: '0.4rem' }}>
              {POT_TYPE_LABEL[s.pot.type]}
              {s.pot.priority && ' · prioritaire'}
              {s.pot.type === 'precaution' && s.pot.goalMonths && ` · ${s.pot.goalMonths} mois de frais fixes`}
            </div>
            {s.goal ? (
              <>
                <ProgressBar pct={s.pct ?? 0} />
                <div className="small muted" style={{ marginTop: 4 }}>
                  Objectif {formatMoney(s.goal)}
                  {s.pot.goalDate && ` pour le ${formatDate(s.pot.goalDate)}`}
                  {s.monthlyNeeded ? ` · ${formatMoney(s.monthlyNeeded)} par mois` : ''}
                </div>
                {s.late && <span className="badge warn">En retard sur l'objectif</span>}
                {s.balance >= s.goal && <span className="badge accent">Objectif atteint</span>}
              </>
            ) : (
              s.pot.id !== UNALLOCATED_POT && <div className="small muted">Pas d'objectif</div>
            )}
            {s.pot.type === 'precaution' && fixedCostsPerPeriod(data) === 0 && (
              <p className="small muted">Renseigne tes frais fixes dans Budget pour calculer l'objectif.</p>
            )}
            {s.pot.id !== UNALLOCATED_POT && (
              <button className="btn small ghost" onClick={() => setEditing(s.pot)}>
                Modifier
              </button>
            )}
          </div>
        ))}
      </div>

      <Investments />

      {editing && <PotForm pot={editing} onClose={() => setEditing(null)} />}
      {moving && <MoveForm onClose={() => setMoving(false)} />}
      {allocating && <AllocateForm tx={allocating} onClose={() => setAllocating(null)} />}
    </div>
  )
}

const COLORS: Record<string, string> = {
  precaution: 'var(--accent)',
  impots: 'var(--warn)',
  projet: 'var(--gold)',
  non_reparti: 'var(--border)',
}

function SplitBar({ items }: { items: { name: string; value: number; type: string }[] }) {
  const total = items.reduce((s, i) => s + i.value, 0)
  if (!total) return null
  return (
    <div style={{ marginTop: '0.75rem' }}>
      <div style={{ display: 'flex', height: 14, borderRadius: 999, overflow: 'hidden', gap: 2 }}>
        {items
          .filter((i) => i.value > 0)
          .map((i) => (
            <span
              key={i.name}
              title={`${i.name} : ${formatMoney(i.value)}`}
              style={{ flex: i.value, background: COLORS[i.type] }}
            />
          ))}
      </div>
      <div className="row small" style={{ marginTop: '0.4rem', gap: '0.9rem' }}>
        {items
          .filter((i) => i.value > 0)
          .map((i) => (
            <span key={i.name} className="row" style={{ gap: 4 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: COLORS[i.type], display: 'inline-block' }} />
              {i.name} {formatMoney(i.value)}
            </span>
          ))}
      </div>
    </div>
  )
}

function PotForm({ pot, onClose }: { pot: Pot; onClose: () => void }) {
  const { data, update } = useStore()
  const [p, setP] = useState(pot)
  const fixed = fixedCostsPerPeriod(data)
  const save = () => {
    if (!p.name.trim()) return
    update((d) => ({
      ...d,
      pots: p.id
        ? d.pots.map((x) => (x.id === p.id ? { ...p, name: p.name.trim() } : x))
        : [...d.pots, { ...p, id: uid(), name: p.name.trim() }],
    }))
    onClose()
  }
  return (
    <Sheet title={pot.id ? `Modifier ${pot.name}` : 'Nouveau projet'} onClose={onClose}>
      <label>
        Nom
        <input value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} placeholder="Ex. Voyage Japon" autoFocus />
      </label>
      {p.type === 'precaution' ? (
        <label>
          Objectif en mois de frais fixes {fixed > 0 && `(1 mois = ${formatMoney(fixed)})`}
          <input
            type="number"
            min={1}
            max={24}
            value={p.goalMonths ?? 3}
            onChange={(e) => setP({ ...p, goalMonths: Number(e.target.value) || undefined })}
          />
        </label>
      ) : (
        <div className="grid2">
          <label>
            Objectif (€, facultatif)
            <MoneyInput
              value={p.goalAmount ?? null}
              onChange={(v) => setP({ ...p, goalAmount: v === null ? undefined : Math.abs(v) })}
            />
          </label>
          <label>
            Pour le (facultatif)
            <input type="date" value={p.goalDate ?? ''} onChange={(e) => setP({ ...p, goalDate: e.target.value || undefined })} />
          </label>
        </div>
      )}
      <label className="inline">
        <input type="checkbox" checked={p.priority} onChange={(e) => setP({ ...p, priority: e.target.checked })} />
        Prioritaire (remplie en premier lors des répartitions)
      </label>
      {pot.id && p.type === 'projet' && (
        <label className="inline">
          <input
            type="checkbox"
            checked={!!p.archived}
            onChange={(e) => setP({ ...p, archived: e.target.checked || undefined })}
          />
          Projet terminé (archiver ; déplace d'abord son solde)
        </label>
      )}
      <div className="row end" style={{ marginTop: '1rem' }}>
        <button className="btn" onClick={onClose}>
          Annuler
        </button>
        <button className="btn primary" onClick={save}>
          Enregistrer
        </button>
      </div>
    </Sheet>
  )
}

function MoveForm({ onClose }: { onClose: () => void }) {
  const { data, update } = useStore()
  const pots = data.pots.filter((p) => !p.archived)
  const [from, setFrom] = useState(UNALLOCATED_POT)
  const [to, setTo] = useState(pots.find((p) => p.id !== UNALLOCATED_POT)?.id ?? UNALLOCATED_POT)
  const [amount, setAmount] = useState<number | null>(null)
  return (
    <Sheet title="Déplacer entre cagnottes" onClose={onClose}>
      <div className="grid2">
        <label>
          De
          <select value={from} onChange={(e) => setFrom(e.target.value)}>
            {pots.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Vers
          <select value={to} onChange={(e) => setTo(e.target.value)}>
            {pots.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Montant (€)
          <MoneyInput value={amount} onChange={setAmount} autoFocus />
        </label>
      </div>
      <div className="row end">
        <button className="btn" onClick={onClose}>
          Annuler
        </button>
        <button
          className="btn primary"
          disabled={!amount || from === to}
          onClick={() => {
            update((d) => ({
              ...d,
              potMovements: [...d.potMovements, ...transferBetweenPots(from, to, Math.abs(amount!), today())],
            }))
            onClose()
          }}
        >
          Déplacer
        </button>
      </div>
    </Sheet>
  )
}

/** Répartit un versement (ou un retrait) du compte épargne entre les cagnottes. */
function AllocateForm({ tx, onClose }: { tx: Transaction; onClose: () => void }) {
  const { data, update } = useStore()
  const pots = data.pots.filter((p) => !p.archived)
  const deposit = tx.amount > 0
  const [split, setSplit] = useState<Map<string, number>>(() =>
    deposit
      ? suggestAllocation(tx.amount, data)
      : new Map([[pots.find((p) => p.type === 'projet')?.id ?? UNALLOCATED_POT, tx.amount]]),
  )
  const total = [...split.values()].reduce((s, v) => s + v, 0)
  const save = () => {
    update((d) => {
      const moves = allocationMovements(split, tx.date, tx.id)
      return {
        ...d,
        potMovements: [...d.potMovements, ...moves],
        transactions: d.transactions.map((t) => (t.id === tx.id ? { ...t, potSettled: true } : t)),
      }
    })
    onClose()
  }
  return (
    <Sheet title={deposit ? `Répartir ${formatMoney(tx.amount)}` : `Retrait de ${formatMoney(-tx.amount)}`} onClose={onClose}>
      <p className="small muted">
        {deposit
          ? 'Proposition : les cagnottes prioritaires d’abord, le reste dans « Non réparti ». Ajuste les montants si besoin.'
          : 'Indique de quelle(s) cagnotte(s) sort cet argent.'}
      </p>
      {pots.map((p) => (
        <div className="row" key={p.id} style={{ marginBottom: '0.5rem' }}>
          <span className="grow">{p.name}</span>
          <div style={{ width: 130 }}>
            <MoneyInput
              value={Math.abs(split.get(p.id) ?? 0) || null}
              onChange={(v) => {
                const next = new Map(split)
                next.set(p.id, Math.sign(tx.amount) * Math.abs(v ?? 0))
                setSplit(next)
              }}
            />
          </div>
        </div>
      ))}
      <p className={total === tx.amount ? 'small muted' : 'small over'}>
        Réparti {formatMoney(Math.abs(total))} sur {formatMoney(Math.abs(tx.amount))}
      </p>
      <div className="row end">
        <button className="btn" onClick={onClose}>
          Annuler
        </button>
        <button className="btn primary" disabled={total !== tx.amount} onClick={save}>
          Valider
        </button>
      </div>
    </Sheet>
  )
}

function Investments() {
  const { data, update } = useStore()
  const map = categoryMap(data.categories)
  const period = currentPeriod(data)
  const yearAgo = addMonths(today(), -12)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState<string | undefined>()
  const [goal, setGoal] = useState<number | null>(null)

  return (
    <div className="card">
      <div className="row between">
        <h2 style={{ margin: 0 }}>Investissements</h2>
        <button className="btn small" onClick={() => setAdding(!adding)}>
          Ajouter
        </button>
      </div>
      <p className="small muted">Seuls tes versements sont suivis (pas le solde), grâce à leur catégorie.</p>
      {data.investments.length === 0 && !adding && <p className="muted small">Aucun investissement suivi.</p>}
      <ul className="list">
        {data.investments.map((inv) => {
          const thisPeriod = investmentContributions(data, inv.categoryId, period.start, period.end)
          const year = investmentContributions(data, inv.categoryId, yearAgo, today())
          return (
            <li key={inv.id}>
              <div className="row between">
                <strong>{inv.name}</strong>
                <span className="small muted">{categoryLabel(inv.categoryId, map)}</span>
              </div>
              <div className="small">
                Cette période : <Money cents={thisPeriod} />
                {inv.monthlyGoal ? ` sur ${formatMoney(inv.monthlyGoal)} visés` : ''} · 12 derniers mois : <Money cents={year} />
              </div>
              {inv.monthlyGoal && <ProgressBar pct={Math.round((thisPeriod / inv.monthlyGoal) * 100)} />}
              <button
                className="btn small ghost danger"
                onClick={() => update((d) => ({ ...d, investments: d.investments.filter((x) => x.id !== inv.id) }))}
              >
                Retirer
              </button>
            </li>
          )
        })}
      </ul>
      {adding && (
        <div className="stack" style={{ marginTop: '0.75rem' }}>
          <div className="grid2">
            <label>
              Nom
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. PEA Bourse Direct" />
            </label>
            <label>
              Catégorie des versements
              <CategorySelect
                categories={data.categories}
                kinds={['investissement']}
                value={categoryId}
                onChange={setCategoryId}
                allowEmpty="Choisir…"
              />
            </label>
            <label>
              Objectif de versement par période (€, facultatif)
              <MoneyInput value={goal} onChange={setGoal} />
            </label>
          </div>
          <div className="row end">
            <button
              className="btn primary"
              disabled={!name.trim() || !categoryId}
              onClick={() => {
                update((d) => ({
                  ...d,
                  investments: [
                    ...d.investments,
                    { id: uid(), name: name.trim(), categoryId: categoryId!, monthlyGoal: goal ? Math.abs(goal) : undefined },
                  ],
                }))
                setAdding(false)
                setName('')
                setGoal(null)
              }}
            >
              Ajouter
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
