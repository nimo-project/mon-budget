import { useState } from 'react'
import { Link } from 'react-router-dom'
import { decideRollover } from '../domain/actions'
import { pendingRollovers, summarize, type EnvelopeStatus } from '../domain/budget'
import { forecast, upcomingDebits } from '../domain/insights'
import { currentPeriod, periodLabel, previousPeriod, type Period } from '../domain/periods'
import { UNALLOCATED_POT } from '../domain/savings'
import { accountBalance, allocatedTo, spentOn } from '../domain/transactions'
import type { RolloverAction } from '../domain/types'
import { daysBetween, formatDate, formatMoney, today } from '../domain/util'
import { useStore } from '../state/store'
import { Money, PageHead, ProgressBar } from '../ui/fields'
import { EnvelopeDetail } from './EnvelopeDetail'

export function Dashboard() {
  const { data } = useStore()
  const period = currentPeriod(data)
  const summary = summarize(data, period)
  const toReview = data.transactions.filter((t) => t.toReview && !t.matchedTxId).length
  const pending = pendingRollovers(data, period)
  const fc = forecast(data, summary)
  const upcoming = upcomingDebits(data, period)
  const daysLeft = Math.max(0, daysBetween(today(), period.end))

  if (!data.accounts.length) return <Onboarding />

  return (
    <div className="stack">
      <PageHead title="Ma période">
        <span className="muted small">
          {periodLabel(period)} · {daysLeft} jour{daysLeft > 1 ? 's' : ''} restant{daysLeft > 1 ? 's' : ''}
        </span>
      </PageHead>

      {toReview > 0 && (
        <div className="card warn row between">
          <span>
            {toReview} opération{toReview > 1 ? 's' : ''} à vérifier
          </span>
          <Link className="btn small" to="/operations">
            Vérifier
          </Link>
        </div>
      )}

      {pending.length > 0 && <RolloverDecisions />}

      <div className="grid2">
        <div className="card">
          <div className="muted small">Prévision le jour de ta paie</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700 }} className={fc.projectedLeft < 0 ? 'over' : ''}>
            <Money cents={fc.projectedLeft} />
          </div>
          <div className="small muted">
            Revenus {formatMoney(fc.income)} − dépensé {formatMoney(fc.spentSoFar)} − prélèvements à venir{' '}
            {formatMoney(fc.upcoming)} − dépenses courantes estimées {formatMoney(fc.variablePace)}
          </div>
        </div>
        <div className="card">
          <div className="muted small">Cette période</div>
          <div className="row between">
            <span>Revenus</span>
            <Money cents={summary.income} />
          </div>
          <div className="row between">
            <span>Prévu</span>
            <Money cents={summary.plannedOut} />
          </div>
          <div className="row between">
            <span>Réel</span>
            <Money cents={summary.actualOut} className={summary.actualOut > summary.plannedOut ? 'over' : ''} />
          </div>
          {summary.unbudgeted > 0 && (
            <div className="row between small muted">
              <span>dont hors budget</span>
              <Money cents={summary.unbudgeted} />
            </div>
          )}
          {summary.extra > 0 && (
            <div className="row between small">
              <span>Extra reporté</span>
              <Money cents={summary.extra} />
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="row between" style={{ marginBottom: '0.5rem' }}>
          <h2 style={{ margin: 0 }}>Enveloppes</h2>
          <Link to="/budget" className="small">
            Modifier le budget
          </Link>
        </div>
        {summary.envelopes.length === 0 ? (
          <p className="muted">
            Pas encore de budget. <Link to="/budget">Définis tes frais fixes, enveloppes et épargne</Link>.
          </p>
        ) : (
          <EnvelopeList envelopes={summary.envelopes} period={period} />
        )}
      </div>

      <AccountsCard />

      {upcoming.length > 0 && (
        <div className="card">
          <h2>Prélèvements à venir d'ici ta paie</h2>
          <ul className="list">
            {upcoming.map((r) => (
              <li key={r.key} className="row between">
                <span>
                  {formatDate(r.nextDate)} · {r.label}
                </span>
                <Money cents={-r.amount} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export function EnvelopeList({ envelopes, period }: { envelopes: EnvelopeStatus[]; period: Period }) {
  const [open, setOpen] = useState<EnvelopeStatus | null>(null)
  const order = ['fixe', 'variable', 'epargne', 'investissement']
  const sorted = [...envelopes].sort((a, b) => order.indexOf(a.line.kind) - order.indexOf(b.line.kind))
  return (
    <>
      <ul className="list">
        {sorted.map((e) => (
          <li key={e.line.id} style={{ paddingLeft: e.isChild ? '1rem' : 0 }}>
            <button className="envelope" onClick={() => setOpen(e)} aria-label={`Voir les opérations : ${e.name}`}>
              <div className="row between">
                <span>
                  {e.name}
                  {e.carried > 0 && <span className="badge accent"> +{formatMoney(e.carried)} reporté</span>}
                </span>
                <span className="small">
                  <Money cents={e.actual} className={e.state === 'depasse' ? 'over' : ''} /> / <Money cents={e.available} />
                </span>
              </div>
              <ProgressBar pct={e.pct} state={e.state} />
              <div className="small muted" style={{ marginTop: 2 }}>
                {e.remaining >= 0 ? `Reste ${formatMoney(e.remaining)}` : `Dépassé de ${formatMoney(-e.remaining)}`}
              </div>
            </button>
          </li>
        ))}
      </ul>
      {open && <EnvelopeDetail envelope={open} period={period} onClose={() => setOpen(null)} />}
    </>
  )
}

/** Restes de la période précédente : mis en avant pour que Nina décide quoi en faire. */
function RolloverDecisions() {
  const { data, update } = useStore()
  const period = currentPeriod(data)
  const prev = previousPeriod(period, data)
  const pending = pendingRollovers(data, period)
  const pots = data.pots.filter((p) => !p.archived && p.id !== UNALLOCATED_POT)
  const [potFor, setPotFor] = useState<Record<string, string>>({})

  const decide = (categoryId: string, amount: number, action: RolloverAction) =>
    update((d) =>
      decideRollover(
        d,
        prev.start,
        categoryId,
        amount,
        action,
        action === 'epargne' ? (potFor[categoryId] ?? pots[0]?.id) : undefined,
      ),
    )

  return (
    <div className="card highlight stack">
      <div>
        <h2>À décider : restes de la période précédente</h2>
        <p className="small" style={{ margin: 0 }}>
          Total {formatMoney(pending.reduce((s, p) => s + p.amount, 0))}. Choisis pour chaque enveloppe.
        </p>
      </div>
      <ul className="list">
        {pending.map((p) => (
          <li key={p.categoryId}>
            <div className="row between">
              <strong>{p.name}</strong>
              <Money cents={p.amount} />
            </div>
            <div className="row" style={{ marginTop: '0.4rem' }}>
              <button className="btn small" onClick={() => decide(p.categoryId, p.amount, 'garder')}>
                Garder dans l'enveloppe
              </button>
              <button className="btn small" onClick={() => decide(p.categoryId, p.amount, 'extra')}>
                Passer en extra
              </button>
              <select
                value={potFor[p.categoryId] ?? pots[0]?.id ?? ''}
                onChange={(e) => setPotFor({ ...potFor, [p.categoryId]: e.target.value })}
                style={{ width: 'auto', minHeight: 34, padding: '0.2rem 0.5rem' }}
                aria-label="Cagnotte"
              >
                {pots.map((pot) => (
                  <option key={pot.id} value={pot.id}>
                    {pot.name}
                  </option>
                ))}
              </select>
              <button className="btn small primary" onClick={() => decide(p.categoryId, p.amount, 'epargne')}>
                Épargner
              </button>
            </div>
          </li>
        ))}
      </ul>
      <p className="small muted" style={{ margin: 0 }}>
        « Épargner » : vire ce montant vers ton compte épargne ; à son arrivée, il sera proposé pour la cagnotte choisie.
      </p>
    </div>
  )
}

function AccountsCard() {
  const { data } = useStore()
  const period = currentPeriod(data)
  const accounts = data.accounts.filter((a) => !a.archived)
  return (
    <div className="card">
      <h2>Comptes</h2>
      <ul className="list">
        {accounts.map((a) => {
          const allocated = a.purposeCategoryId ? allocatedTo(a, data, period.start, period.end) : 0
          const spent = a.purposeCategoryId ? spentOn(a, data, period.start, period.end) : 0
          return (
            <li key={a.id}>
              <div className="row between">
                <span>
                  {a.name} <span className="small muted">{a.kind === 'epargne' ? 'épargne' : ''}</span>
                </span>
                <Money cents={accountBalance(a, data)} />
              </div>
              {a.purposeCategoryId && (
                <div className="small muted">
                  Alloué {formatMoney(allocated)} · dépensé {formatMoney(spent)} · reste {formatMoney(allocated - spent)}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function Onboarding() {
  return (
    <div className="stack">
      <h1>Bienvenue dans ton budget</h1>
      <div className="card">
        <ol style={{ margin: 0, paddingLeft: '1.25rem', lineHeight: 2 }}>
          <li>
            <Link to="/reglages">Ajoute tes comptes</Link> : Boursobank, SG, Revolut et ton compte épargne.
          </li>
          <li>
            <Link to="/import">Importe tes relevés</Link> (CSV ou OFX) et classe les opérations.
          </li>
          <li>
            <Link to="/budget">Définis ton budget</Link> : frais fixes, enveloppes, épargne.
          </li>
          <li>
            <Link to="/epargne">Répartis ton épargne</Link> dans tes cagnottes.
          </li>
        </ol>
      </div>
    </div>
  )
}
