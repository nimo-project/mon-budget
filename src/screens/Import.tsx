import { useState } from 'react'
import { Link } from 'react-router-dom'
import { formatDate, formatMoney } from '../domain/util'
import { importRows, type ImportStats } from '../import/importRows'
import { applyMapping, parseStatement, type ColumnMapping, type ParsedRow, type ParseResult } from '../import/parse'
import { useStore } from '../state/store'
import { AccountSelect, PageHead } from '../ui/fields'

const BANK_NAMES = { boursobank: 'Boursobank', sg: 'SG', revolut: 'Revolut' } as const

export function ImportScreen() {
  const { data, update } = useStore()
  const accounts = data.accounts.filter((a) => !a.archived && a.kind !== 'investissement')
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '')
  const [fileName, setFileName] = useState('')
  const [parsed, setParsed] = useState<ParseResult | null>(null)
  const [rows, setRows] = useState<ParsedRow[] | null>(null)
  const [stats, setStats] = useState<ImportStats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const account = data.accounts.find((a) => a.id === accountId)

  if (!accounts.length)
    return (
      <div>
        <PageHead title="Importer un relevé" />
        <div className="card">
          <p>Commence par ajouter tes comptes (Boursobank, SG, Revolut, épargne).</p>
          <Link className="btn primary" to="/reglages">
            Ajouter mes comptes
          </Link>
        </div>
      </div>
    )

  const onFile = async (file: File) => {
    setError(null)
    setStats(null)
    setFileName(file.name)
    const result = parseStatement(file.name, await file.arrayBuffer())
    setParsed(result)
    setRows(result.mapping || !result.table ? result.rows : null)
    if (!result.table && !result.rows.length) setError('Aucune opération trouvée dans ce fichier.')
    // Choix automatique du compte d'après la banque reconnue.
    if (result.bank) {
      const match = accounts.find((a) => a.bank === result.bank && a.kind === 'courant')
      if (match) setAccountId(match.id)
    }
  }

  const doImport = () => {
    if (!rows) return
    let result: ImportStats | null = null
    update((d) => {
      const out = importRows(d, accountId, rows)
      result = out.stats
      return out.data
    })
    setStats(result)
    setParsed(null)
    setRows(null)
  }

  const reset = () => {
    setParsed(null)
    setRows(null)
    setStats(null)
    setFileName('')
  }

  return (
    <div className="stack">
      <PageHead title="Importer un relevé" />

      {stats ? (
        <div className="card stack">
          <h2>Import terminé</h2>
          <ul>
            <li>{stats.added} opérations ajoutées</li>
            {stats.duplicates > 0 && <li>{stats.duplicates} déjà présentes, ignorées</li>}
            {stats.categorized > 0 && <li>{stats.categorized} classées automatiquement par tes règles</li>}
            {stats.transfers > 0 && <li>{stats.transfers} virements entre tes comptes reconnus</li>}
            {stats.matchedManual > 0 && <li>{stats.matchedManual} saisies manuelles rapprochées</li>}
            {stats.priceAlerts > 0 && <li>{stats.priceAlerts} abonnements avec un nouveau prix</li>}
          </ul>
          <div className="row">
            {stats.toReview > 0 && (
              <Link className="btn primary" to="/operations">
                Vérifier {stats.toReview} opération{stats.toReview > 1 ? 's' : ''}
              </Link>
            )}
            <button className="btn" onClick={reset}>
              Importer un autre fichier
            </button>
          </div>
        </div>
      ) : (
        <div className="card stack">
          <p className="muted small">
            Exporte le relevé depuis l'espace en ligne de ta banque, au format CSV ou OFX, puis choisis le fichier. Tu peux
            réimporter une période déjà importée : les doublons sont ignorés.
          </p>
          <label>
            Fichier du relevé
            <input type="file" accept=".csv,.ofx,.qfx,.txt" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          </label>
          <label>
            Compte concerné
            <AccountSelect accounts={accounts} value={accountId} onChange={setAccountId} />
          </label>
          {parsed?.bank && account && account.bank !== parsed.bank && (
            <p className="error">
              Ce fichier ressemble à un relevé {BANK_NAMES[parsed.bank]}, mais le compte choisi est {account.name}.
            </p>
          )}
          {error && <p className="error">{error}</p>}
        </div>
      )}

      {parsed?.table && !rows && (
        <ColumnMapper
          table={parsed.table}
          initial={parsed.mapping}
          onDone={(m) => setRows(applyMapping(parsed.table!, m).rows)}
        />
      )}

      {rows && !stats && (
        <div className="card stack">
          <h2>Aperçu de {fileName}</h2>
          {rows.length ? (
            <>
              <p>
                {rows.length} opérations du {formatDate(rows.reduce((m, r) => (r.date < m ? r.date : m), rows[0].date))} au{' '}
                {formatDate(rows.reduce((m, r) => (r.date > m ? r.date : m), rows[0].date))}
                {parsed?.skipped ? `, ${parsed.skipped} lignes ignorées (en attente ou illisibles)` : ''}.
              </p>
              <div className="scroll-x">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Libellé</th>
                      <th style={{ textAlign: 'right' }}>Montant</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 8).map((r, i) => (
                      <tr key={i}>
                        <td className="num">{formatDate(r.date)}</td>
                        <td>{r.label}</td>
                        <td className="num" style={{ textAlign: 'right' }}>
                          {formatMoney(r.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="row end">
                <button className="btn" onClick={reset}>
                  Annuler
                </button>
                {parsed?.table && (
                  <button className="btn" onClick={() => setRows(null)}>
                    Corriger les colonnes
                  </button>
                )}
                <button className="btn primary" onClick={doImport}>
                  Importer dans {account?.name}
                </button>
              </div>
            </>
          ) : (
            <p className="error">Aucune ligne lisible avec ces colonnes.</p>
          )}
        </div>
      )}
    </div>
  )
}

/** Choix manuel des colonnes quand le format du fichier n'est pas reconnu. */
function ColumnMapper({
  table,
  initial,
  onDone,
}: {
  table: string[][]
  initial?: ColumnMapping
  onDone: (m: ColumnMapping) => void
}) {
  const [m, setM] = useState<ColumnMapping>(initial ?? { headerRow: 0, date: 0, label: 1, amount: 2 })
  const [split, setSplit] = useState(initial ? initial.amount === undefined : false)
  const header = table[m.headerRow] ?? []
  const cols = header.map((h, i) => ({ i, name: h || `Colonne ${i + 1}` }))
  const sel = (key: keyof ColumnMapping, optional = false) => (
    <select
      value={m[key] ?? ''}
      onChange={(e) => setM({ ...m, [key]: e.target.value === '' ? undefined : Number(e.target.value) })}
    >
      {optional && <option value="">Aucune</option>}
      {cols.map((c) => (
        <option key={c.i} value={c.i}>
          {c.name}
        </option>
      ))}
    </select>
  )

  return (
    <div className="card stack">
      <h2>Indique les colonnes du fichier</h2>
      <p className="muted small">
        Le format n'a pas été reconnu automatiquement. Choisis la ligne de titres et les colonnes utiles.
      </p>
      <div className="scroll-x">
        <table className="table">
          <tbody>
            {table.slice(0, 8).map((row, r) => (
              <tr
                key={r}
                onClick={() => setM({ ...m, headerRow: r })}
                style={{ cursor: 'pointer', fontWeight: r === m.headerRow ? 700 : 400 }}
              >
                {row.map((c, i) => (
                  <td key={i}>{c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small muted">Ligne de titres : touche la ligne correspondante dans le tableau (en gras).</p>
      <div className="grid2">
        <label>Date {sel('date')}</label>
        <label>Libellé {sel('label')}</label>
        <label>Détail (facultatif) {sel('detail', true)}</label>
        <label className="inline">
          <input
            type="checkbox"
            checked={split}
            onChange={(e) => {
              setSplit(e.target.checked)
              setM(
                e.target.checked
                  ? { ...m, amount: undefined, debit: 0, credit: 0 }
                  : { ...m, amount: 0, debit: undefined, credit: undefined },
              )
            }}
          />
          Débit et crédit dans deux colonnes
        </label>
        {split ? (
          <>
            <label>Débit {sel('debit')}</label>
            <label>Crédit {sel('credit')}</label>
          </>
        ) : (
          <label>Montant {sel('amount')}</label>
        )}
      </div>
      <div className="row end">
        <button className="btn primary" onClick={() => onDone(m)}>
          Voir l'aperçu
        </button>
      </div>
    </div>
  )
}
