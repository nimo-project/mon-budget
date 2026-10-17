import { useState, type FormEvent } from 'react'
import { WrongSecretError } from '../crypto/vault'
import { useStore } from '../state/store'
import { DEFAULT_SYNC, fetchRemote, saveSyncConfig, signIn } from '../sync/remote'

const MIN_LENGTH = 12

function passphraseProblem(p: string, confirm: string): string | null {
  if (p.length < MIN_LENGTH) return `Au moins ${MIN_LENGTH} caractères. Une courte phrase est plus facile à retenir.`
  if (p !== confirm) return 'Les deux saisies ne correspondent pas.'
  return null
}

export function Setup() {
  const { create, finishSetup } = useStore()
  const [pass, setPass] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [code, setCode] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [fromSync, setFromSync] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const problem = passphraseProblem(pass, confirm)
    if (problem) return setError(problem)
    setBusy(true)
    setCode(await create(pass))
    setBusy(false)
  }

  if (code) {
    return (
      <div className="center-screen">
        <div className="card stack">
          <h1>Ta clé de secours</h1>
          <p>
            Elle permet de retrouver tes données si tu oublies ta phrase secrète. Elle ne sera plus jamais affichée.
            Note-la sur papier ou dans ton gestionnaire de mots de passe.
          </p>
          <div className="recovery-code">{code}</div>
          <button type="button" className="btn small" onClick={() => navigator.clipboard?.writeText(code)}>
            Copier
          </button>
          <label className="inline">
            <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
            J'ai mis ma clé de secours en lieu sûr
          </label>
          <button className="btn primary" disabled={!saved} onClick={finishSetup}>
            Continuer
          </button>
        </div>
      </div>
    )
  }

  if (fromSync) return <RestoreFromSync onBack={() => setFromSync(false)} />

  return (
    <div className="center-screen">
      <form className="card stack" onSubmit={submit}>
        <h1>Bienvenue</h1>
        <p>
          Tes données sont chiffrées sur cet appareil avec ta phrase secrète. Personne d'autre ne peut les lire, pas même
          le serveur de synchro.
        </p>
        <div className="card warn stack">
          <p className="small">
            Tu utilises déjà l'app sur un autre appareil ? Ne crée pas de nouvel espace : récupère tes données.
          </p>
          <button type="button" className="btn" onClick={() => setFromSync(true)}>
            Récupérer mes données
          </button>
        </div>
        <h2>Première utilisation</h2>
        <label>
          Phrase secrète
          <input type="password" autoComplete="new-password" value={pass} onChange={(e) => setPass(e.target.value)} />
        </label>
        <label>
          Confirmer la phrase secrète
          <input
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn primary" disabled={busy}>
          {busy ? 'Chiffrement…' : 'Créer mon espace'}
        </button>
      </form>
    </div>
  )
}

export function Unlock() {
  const { unlock, recover } = useStore()
  const [mode, setMode] = useState<'pass' | 'recovery'>('pass')
  const [pass, setPass] = useState('')
  const [code, setCode] = useState('')
  const [newPass, setNewPass] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (mode === 'recovery') {
      const problem = passphraseProblem(newPass, confirm)
      if (problem) return setError(problem)
    }
    setBusy(true)
    try {
      if (mode === 'pass') await unlock(pass)
      else await recover(code, newPass)
    } catch (err) {
      setError(err instanceof WrongSecretError ? err.message : 'Impossible de déverrouiller.')
      setBusy(false)
    }
  }

  return (
    <div className="center-screen">
      <form className="card stack" onSubmit={submit}>
        <h1>{mode === 'pass' ? 'Déverrouiller' : 'Utiliser la clé de secours'}</h1>
        {mode === 'pass' ? (
          <label>
            Phrase secrète
            <input
              type="password"
              autoFocus
              autoComplete="current-password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
            />
          </label>
        ) : (
          <>
            <label>
              Clé de secours
              <input value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" spellCheck={false} />
            </label>
            <label>
              Nouvelle phrase secrète
              <input
                type="password"
                autoComplete="new-password"
                value={newPass}
                onChange={(e) => setNewPass(e.target.value)}
              />
            </label>
            <label>
              Confirmer la nouvelle phrase secrète
              <input
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </label>
          </>
        )}
        {error && <p className="error">{error}</p>}
        <button className="btn primary" disabled={busy}>
          {busy ? 'Déchiffrement…' : 'Ouvrir'}
        </button>
        <button
          type="button"
          className="btn ghost small"
          onClick={() => {
            setMode(mode === 'pass' ? 'recovery' : 'pass')
            setError(null)
          }}
        >
          {mode === 'pass' ? "J'ai oublié ma phrase secrète" : 'Revenir à la phrase secrète'}
        </button>
      </form>
    </div>
  )
}

/** Nouvel appareil : récupère le coffre chiffré depuis la synchro, puis on le déverrouille avec la phrase secrète. */
function RestoreFromSync({ onBack }: { onBack: () => void }) {
  const { adoptVault } = useStore()
  const [url, setUrl] = useState(DEFAULT_SYNC?.url ?? '')
  const [anonKey, setAnonKey] = useState(DEFAULT_SYNC?.anonKey ?? '')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      saveSyncConfig({ url: url.trim(), anonKey: anonKey.trim() })
      await signIn(email, password)
      const vault = await fetchRemote()
      if (!vault) throw new Error('Aucune donnée trouvée sur ce compte de synchro.')
      await adoptVault(vault)
    } catch (err) {
      saveSyncConfig(null)
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <div className="center-screen">
      <form className="card stack" onSubmit={submit}>
        <h1>Récupérer mes données</h1>
        {!DEFAULT_SYNC && (
          <>
            <p className="small muted">Les informations de synchro se trouvent dans Réglages › Sécurité sur ton autre appareil.</p>
            <label>
              Adresse du projet
              <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://xxxx.supabase.co" />
            </label>
            <label>
              Clé publique (anon)
              <input value={anonKey} onChange={(e) => setAnonKey(e.target.value)} />
            </label>
          </>
        )}
        <label>
          E-mail de synchro
          <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Mot de passe de synchro
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn primary" disabled={busy}>
          {busy ? 'Récupération…' : 'Récupérer'}
        </button>
        <button type="button" className="btn ghost small" onClick={onBack}>
          Retour
        </button>
      </form>
    </div>
  )
}
