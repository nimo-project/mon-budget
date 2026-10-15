import { useState } from 'react'
import { applyRulesToReview } from '../domain/actions'
import { categoryLabel, categoryMap, mergeCategory, moveCategory, orderedCategories } from '../domain/categories'
import { download } from '../domain/export'
import type { Account, AccountKind, BankId, Category, CategoryKind } from '../domain/types'
import { formatMoney, today, uid } from '../domain/util'
import { decryptJson, unlockWithPassphrase, type Vault } from '../crypto/vault'
import { useStore } from '../state/store'
import { CategorySelect, Money, MoneyInput, PageHead } from '../ui/fields'
import { Sheet } from '../ui/Sheet'
import { SyncSettings } from './SyncSettings'
import type { AppData } from '../domain/types'

type Tab = 'comptes' | 'categories' | 'regles' | 'securite'

export function SettingsScreen() {
  const [tab, setTab] = useState<Tab>('comptes')
  return (
    <div>
      <PageHead title="Réglages" />
      <div className="tabs" role="tablist">
        {(
          [
            ['comptes', 'Comptes'],
            ['categories', 'Catégories'],
            ['regles', 'Règles'],
            ['securite', 'Sécurité et sauvegarde'],
          ] as const
        ).map(([id, label]) => (
          <button key={id} role="tab" className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'comptes' && <Accounts />}
      {tab === 'categories' && <Categories />}
      {tab === 'regles' && <Rules />}
      {tab === 'securite' && <Security />}
    </div>
  )
}

const BANKS: [BankId, string][] = [
  ['boursobank', 'Boursobank'],
  ['sg', 'SG'],
  ['revolut', 'Revolut'],
  ['autre', 'Autre'],
]
const KINDS: [AccountKind, string][] = [
  ['courant', 'Compte courant'],
  ['epargne', 'Compte épargne'],
]

function Accounts() {
  const { data, update } = useStore()
  const [editing, setEditing] = useState<Account | null>(null)
  const map = categoryMap(data.categories)
  const blank: Account = { id: '', name: '', bank: 'boursobank', kind: 'courant', openingBalance: 0 }

  return (
    <div className="stack">
      <div className="card">
        {data.accounts.length === 0 && <p className="muted">Aucun compte. Ajoute Boursobank, SG, Revolut et ton compte épargne.</p>}
        <ul className="list">
          {data.accounts.map((a) => (
            <li key={a.id}>
              <button className="item" onClick={() => setEditing(a)}>
                <div className="grow">
                  <strong>{a.name}</strong> {a.archived && <span className="badge">archivé</span>}
                  <div className="muted small">
                    {KINDS.find((k) => k[0] === a.kind)?.[1]}
                    {a.isSalaryAccount && ' · reçoit le salaire'}
                    {a.purposeCategoryId && ` · enveloppe ${categoryLabel(a.purposeCategoryId, map)}`}
                  </div>
                </div>
                <span className="small muted">Modifier</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <button className="btn primary" onClick={() => setEditing(blank)}>
        Ajouter un compte
      </button>
      {editing && (
        <AccountForm
          account={editing}
          onClose={() => setEditing(null)}
          onSave={(a) => {
            update((d) => {
              const saved = a.id ? a : { ...a, id: uid() }
              let accounts = a.id ? d.accounts.map((x) => (x.id === a.id ? saved : x)) : [...d.accounts, saved]
              // Un seul compte reçoit le salaire.
              if (saved.isSalaryAccount) accounts = accounts.map((x) => ({ ...x, isSalaryAccount: x.id === saved.id }))
              return { ...d, accounts }
            })
            setEditing(null)
          }}
        />
      )}
      <p className="small muted">
        Les investissements (PEA, assurance-vie…) ne sont pas des comptes ici : leurs versements sont suivis par catégorie, dans
        Épargne.
      </p>
      <p className="small muted">Solde actuel calculé = solde de départ + opérations suivies.</p>
    </div>
  )
}

function AccountForm({ account, onClose, onSave }: { account: Account; onClose: () => void; onSave: (a: Account) => void }) {
  const { data } = useStore()
  const [a, setA] = useState(account)
  return (
    <Sheet title={account.id ? 'Modifier le compte' : 'Nouveau compte'} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (a.name.trim()) onSave({ ...a, name: a.name.trim() })
        }}
      >
        <label>
          Nom
          <input value={a.name} onChange={(e) => setA({ ...a, name: e.target.value })} placeholder="Ex. Revolut" autoFocus />
        </label>
        <div className="grid2">
          <label>
            Banque
            <select value={a.bank} onChange={(e) => setA({ ...a, bank: e.target.value as BankId })}>
              {BANKS.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Type
            <select value={a.kind} onChange={(e) => setA({ ...a, kind: e.target.value as AccountKind })}>
              {KINDS.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Solde de départ (€), avant la première opération importée
          <MoneyInput value={a.openingBalance} onChange={(v) => setA({ ...a, openingBalance: v ?? 0 })} />
        </label>
        {a.kind === 'courant' && (
          <>
            <label>
              Vocation du compte (catégorie par défaut de ses dépenses)
              <CategorySelect
                categories={data.categories}
                kinds={['depense']}
                value={a.purposeCategoryId}
                onChange={(id) => setA({ ...a, purposeCategoryId: id })}
                allowEmpty="Aucune (compte principal)"
              />
            </label>
            <label className="inline">
              <input
                type="checkbox"
                checked={!!a.isSalaryAccount}
                onChange={(e) => setA({ ...a, isSalaryAccount: e.target.checked })}
              />
              Mon salaire arrive sur ce compte
            </label>
          </>
        )}
        {account.id && (
          <label className="inline">
            <input type="checkbox" checked={!!a.archived} onChange={(e) => setA({ ...a, archived: e.target.checked })} />
            Archiver (compte fermé)
          </label>
        )}
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

const KIND_LABEL: Record<CategoryKind, string> = {
  depense: 'Dépense',
  revenu: 'Revenu',
  epargne: 'Épargne',
  investissement: 'Investissement',
}

function Categories() {
  const { data, update } = useStore()
  const [editing, setEditing] = useState<Category | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const list = orderedCategories(data.categories, showArchived)
  const counts = new Map<string, number>()
  for (const t of data.transactions) if (t.categoryId) counts.set(t.categoryId, (counts.get(t.categoryId) ?? 0) + 1)

  return (
    <div className="stack">
      <div className="row between">
        <button className="btn primary" onClick={() => setEditing({ id: '', name: '', kind: 'depense' })}>
          Ajouter une catégorie
        </button>
        <label className="inline small">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Afficher les archivées
        </label>
      </div>
      <div className="card">
        <ul className="list">
          {list.map((c) => (
            <li key={c.id} style={{ paddingLeft: c.parentId ? '1.25rem' : 0 }}>
              <button className="item" onClick={() => setEditing(c)}>
                <span className="grow">
                  {c.parentId ? c.name : <strong>{c.name}</strong>}
                  {c.archived && <span className="badge"> archivée</span>}
                  {c.isSalary && <span className="badge accent"> salaire</span>}
                </span>
                <span className="small muted">
                  {!c.parentId && KIND_LABEL[c.kind] + ' · '}
                  {counts.get(c.id) ?? 0} op.
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      {editing && (
        <CategoryForm
          category={editing}
          onClose={() => setEditing(null)}
          onSave={(c, mergeInto) => {
            update((d) => {
              if (mergeInto) return mergeCategory(d, c.id, mergeInto)
              if (!c.id) return { ...d, categories: [...d.categories, { ...c, id: uid() }] }
              const moved = moveCategory(d, c.id, c.parentId)
              return { ...moved, categories: moved.categories.map((x) => (x.id === c.id ? { ...c, parentId: x.parentId } : x)) }
            })
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}

function CategoryForm({
  category,
  onClose,
  onSave,
}: {
  category: Category
  onClose: () => void
  onSave: (c: Category, mergeInto?: string) => void
}) {
  const { data } = useStore()
  const [c, setC] = useState(category)
  const [mergeInto, setMergeInto] = useState<string | undefined>()
  const [mergeConfirmed, setMergeConfirmed] = useState(false)
  const parents = data.categories.filter((x) => !x.parentId && x.id !== c.id && !x.archived)
  const hasChildren = data.categories.some((x) => x.parentId === c.id)

  return (
    <Sheet title={category.id ? 'Modifier la catégorie' : 'Nouvelle catégorie'} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (mergeInto) {
            if (mergeConfirmed) onSave(c, mergeInto)
          } else if (c.name.trim()) onSave({ ...c, name: c.name.trim() })
        }}
      >
        <label>
          Nom
          <input value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} autoFocus />
        </label>
        <label>
          Catégorie parente
          <select
            value={c.parentId ?? ''}
            disabled={hasChildren}
            onChange={(e) => {
              const parentId = e.target.value || undefined
              const parent = data.categories.find((x) => x.id === parentId)
              setC({ ...c, parentId, kind: parent?.kind ?? c.kind })
            }}
          >
            <option value="">Aucune (premier niveau)</option>
            {parents.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        {!c.parentId && (
          <label>
            Type
            <select value={c.kind} onChange={(e) => setC({ ...c, kind: e.target.value as CategoryKind })}>
              {Object.entries(KIND_LABEL).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        )}
        {c.kind === 'revenu' && (
          <label className="inline">
            <input type="checkbox" checked={!!c.isSalary} onChange={(e) => setC({ ...c, isSalary: e.target.checked || undefined })} />
            C'est mon salaire (marque le début d'une période)
          </label>
        )}
        {category.id && (
          <>
            <label className="inline">
              <input type="checkbox" checked={!!c.archived} onChange={(e) => setC({ ...c, archived: e.target.checked || undefined })} />
              Archiver (masquée dans les listes, l'historique est conservé)
            </label>
            <label>
              Fusionner dans une autre catégorie
              <CategorySelect
                categories={data.categories.filter((x) => x.id !== c.id)}
                value={mergeInto}
                onChange={setMergeInto}
                allowEmpty="Ne pas fusionner"
              />
            </label>
            {mergeInto && (
              <label className="inline">
                <input type="checkbox" checked={mergeConfirmed} onChange={(e) => setMergeConfirmed(e.target.checked)} />
                Je confirme : opérations, règles et budgets passent dans la catégorie choisie
              </label>
            )}
          </>
        )}
        <div className="row end" style={{ marginTop: '1rem' }}>
          <button type="button" className="btn" onClick={onClose}>
            Annuler
          </button>
          <button className="btn primary" disabled={!!mergeInto && !mergeConfirmed}>
            {mergeInto ? 'Fusionner' : 'Enregistrer'}
          </button>
        </div>
      </form>
    </Sheet>
  )
}

function Rules() {
  const { data, update } = useStore()
  const [filter, setFilter] = useState('')
  const rules = [...data.rules]
    .filter((r) => !filter || r.pattern.includes(filter.toUpperCase()))
    .sort((a, b) => a.pattern.localeCompare(b.pattern) || (a.amount ?? 0) - (b.amount ?? 0))

  return (
    <div className="stack">
      <p className="muted small">
        Chaque correction mémorisée crée une règle. Une règle avec montant ne s'applique qu'à ce montant (à{' '}
        {formatMoney(data.settings.ruleTolerance)} près).
      </p>
      <input type="search" placeholder="Filtrer les règles" value={filter} onChange={(e) => setFilter(e.target.value)} />
      <div className="card">
        {!rules.length && <p className="muted">Aucune règle pour l'instant.</p>}
        <ul className="list">
          {rules.map((r) => (
            <li key={r.id}>
              <div className="row between">
                <div className="grow">
                  <strong>{r.pattern}</strong>{' '}
                  {r.amount !== undefined ? <Money cents={r.amount} /> : <span className="badge">tout montant</span>}
                </div>
                <button
                  className="btn small ghost danger"
                  onClick={() => update((d) => ({ ...d, rules: d.rules.filter((x) => x.id !== r.id) }))}
                >
                  Supprimer
                </button>
              </div>
              <div style={{ marginTop: '0.4rem' }}>
                <CategorySelect
                  categories={data.categories}
                  value={r.categoryId}
                  allowEmpty={false}
                  onChange={(id) =>
                    id &&
                    update((d) => applyRulesToReview({ ...d, rules: d.rules.map((x) => (x.id === r.id ? { ...x, categoryId: id } : x)) }))
                  }
                />
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div className="card grid2">
        <label>
          Tolérance des règles libellé + montant (€)
          <MoneyInput
            value={data.settings.ruleTolerance}
            onChange={(v) => v !== null && update((d) => ({ ...d, settings: { ...d.settings, ruleTolerance: Math.abs(v) } }))}
          />
        </label>
        <label>
          Seuil d'alerte des enveloppes (%)
          <input
            type="number"
            min={50}
            max={100}
            value={data.settings.alertThreshold}
            onChange={(e) => update((d) => ({ ...d, settings: { ...d.settings, alertThreshold: Number(e.target.value) || 80 } }))}
          />
        </label>
      </div>
    </div>
  )
}

function Security() {
  const { setPassphrase, lock, vault, replaceAll } = useStore()
  const [pass, setPass] = useState('')
  const [confirmPass, setConfirmPass] = useState('')
  const [message, setMessage] = useState<string | null>(null)

  const change = async () => {
    if (pass.length < 12) return setMessage('Au moins 12 caractères.')
    if (pass !== confirmPass) return setMessage('Les deux saisies ne correspondent pas.')
    await setPassphrase(pass)
    setPass('')
    setConfirmPass('')
    setMessage('Phrase secrète changée. Ta clé de secours reste valable.')
  }

  const [backupFile, setBackupFile] = useState<File | null>(null)
  const [backupSecret, setBackupSecret] = useState('')
  const [restored, setRestored] = useState<AppData | null>(null)

  const readBackup = async () => {
    if (!backupFile) return
    try {
      const backup = JSON.parse(await backupFile.text()) as Vault
      const key = await unlockWithPassphrase(backup, backupSecret)
      setRestored(await decryptJson<AppData>(key, backup.payload))
      setMessage(null)
    } catch {
      setMessage('Impossible de lire cette sauvegarde : fichier ou phrase secrète incorrects.')
    }
  }

  return (
    <div className="stack">
      <div className="card stack">
        <h2>Phrase secrète</h2>
        <label>
          Nouvelle phrase secrète
          <input type="password" autoComplete="new-password" value={pass} onChange={(e) => setPass(e.target.value)} />
        </label>
        <label>
          Confirmer
          <input type="password" autoComplete="new-password" value={confirmPass} onChange={(e) => setConfirmPass(e.target.value)} />
        </label>
        <div className="row">
          <button className="btn primary" onClick={change}>
            Changer la phrase secrète
          </button>
          <button className="btn" onClick={lock}>
            Verrouiller maintenant
          </button>
        </div>
        {message && <p className="small">{message}</p>}
        <p className="small muted">L'app se verrouille seule après 15 minutes sans activité.</p>
      </div>

      <SyncSettings />

      <div className="card stack">
        <h2>Sauvegarde</h2>
        <p className="small muted">
          Le fichier de sauvegarde est chiffré : il ne s'ouvre qu'avec ta phrase secrète (celle du moment de la sauvegarde) ou ta clé de
          secours.
        </p>
        <div className="row">
          <button
            className="btn"
            disabled={!vault}
            onClick={() => vault && download(`budget-sauvegarde-${today()}.json`, JSON.stringify(vault), 'application/json')}
          >
            Télécharger une sauvegarde chiffrée
          </button>
        </div>
        <h3>Restaurer une sauvegarde</h3>
        <label>
          Fichier de sauvegarde
          <input type="file" accept=".json" onChange={(e) => setBackupFile(e.target.files?.[0] ?? null)} />
        </label>
        <label>
          Phrase secrète de cette sauvegarde
          <input type="password" value={backupSecret} onChange={(e) => setBackupSecret(e.target.value)} />
        </label>
        {!restored ? (
          <button className="btn" disabled={!backupFile || !backupSecret} onClick={readBackup}>
            Lire la sauvegarde
          </button>
        ) : (
          <div className="card warn stack">
            <p>Remplacer toutes tes données actuelles par cette sauvegarde ({restored.transactions.length} opérations) ?</p>
            <div className="row">
              <button
                className="btn primary small"
                onClick={() => {
                  replaceAll(restored)
                  setRestored(null)
                  setMessage('Sauvegarde restaurée.')
                }}
              >
                Remplacer mes données
              </button>
              <button className="btn small" onClick={() => setRestored(null)}>
                Annuler
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
