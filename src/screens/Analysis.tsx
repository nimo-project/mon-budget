import { useState } from 'react'
import { categoryLabel, categoryMap, orderedCategories } from '../domain/categories'
import { analyze, categoryTrend, netWorth, periodReview, recurringDebits, subscriptions, type Insight } from '../domain/insights'
import { currentPeriod, nextPeriod, periodLabel, previousPeriod, type Period } from '../domain/periods'
import { formatDate, formatMoney, formatMonth, sum, today } from '../domain/util'
import { useStore } from '../state/store'
import { Money, PageHead } from '../ui/fields'

type Tab = 'analyse' | 'bilan' | 'tendances' | 'abonnements' | 'calendrier' | 'patrimoine'

export function AnalysisScreen() {
  const [tab, setTab] = useState<Tab>('analyse')
  const tabs: [Tab, string][] = [
    ['analyse', 'Analyse'],
    ['bilan', 'Bilan'],
    ['tendances', 'Tendances'],
    ['abonnements', 'Abonnements'],
    ['calendrier', 'Prélèvements'],
    ['patrimoine', 'Patrimoine'],
  ]
  return (
    <div>
      <PageHead title="Analyse" />
      <div className="tabs" role="tablist">
        {tabs.map(([id, label]) => (
          <button key={id} role="tab" className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'analyse' && <Analyze />}
      {tab === 'bilan' && <Review />}
      {tab === 'tendances' && <Trends />}
      {tab === 'abonnements' && <Subscriptions />}
      {tab === 'calendrier' && <Calendar />}
      {tab === 'patrimoine' && <NetWorth />}
    </div>
  )
}

function Analyze() {
  const { data } = useStore()
  const [insights, setInsights] = useState<Insight[] | null>(null)
  return (
    <div className="stack">
      <div className="card stack">
        <p className="small muted" style={{ margin: 0 }}>
          L'analyse compare tes dépenses à ton budget, à ton historique et au repère 50/30/20. Elle est calculée sur ton appareil
          : aucune donnée n'est envoyée.
        </p>
        <button className="btn primary" onClick={() => setInsights(analyze(data))}>
          Analyser mes dépenses
        </button>
      </div>
      {insights && (
        <div className="stack">
          {insights.map((i, n) => (
            <div key={n} className={`card ${i.level === 'alerte' ? 'warn' : ''}`}>
              <span className={`badge ${i.level === 'alerte' ? 'danger' : i.level === 'attention' ? 'warn' : 'accent'}`}>
                {i.level === 'alerte' ? 'À revoir' : i.level === 'attention' ? 'À surveiller' : 'Info'}
              </span>
              <p style={{ margin: '0.4rem 0 0' }}>{i.text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Review() {
  const { data } = useStore()
  const [period, setPeriod] = useState<Period>(() => previousPeriod(currentPeriod(data), data))
  const r = periodReview(data, period)
  const isCurrent = period.start === currentPeriod(data).start
  return (
    <div className="stack">
      <div className="row between">
        <button className="btn small" onClick={() => setPeriod(previousPeriod(period, data))}>
          ← Précédente
        </button>
        <strong className="small">{periodLabel(period)}</strong>
        <button className="btn small" disabled={isCurrent} onClick={() => setPeriod(nextPeriod(period, data))}>
          Suivante →
        </button>
      </div>
      <div className="card grid2">
        <div>
          <div className="muted small">Revenus</div>
          <Money cents={r.summary.income} />
        </div>
        <div>
          <div className="muted small">Dépensé</div>
          <Money cents={r.summary.actualOut} />
        </div>
        <div>
          <div className="muted small">Épargné et investi</div>
          <Money cents={r.saved} />
        </div>
        <div>
          <div className="muted small">Prévu</div>
          <Money cents={r.summary.plannedOut} />
        </div>
      </div>
      <div className="card">
        <h2>Enveloppes dépassées</h2>
        {r.overspent.length ? (
          <ul className="list">
            {r.overspent.map((o) => (
              <li key={o.name} className="row between">
                <span>{o.name}</span>
                <span className="over num">+{formatMoney(o.over)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">Aucune, bravo.</p>
        )}
      </div>
      <div className="card">
        <h2>Par rapport à la moyenne des 3 périodes précédentes</h2>
        <div className="scroll-x">
          <table className="table">
            <thead>
              <tr>
                <th>Catégorie</th>
                <th style={{ textAlign: 'right' }}>Cette période</th>
                <th style={{ textAlign: 'right' }}>Moyenne</th>
                <th style={{ textAlign: 'right' }}>Écart</th>
              </tr>
            </thead>
            <tbody>
              {r.vsAverage
                .sort((a, b) => b.amount - a.amount)
                .map((c) => {
                  const diff = c.amount - c.average
                  return (
                    <tr key={c.name}>
                      <td>{c.name}</td>
                      <td className="num" style={{ textAlign: 'right' }}>
                        {formatMoney(c.amount)}
                      </td>
                      <td className="num muted" style={{ textAlign: 'right' }}>
                        {formatMoney(c.average)}
                      </td>
                      <td className={`num ${diff > 0 ? 'over' : 'pos'}`} style={{ textAlign: 'right' }}>
                        {diff > 0 ? '+' : ''}
                        {formatMoney(diff)}
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function Bars({ points }: { points: { label: string; value: number; title: string }[] }) {
  const max = Math.max(1, ...points.map((p) => p.value))
  const w = 100 / points.length
  return (
    <svg
      viewBox="0 0 100 60"
      style={{ width: '100%', height: 220 }}
      role="img"
      preserveAspectRatio="none"
      aria-label="Graphique en barres"
    >
      {points.map((p, i) => {
        const h = (p.value / max) * 48
        return (
          <g key={i}>
            <title>{p.title}</title>
            <rect x={i * w + w * 0.15} y={50 - h} width={w * 0.7} height={Math.max(h, 0.3)} rx={0.8} fill="var(--accent)" />
          </g>
        )
      })}
      <line x1="0" y1="50" x2="100" y2="50" stroke="var(--border)" strokeWidth="0.3" />
    </svg>
  )
}

function Trends() {
  const { data } = useStore()
  const roots = orderedCategories(data.categories).filter((c) => c.kind === 'depense')
  const [categoryId, setCategoryId] = useState(roots[0]?.id ?? '')
  const map = categoryMap(data.categories)
  const points = categoryId ? categoryTrend(data, categoryId, 12) : []
  const avg = points.length ? Math.round(sum(points, (p) => p.amount) / points.length) : 0
  return (
    <div className="stack">
      <label>
        Catégorie
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          {roots.map((c) => (
            <option key={c.id} value={c.id}>
              {c.parentId ? '   ' + c.name : c.name}
            </option>
          ))}
        </select>
      </label>
      <div className="card">
        <h2>{categoryLabel(categoryId, map)} sur 12 périodes</h2>
        <p className="small muted">Moyenne : {formatMoney(avg)} par période</p>
        <Bars
          points={points.map((p) => ({
            label: formatMonth(p.period.start),
            value: Math.max(0, p.amount),
            title: `${periodLabel(p.period)} : ${formatMoney(p.amount)}`,
          }))}
        />
        <div className="row between small muted">
          <span>{points[0] && formatMonth(points[0].period.start)}</span>
          <span>{points.length > 0 && formatMonth(points[points.length - 1].period.start)}</span>
        </div>
      </div>
    </div>
  )
}

function Subscriptions() {
  const { data } = useStore()
  const map = categoryMap(data.categories)
  const subs = subscriptions(data)
  return (
    <div className="card">
      <div className="row between">
        <h2 style={{ margin: 0 }}>{subs.length} abonnements</h2>
        <span>
          <Money cents={sum(subs, (s) => s.yearlyCost)} /> <span className="small muted">par an</span>
        </span>
      </div>
      <p className="small muted">Détectés à partir des prélèvements qui reviennent chaque mois au même montant.</p>
      <ul className="list">
        {subs.map((s) => (
          <li key={s.key}>
            <div className="row between">
              <span>{s.label}</span>
              <Money cents={s.amount} />
            </div>
            <div className="small muted">
              {categoryLabel(s.categoryId, map)} · {formatMoney(s.yearlyCost)} par an · prochain le {formatDate(s.nextDate)}
            </div>
          </li>
        ))}
      </ul>
      {!subs.length && <p className="muted">Aucun abonnement détecté pour l'instant (il faut au moins 2 mois de relevés).</p>}
    </div>
  )
}

function Calendar() {
  const { data } = useStore()
  const items = recurringDebits(data).filter((r) => r.nextDate >= today())
  return (
    <div className="card">
      <h2>Prélèvements attendus</h2>
      <ul className="list">
        {items.map((r) => (
          <li key={r.key} className="row between">
            <span>
              <strong className="num">{formatDate(r.nextDate)}</strong> · {r.label}
            </span>
            <Money cents={-r.amount} />
          </li>
        ))}
      </ul>
      {!items.length && <p className="muted">Rien de prévu, ou pas encore assez d'historique.</p>}
    </div>
  )
}

function NetWorth() {
  const { data } = useStore()
  const points = netWorth(data, 12)
  const max = Math.max(1, ...points.map((p) => p.current + p.savings))
  const min = Math.min(0, ...points.map((p) => p.current + p.savings))
  const y = (v: number) => 50 - ((v - min) / (max - min || 1)) * 46
  const x = (i: number) => (points.length > 1 ? (i / (points.length - 1)) * 100 : 50)
  const path = (f: (p: (typeof points)[number]) => number) => points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(f(p))}`).join(' ')
  const last = points[points.length - 1]
  return (
    <div className="card">
      <h2>Patrimoine (comptes et épargne)</h2>
      <p>
        <Money cents={last.current + last.savings} /> aujourd'hui, dont <Money cents={last.savings} /> d'épargne.
      </p>
      <svg
        viewBox="0 0 100 52"
        style={{ width: '100%', height: 220 }}
        preserveAspectRatio="none"
        role="img"
        aria-label="Évolution du patrimoine"
      >
        <path
          d={path((p) => p.current + p.savings)}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="0.8"
          vectorEffect="non-scaling-stroke"
        />
        <path d={path((p) => p.savings)} fill="none" stroke="var(--gold)" strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="row between small muted">
        <span>{formatMonth(points[0].date)}</span>
        <span>{formatMonth(last.date)}</span>
      </div>
      <div className="row small" style={{ gap: '1rem', marginTop: '0.5rem' }}>
        <span style={{ color: 'var(--accent)' }}>━ Total</span>
        <span style={{ color: 'var(--gold)' }}>━ Épargne</span>
      </div>
      <p className="small muted">Hors investissements (seuls leurs versements sont suivis).</p>
    </div>
  )
}
