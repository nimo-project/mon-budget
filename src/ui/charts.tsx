// Graphiques de l'accueil, en SVG simple (pas de bibliothèque : l'app reste légère).
// Couleurs : --accent pour le réel, --muted en pointillé pour le prévu (repère, toujours étiqueté).
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { CategorySpend, PacePoint, PeriodSpend } from '../domain/charts'
import { periodKey, periodLabel } from '../domain/periods'
import { formatMoney } from '../domain/util'

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, width] as const
}

/** Montant court pour les axes : 1 200 €, 12 k€. */
function short(cents: number): string {
  const e = Math.round(cents / 100)
  if (Math.abs(e) >= 10000) return `${Math.round(e / 1000)} k€`
  return `${e.toLocaleString('fr-FR')} €`
}

function niceMax(v: number): number {
  if (v <= 0) return 10000
  const e = v / 100
  const pow = 10 ** Math.floor(Math.log10(e))
  const step = [1, 2, 2.5, 5, 10].find((s) => s * pow >= e / 1) ?? 10
  return step * pow * 100
}

const dayLabel = (d: string) => `${Number(d.slice(8))}/${d.slice(5, 7)}`

export function Legend({ items }: { items: { label: string; dashed?: boolean; soft?: boolean }[] }) {
  return (
    <div className="chart-legend">
      {items.map((i) => (
        <span key={i.label}>
          <span className={`swatch${i.dashed ? ' dashed' : ''}${i.soft ? ' soft' : ''}`} aria-hidden="true" />
          {i.label}
        </span>
      ))}
    </div>
  )
}

function Tooltip({ x, y, width, children }: { x: number; y: number; width: number; children: ReactNode }) {
  const left = Math.min(Math.max(x, 70), width - 70)
  return (
    <div className="chart-tip" style={{ left, top: y }} role="status">
      {children}
    </div>
  )
}

/** Cumul dépensé sur la période face au rythme régulier du budget. */
export function PaceChart({ points }: { points: PacePoint[] }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const H = 190
  const pad = { l: 44, r: 12, t: 12, b: 24 }
  const w = Math.max(0, width - pad.l - pad.r)
  const h = H - pad.t - pad.b
  const max = niceMax(Math.max(...points.map((p) => Math.max(p.actual ?? 0, p.planned))))
  const x = (i: number) => pad.l + (points.length > 1 ? (i / (points.length - 1)) * w : 0)
  const y = (v: number) => pad.t + h - (v / max) * h
  const path = (vals: (number | undefined)[]) =>
    vals
      .map((v, i) => (v === undefined ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`))
      .filter(Boolean)
      .map((p, i) => (i ? 'L' : 'M') + p)
      .join('')
  const lastActual = points.reduce((acc, p, i) => (p.actual !== undefined ? i : acc), -1)
  const ticks = [0, max / 2, max]

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    const i = Math.round(((e.clientX - box.left) / box.width) * (points.length - 1))
    setHover(Math.min(points.length - 1, Math.max(0, i)))
  }
  const hp = hover !== null ? points[hover] : null

  return (
    <div ref={ref} className="chart">
      {width > 0 && (
        <svg width={width} height={H} role="img" aria-label="Cumul des dépenses de la période comparé au rythme prévu">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={pad.l + w} y1={y(t)} y2={y(t)} className="grid" />
              <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" className="axis">
                {short(t)}
              </text>
            </g>
          ))}
          <text x={pad.l} y={H - 6} className="axis">
            {dayLabel(points[0].date)}
          </text>
          <text x={pad.l + w} y={H - 6} textAnchor="end" className="axis">
            {dayLabel(points[points.length - 1].date)}
          </text>
          <path d={path(points.map((p) => p.planned))} className="line planned" />
          <path d={path(points.map((p) => p.actual))} className="line actual" />
          {lastActual >= 0 && <circle cx={x(lastActual)} cy={y(points[lastActual].actual!)} r={4.5} className="dot actual" />}
          {hp && (
            <>
              <line x1={x(hover!)} x2={x(hover!)} y1={pad.t} y2={pad.t + h} className="crosshair" />
              {hp.actual !== undefined && <circle cx={x(hover!)} cy={y(hp.actual)} r={4} className="dot actual" />}
              <circle cx={x(hover!)} cy={y(hp.planned)} r={4} className="dot planned" />
            </>
          )}
          <rect
            x={pad.l}
            y={0}
            width={w}
            height={H}
            fill="transparent"
            onPointerMove={onMove}
            onPointerDown={onMove}
            onPointerLeave={() => setHover(null)}
          />
        </svg>
      )}
      {hp && (
        <Tooltip x={x(hover!)} y={8} width={width}>
          <strong>{dayLabel(hp.date)}</strong>
          {hp.actual !== undefined && <div>Dépensé {formatMoney(hp.actual)}</div>}
          <div className="muted">Prévu à cette date {formatMoney(hp.planned)}</div>
        </Tooltip>
      )}
    </div>
  )
}

/** Où va l'argent : une barre par grande catégorie, valeur et part du total affichées. */
export function CategoryBars({ rows, onSelect }: { rows: CategorySpend[]; onSelect: (row: CategorySpend) => void }) {
  const max = Math.max(...rows.map((r) => r.amount), 1)
  const total = rows.reduce((s, r) => s + r.amount, 0)
  return (
    <ul className="hbars">
      {rows.map((r) => (
        <li key={r.categoryId}>
          <button className="hbar" disabled={r.categoryId === 'autres'} onClick={() => onSelect(r)}>
            <span className="hbar-label">{r.name}</span>
            <span className="hbar-track">
              <span className="hbar-fill" style={{ width: `${Math.max(2, (r.amount / max) * 100)}%` }} />
            </span>
            <span className="hbar-value">
              {formatMoney(r.amount)} <span className="muted">{Math.round((r.amount / total) * 100)} %</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']

/** Dépensé par période (barres) et prévu (trait), la période en cours en plus clair. */
export function HistoryBars({ rows }: { rows: PeriodSpend[] }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const H = 170
  const pad = { l: 44, r: 8, t: 12, b: 24 }
  const w = Math.max(0, width - pad.l - pad.r)
  const h = H - pad.t - pad.b
  const max = niceMax(Math.max(...rows.map((r) => Math.max(r.spent, r.planned))))
  const slot = rows.length ? w / rows.length : 0
  const bw = Math.min(36, slot * 0.55)
  const y = (v: number) => pad.t + h - (v / max) * h
  const cx = (i: number) => pad.l + slot * i + slot / 2
  const hr = hover !== null ? rows[hover] : null
  return (
    <div ref={ref} className="chart">
      {width > 0 && (
        <svg width={width} height={H} role="img" aria-label="Dépenses des dernières périodes comparées au prévu">
          {[0, max / 2, max].map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={pad.l + w} y1={y(t)} y2={y(t)} className="grid" />
              <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" className="axis">
                {short(t)}
              </text>
            </g>
          ))}
          {rows.map((r, i) => {
            const current = i === rows.length - 1
            const top = y(r.spent)
            const bh = Math.max(0, pad.t + h - top)
            return (
              <g
                key={r.period.start}
                onPointerEnter={() => setHover(i)}
                onPointerLeave={() => setHover(null)}
                onPointerDown={() => setHover(i)}
              >
                <rect x={pad.l + slot * i} y={pad.t} width={slot} height={h} fill="transparent" />
                {bh > 0 && (
                  <path
                    d={`M${cx(i) - bw / 2},${pad.t + h}V${top + Math.min(4, bh)}q0,-${Math.min(4, bh)} ${Math.min(4, bh)},-${Math.min(4, bh)}H${cx(i) + bw / 2 - Math.min(4, bh)}q${Math.min(4, bh)},0 ${Math.min(4, bh)},${Math.min(4, bh)}V${pad.t + h}Z`}
                    className={`bar${current ? ' current' : ''}${hover === i ? ' hover' : ''}`}
                  />
                )}
                {r.planned > 0 && (
                  <line x1={cx(i) - bw / 2 - 4} x2={cx(i) + bw / 2 + 4} y1={y(r.planned)} y2={y(r.planned)} className="target" />
                )}
                <text x={cx(i)} y={H - 6} textAnchor="middle" className="axis">
                  {MONTHS[Number(periodKey(r.period).slice(5)) - 1]}
                </text>
              </g>
            )
          })}
        </svg>
      )}
      {hr && (
        <Tooltip x={cx(hover!)} y={8} width={width}>
          <strong>Période {periodLabel(hr.period)}</strong>
          <div>Dépensé {formatMoney(hr.spent)}</div>
          <div className="muted">Prévu {formatMoney(hr.planned)}</div>
        </Tooltip>
      )}
    </div>
  )
}
