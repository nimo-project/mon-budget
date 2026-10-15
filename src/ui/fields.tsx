import { useId, useState, type ReactNode } from 'react'
import { orderedCategories } from '../domain/categories'
import type { Account, Category, CategoryKind } from '../domain/types'
import { formatMoney, parseMoney } from '../domain/util'

export function CategorySelect({
  categories,
  value,
  onChange,
  kinds,
  allowEmpty = 'À classer',
  id,
}: {
  categories: Category[]
  value: string | undefined
  onChange: (id: string | undefined) => void
  kinds?: CategoryKind[]
  allowEmpty?: string | false
  id?: string
}) {
  const list = orderedCategories(categories).filter((c) => !kinds || kinds.includes(c.kind))
  return (
    <select id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value || undefined)}>
      {allowEmpty !== false && <option value="">{allowEmpty}</option>}
      {list.map((c) => (
        <option key={c.id} value={c.id}>
          {c.parentId ? '   ' + c.name : c.name}
        </option>
      ))}
    </select>
  )
}

export function AccountSelect({
  accounts,
  value,
  onChange,
  filter,
}: {
  accounts: Account[]
  value: string
  onChange: (id: string) => void
  filter?: (a: Account) => boolean
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {accounts
        .filter((a) => !a.archived && (!filter || filter(a)))
        .map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
    </select>
  )
}

/** Saisie d'un montant en euros ; renvoie des centimes (ou null si vide / illisible). */
export function MoneyInput({
  value,
  onChange,
  className,
  autoFocus,
  placeholder = '0,00',
  id,
}: {
  value: number | null
  onChange: (cents: number | null) => void
  className?: string
  autoFocus?: boolean
  placeholder?: string
  id?: string
}) {
  const [text, setText] = useState(value === null ? '' : (value / 100).toFixed(2).replace('.', ','))
  return (
    <input
      id={id}
      className={className}
      inputMode="decimal"
      autoFocus={autoFocus}
      placeholder={placeholder}
      value={text}
      onChange={(e) => {
        setText(e.target.value)
        onChange(e.target.value.trim() ? parseMoney(e.target.value) : null)
      }}
    />
  )
}

export function Money({ cents, signed = false, className = '' }: { cents: number; signed?: boolean; className?: string }) {
  const cls = signed ? (cents > 0 ? 'pos' : 'neg') : ''
  return (
    <span className={`num ${cls} ${className}`}>
      {signed && cents > 0 ? '+' : ''}
      {formatMoney(cents)}
    </span>
  )
}

export function ProgressBar({ pct, state }: { pct: number; state?: 'ok' | 'alerte' | 'depasse' }) {
  const cls = state === 'depasse' ? 'over' : state === 'alerte' ? 'alert' : ''
  return (
    <div className={`bar ${cls}`} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
    </div>
  )
}

export function TagInput({ tags, onChange, suggestions }: { tags: string[]; onChange: (t: string[]) => void; suggestions: string[] }) {
  const [text, setText] = useState('')
  const add = (t: string) => {
    const v = t.trim()
    if (v && !tags.includes(v)) onChange([...tags, v])
    setText('')
  }
  const listId = useId()
  return (
    <div>
      <div className="chips" style={{ marginBottom: tags.length ? '0.5rem' : 0 }}>
        {tags.map((t) => (
          <button type="button" key={t} className="chip active" onClick={() => onChange(tags.filter((x) => x !== t))}>
            {t} ×
          </button>
        ))}
      </div>
      <input
        list={listId}
        value={text}
        placeholder="Ajouter une étiquette"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault()
            add(text)
          }
        }}
        onBlur={() => text && add(text)}
      />
      <datalist id={listId}>
        {suggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </div>
  )
}

export function PageHead({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="page-head">
      <h1>{title}</h1>
      {children && <div className="row">{children}</div>}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>
}
