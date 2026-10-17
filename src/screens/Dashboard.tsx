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
import { CategoryBars, HistoryBars, Legend, PaceChart } from '../ui/charts'
import {
  periodSpendingRows,
  plannedSpending,
  spendingBreakdown,
  spendingByCategory,
  spendingGroupOf,
  spendingHistory,
  spendingPace,
  spendingRootOf,
  type SpendingGroup,
} from '../domain/charts'
import { TransactionsSheet } from './TransactionsSheet'
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
  const pace = spendingPace(data, period)
  const byCategory = spendingByCategory(data, period)
  const history = spendingHistory(data)
  const plannedSpend = plannedSpending(data, period)
  const spentSoFar = pace.reduce((v, p) => p.actual ?? v, 0)
  const totalDays = daysBetween(period.start, period.end) + 1
  const timePct = Math.round((Math.min(totalDays, daysBetween(period.start, today()) + 1) / totalDays) * 100)
  const breakdown = spendingBreakdown(data, period)
  const [detail, setDetail] = useState<{ title: string; keep: (categoryId: string) => boolean } | null>(null)
  const showGroup = (group: SpendingGroup, title: string) => {
    const groupOf = spendingGroupOf(data, period)
    setDetail({ title, keep: (id) => groupOf(id) === group })
  }
  const showRoot = (root: string, title: string) => {
    const rootOf = spendingRootOf(data)
    const groupOf = spendingGroupOf(data, period)
    setDetail({ title, keep: (id) => groupOf(id) !== null && rootOf(id) === root })
  }
  // Épargne versée sur la période (le reste de « réel » hors dépenses).
  const savedSoFar = Math.max(0, fc.spentSoFar - spentSoFar)
  // Les frais fixes tombent souvent en début de période : le rythme se juge sur les budgets variables.
  const spentPct = breakdown.planned.variable > 0 ? Math.round((breakdown.spent.variable / breakdown.planned.variable) * 100) : 0

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

      <div className="card stack">
        <div className="hero-head">
          <div>
            <div className="muted small">Reste à dépenser sur la période</div>
            <div className={`hero-amount${plannedSpend - spentSoFar < 0 ? ' over' : ''}`}>
              <Money cents={plannedSpend - spentSoFar} />
            </div>
            <div className="small muted">
              {formatMoney(spentSoFar)} dépensés sur {formatMoney(plannedSpend)} prévus
            </div>
          </div>
          <div className="hero-side">
            <div className="muted small">Prévision le jour de ta paie</div>
            <div
              style={{ fontSize: '1.25rem', fontWeight: 700 }}
              className={fc.income - spentSoFar - savedSoFar - fc.upcoming - fc.variablePace < 0 ? 'over' : ''}
            >
              <Money cents={fc.income - spentSoFar - savedSoFar - fc.upcoming - fc.variablePace} />
            </div>
          </div>
        </div>
        <div className="meter">
          <span className="muted">Période écoulée</span>
          <span className="meter-track">
            <span className="meter-fill time" style={{ width: `${timePct}%` }} />
          </span>
          <span>{timePct} %</span>
        </div>
        <div className="meter">
          <span className="muted">Budgets variables</span>
          <span className="meter-track">
            <span
              className={`meter-fill${spentPct > timePct + 5 ? ' over' : ''}`}
              style={{ width: `${Math.min(100, spentPct)}%` }}
            />
          </span>
          <span>{spentPct} %</span>
        </div>
        <p className="small muted" style={{ margin: 0 }}>
          {breakdown.planned.variable === 0
            ? 'Ajoute des budgets variables (courses, sorties…) pour suivre ton rythme de dépenses.'
            : spentPct > timePct + 5
              ? 'Tes budgets variables partent plus vite que le temps : ralentis un peu.'
              : 'Tes budgets variables sont dans les clous.'}
        </p>
        <details className="small">
          <summary className="muted">Comment c'est calculé</summary>
          <table className="table breakdown">
            <thead>
              <tr>
                <th>Reste à dépenser</th>
                <th>Prévu</th>
                <th>Dépensé</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Frais fixes</td>
                <td>
                  <Money cents={breakdown.planned.fixe} />
                </td>
                <td>
                  <Money cents={breakdown.spent.fixe} />
                </td>
              </tr>
              <tr>
                <td>Budgets variables</td>
                <td>
                  <Money cents={breakdown.planned.variable} />
                </td>
                <td>
                  <Money cents={breakdown.spent.variable} />
                </td>
              </tr>
              {breakdown.planned.annual > 0 && (
                <tr>
                  <td>Provision dépenses annuelles</td>
                  <td>
                    <Money cents={breakdown.planned.annual} />
                  </td>
                  <td className="muted">–</td>
                </tr>
              )}
              <tr>
                <td>
                  Hors budget{' '}
                  {breakdown.spent.horsBudget > 0 && (
                    <button className="linkish" onClick={() => showGroup('horsBudget', 'Hors budget')}>
                      (voir)
                    </button>
                  )}
                </td>
                <td className="muted">–</td>
                <td>
                  <Money cents={breakdown.spent.horsBudget} />
                </td>
              </tr>
              <tr>
                <td>
                  À classer{' '}
                  {breakdown.spent.aClasser > 0 && (
                    <button className="linkish" onClick={() => showGroup('aClasser', 'À classer')}>
                      (voir)
                    </button>
                  )}
                </td>
                <td className="muted">–</td>
                <td>
                  <Money cents={breakdown.spent.aClasser} />
                </td>
              </tr>
              <tr className="total">
                <td>Total</td>
                <td>
                  <Money cents={plannedSpend} />
                </td>
                <td>
                  <Money cents={spentSoFar} />
                </td>
              </tr>
            </tbody>
          </table>
          <p className="muted">
            L'épargne et les virements entre tes comptes ne comptent pas comme des dépenses. Une dépense dont la catégorie n'a pas
            de ligne de budget compte en « hors budget » : ajoute une ligne dans Budget si elle revient tous les mois.
          </p>
          <table className="table breakdown">
            <thead>
              <tr>
                <th colSpan={2}>Prévision le jour de ta paie</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Revenus de la période</td>
                <td>
                  <Money cents={fc.income} />
                </td>
              </tr>
              <tr>
                <td>Dépenses déjà faites</td>
                <td>
                  <Money cents={-spentSoFar} />
                </td>
              </tr>
              {savedSoFar > 0 && (
                <tr>
                  <td>Épargne et investissements versés</td>
                  <td>
                    <Money cents={-savedSoFar} />
                  </td>
                </tr>
              )}
              <tr>
                <td>Prélèvements habituels encore à venir</td>
                <td>
                  <Money cents={-fc.upcoming} />
                </td>
              </tr>
              <tr>
                <td>Dépenses courantes d'ici la paie (au rythme de tes budgets variables)</td>
                <td>
                  <Money cents={-fc.variablePace} />
                </td>
              </tr>
              <tr className="total">
                <td>Il devrait te rester</td>
                <td>
                  <Money cents={fc.income - spentSoFar - savedSoFar - fc.upcoming - fc.variablePace} />
                </td>
              </tr>
            </tbody>
          </table>
        </details>
      </div>

      <div className="grid2">
        <div className="card">
          <h2>Rythme de dépenses</h2>
          <Legend items={[{ label: 'Dépensé' }, { label: 'Prévu, réparti sur la période', dashed: true }]} />
          <PaceChart points={pace} />
        </div>
        <div className="card">
          <h2>Où va ton argent</h2>
          {byCategory.length ? (
            <CategoryBars rows={byCategory} onSelect={(r) => showRoot(r.categoryId, r.name)} />
          ) : (
            <p className="muted small">Aucune dépense sur cette période pour l'instant.</p>
          )}
        </div>
      </div>

      {history.some((h) => h.spent > 0) && (
        <div className="card">
          <h2>Tes dernières périodes</h2>
          <Legend items={[{ label: 'Dépensé (période en cours en clair)' }, { label: 'Prévu', soft: true }]} />
          <HistoryBars rows={history} />
        </div>
      )}

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

      {detail && (
        <TransactionsSheet
          title={detail.title}
          subtitle={`Période ${periodLabel(period)}`}
          rows={periodSpendingRows(data, period, detail.keep)}
          onClose={() => setDetail(null)}
        />
      )}

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
