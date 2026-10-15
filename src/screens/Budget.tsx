import { useState } from 'react'
import { BUDGET_KIND_LABEL, monthlyAnnualProvision, summarize, topLines } from '../domain/budget'
import { categoryLabel, categoryMap } from '../domain/categories'
import { forecast } from '../domain/insights'
import { currentPeriod, nextPeriod, periodLabel, previousPeriod, type Period } from '../domain/periods'
import type { BudgetKind, CategoryKind } from '../domain/types'
import { formatMoney, sum, today, uid } from '../domain/util'
import { useStore } from '../state/store'
import { CategorySelect, Money, MoneyInput, PageHead } from '../ui/fields'
import { EnvelopeList } from './Dashboard'

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']

export function BudgetScreen() {
  const [tab, setTab] = useState<'suivi' | 'definir' | 'annuel'>('suivi')
  return (
    <div>
      <PageHead title="Budget" />
      <div className="tabs" role="tablist">
        <button role="tab" className={tab === 'suivi' ? 'active' : ''} onClick={() => setTab('suivi')}>
          Prévu / réel
        </button>
        <button role="tab" className={tab === 'definir' ? 'active' : ''} onClick={() => setTab('definir')}>
          Budget de base
        </button>
        <button role="tab" className={tab === 'annuel' ? 'active' : ''} onClick={() => setTab('annuel')}>
          Dépenses annuelles
        </button>
      </div>
      {tab === 'suivi' && <Tracking />}
      {tab === 'definir' && <BaseBudget />}
      {tab === 'annuel' && <AnnualExpenses />}
    </div>
  )
}

function Tracking() {
  const { data } = useStore()
  const [period, setPeriod] = useState<Period>(() => currentPeriod(data))
  const summary = summarize(data, period)
  const isCurrent = period.start === currentPeriod(data).start
  return (
    <div className="stack">
      <div className="row between">
        <button className="btn small" onClick={() => setPeriod(previousPeriod(period, data))}>
          ← Précédente
        </button>
        <strong className="small">Période {periodLabel(period)}</strong>
        <button className="btn small" disabled={isCurrent} onClick={() => setPeriod(nextPeriod(period, data))}>
          Suivante →
        </button>
      </div>
      <div className="card grid2">
        <div>
          <div className="muted small">Revenus</div>
          <Money cents={summary.income} />
        </div>
        <div>
          <div className="muted small">Prévu</div>
          <Money cents={summary.plannedOut} />
        </div>
        <div>
          <div className="muted small">Réel</div>
          <Money cents={summary.actualOut} className={summary.actualOut > summary.plannedOut ? 'over' : ''} />
        </div>
        <div>
          <div className="muted small">Hors budget</div>
          <Money cents={summary.unbudgeted} />
        </div>
      </div>
      <div className="card">
        {summary.envelopes.length ? <EnvelopeList envelopes={summary.envelopes} /> : <p className="muted">Aucune ligne de budget.</p>}
      </div>
    </div>
  )
}

function defaultKind(kind: CategoryKind | undefined): BudgetKind {
  if (kind === 'epargne') return 'epargne'
  if (kind === 'investissement') return 'investissement'
  return 'variable'
}

function BaseBudget() {
  const { data, update } = useStore()
  const map = categoryMap(data.categories)
  const [categoryId, setCategoryId] = useState<string | undefined>()
  const [kind, setKind] = useState<BudgetKind>('variable')
  const [amount, setAmount] = useState<number | null>(null)
  const [formKey, setFormKey] = useState(0)
  const income = forecast(data).income
  const plannedOut = sum(topLines(data), (l) => l.amount) + monthlyAnnualProvision(data)

  const add = () => {
    if (!categoryId || !amount) return
    update((d) => ({
      ...d,
      budget: [...d.budget.filter((b) => b.categoryId !== categoryId), { id: uid(), categoryId, kind, amount: Math.abs(amount) }],
    }))
    setCategoryId(undefined)
    setAmount(null)
    setFormKey(formKey + 1)
  }

  const kinds: BudgetKind[] = ['fixe', 'variable', 'epargne', 'investissement']
  return (
    <div className="stack">
      <div className="card">
        <div className="row between">
          <span>Revenu de référence (dernier salaire)</span>
          <Money cents={income} />
        </div>
        <div className="row between">
          <span>Total prévu par période</span>
          <Money cents={plannedOut} />
        </div>
        <div className="row between">
          <strong>Reste à affecter</strong>
          <Money cents={income - plannedOut} className={income - plannedOut < 0 ? 'over' : ''} />
        </div>
        {monthlyAnnualProvision(data) > 0 && (
          <p className="small muted" style={{ marginTop: '0.5rem' }}>
            Inclut {formatMoney(monthlyAnnualProvision(data))} de provision pour les dépenses annuelles.
          </p>
        )}
      </div>

      {kinds.map((k) => {
        const lines = data.budget.filter((b) => b.kind === k)
        return (
          <div className="card" key={k}>
            <div className="row between">
              <h2 style={{ margin: 0 }}>{BUDGET_KIND_LABEL[k]}</h2>
              <Money cents={sum(lines.filter((l) => topLines(data).includes(l)), (l) => l.amount)} />
            </div>
            {lines.length === 0 && <p className="muted small">Aucune ligne.</p>}
            <ul className="list">
              {lines.map((l) => (
                <li key={l.id} className="row">
                  <span className="grow">{categoryLabel(l.categoryId, map)}</span>
                  <div style={{ width: 120 }}>
                    <MoneyInput
                      value={l.amount}
                      onChange={(v) =>
                        v !== null &&
                        update((d) => ({ ...d, budget: d.budget.map((b) => (b.id === l.id ? { ...b, amount: Math.abs(v) } : b)) }))
                      }
                    />
                  </div>
                  <button
                    className="btn small ghost danger"
                    aria-label="Supprimer"
                    onClick={() => update((d) => ({ ...d, budget: d.budget.filter((b) => b.id !== l.id) }))}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )
      })}

      <div className="card stack" key={formKey}>
        <h2>Ajouter une ligne</h2>
        <div className="grid2">
          <label>
            Catégorie
            <CategorySelect
              categories={data.categories}
              kinds={['depense', 'epargne', 'investissement']}
              value={categoryId}
              allowEmpty="Choisir…"
              onChange={(id) => {
                setCategoryId(id)
                setKind(defaultKind(id ? map.get(id)?.kind : undefined))
              }}
            />
          </label>
          <label>
            Type
            <select value={kind} onChange={(e) => setKind(e.target.value as BudgetKind)}>
              {kinds.map((k) => (
                <option key={k} value={k}>
                  {BUDGET_KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Montant par période (€)
            <MoneyInput value={amount} onChange={setAmount} />
          </label>
        </div>
        <p className="small muted" style={{ margin: 0 }}>
          Tu peux fixer un budget sur une catégorie (ex. Plaisir) et aussi sur une sous-catégorie (ex. Beauté) : la sous-catégorie est
          alors suivie à part, sans être comptée deux fois.
        </p>
        <div className="row end">
          <button className="btn primary" disabled={!categoryId || !amount} onClick={add}>
            Ajouter
          </button>
        </div>
      </div>
    </div>
  )
}

function AnnualExpenses() {
  const { data, update } = useStore()
  const map = categoryMap(data.categories)
  const [name, setName] = useState('')
  const [amount, setAmount] = useState<number | null>(null)
  const [month, setMonth] = useState(12)
  const [categoryId, setCategoryId] = useState<string | undefined>()
  const [formKey, setFormKey] = useState(0)
  const currentMonth = Number(today().slice(5, 7))

  const add = () => {
    if (!name.trim() || !amount) return
    update((d) => ({
      ...d,
      annualExpenses: [...d.annualExpenses, { id: uid(), name: name.trim(), amount: Math.abs(amount), dueMonth: month, categoryId }],
    }))
    setName('')
    setAmount(null)
    setFormKey(formKey + 1)
  }

  return (
    <div className="stack">
      <div className="card">
        <p className="small muted">
          Assurance, taxe foncière, cadeaux de Noël… L'app met de côté 1/12 de chaque dépense par mois dans ton budget, pour que
          l'échéance ne le déséquilibre pas.
        </p>
        {data.annualExpenses.length === 0 && <p className="muted">Aucune dépense annuelle.</p>}
        <ul className="list">
          {data.annualExpenses
            .slice()
            .sort((a, b) => ((a.dueMonth - currentMonth + 12) % 12) - ((b.dueMonth - currentMonth + 12) % 12))
            .map((e) => {
              const monthsLeft = (e.dueMonth - currentMonth + 12) % 12 || 12
              const provisioned = Math.round((e.amount / 12) * (12 - monthsLeft))
              return (
                <li key={e.id}>
                  <div className="row between">
                    <strong>{e.name}</strong>
                    <Money cents={e.amount} />
                  </div>
                  <div className="small muted">
                    Échéance en {MONTHS[e.dueMonth - 1]} · {formatMoney(Math.round(e.amount / 12))} par mois
                    {e.categoryId && ` · ${categoryLabel(e.categoryId, map)}`}
                  </div>
                  <div className="row between small">
                    <span>Provisionné à ce jour : {formatMoney(provisioned)}</span>
                    <button
                      className="btn small ghost danger"
                      onClick={() => update((d) => ({ ...d, annualExpenses: d.annualExpenses.filter((x) => x.id !== e.id) }))}
                    >
                      Supprimer
                    </button>
                  </div>
                </li>
              )
            })}
        </ul>
        {data.annualExpenses.length > 0 && (
          <div className="row between" style={{ marginTop: '0.5rem' }}>
            <strong>Provision mensuelle totale</strong>
            <Money cents={monthlyAnnualProvision(data)} />
          </div>
        )}
      </div>
      <div className="card stack" key={formKey}>
        <h2>Ajouter une dépense annuelle</h2>
        <div className="grid2">
          <label>
            Nom
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. Assurance auto" />
          </label>
          <label>
            Montant annuel (€)
            <MoneyInput value={amount} onChange={setAmount} />
          </label>
          <label>
            Mois d'échéance
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label>
            Catégorie (facultatif)
            <CategorySelect categories={data.categories} kinds={['depense']} value={categoryId} onChange={setCategoryId} allowEmpty="Aucune" />
          </label>
        </div>
        <div className="row end">
          <button className="btn primary" disabled={!name.trim() || !amount} onClick={add}>
            Ajouter
          </button>
        </div>
      </div>
    </div>
  )
}
