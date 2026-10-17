import { useEffect, useState } from 'react'
import { currentUser, DEFAULT_SYNC, loadSyncConfig, saveSyncConfig, SETUP_SQL, signIn, signOut, signUp } from '../sync/remote'
import { useStore } from '../state/store'

export function SyncSettings() {
  const { syncState, syncNow, resolveConflict } = useStore()
  const [config, setConfig] = useState(loadSyncConfig())
  const [url, setUrl] = useState(config?.url ?? DEFAULT_SYNC?.url ?? '')
  const [anonKey, setAnonKey] = useState(config?.anonKey ?? DEFAULT_SYNC?.anonKey ?? '')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [user, setUser] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [showSql, setShowSql] = useState(false)

  useEffect(() => {
    currentUser()
      .then(setUser)
      .catch(() => setUser(null))
  }, [config])

  const saveConfig = () => {
    if (!/^https:\/\/.+/.test(url.trim()) || !anonKey.trim()) return setMessage("Indique l'adresse et la clé publique du projet.")
    const c = { url: url.trim(), anonKey: anonKey.trim() }
    saveSyncConfig(c)
    setConfig(c)
    setMessage(null)
  }

  const auth = async (mode: 'in' | 'up') => {
    setMessage(null)
    try {
      if (mode === 'up') {
        await signUp(email, password)
        setMessage('Compte créé. Si Supabase demande une confirmation, ouvre le lien reçu par e-mail puis connecte-toi.')
      } else await signIn(email, password)
      setUser(await currentUser())
      if (mode === 'in') await syncNow()
    } catch (e) {
      setMessage((e as Error).message)
    }
  }

  return (
    <div className="card stack">
      <h2>Synchro entre appareils</h2>
      <p className="small muted">
        Seules des données déjà chiffrées sur cet appareil sont envoyées. Le serveur ne peut pas les lire.
      </p>

      {!config && DEFAULT_SYNC ? (
        <button className="btn primary" onClick={saveConfig}>
          Activer la synchro
        </button>
      ) : !config ? (
        <>
          <p className="small">
            Crée un projet gratuit sur supabase.com (région Europe), exécute le script de mise en place dans son éditeur SQL, puis
            colle ici l'adresse du projet et sa clé publique (« anon »).
          </p>
          <button className="btn small" onClick={() => setShowSql(!showSql)}>
            {showSql ? 'Masquer' : 'Afficher'} le script de mise en place
          </button>
          {showSql && (
            <pre className="recovery-code" style={{ whiteSpace: 'pre-wrap', fontSize: '0.8rem' }}>
              {SETUP_SQL}
            </pre>
          )}
          <label>
            Adresse du projet
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://xxxx.supabase.co" />
          </label>
          <label>
            Clé publique (anon)
            <input value={anonKey} onChange={(e) => setAnonKey(e.target.value)} />
          </label>
          <button className="btn primary" onClick={saveConfig}>
            Activer la synchro
          </button>
        </>
      ) : !user ? (
        <>
          <p className="small">Connecte-toi au compte de synchro (le même sur tous tes appareils).</p>
          <label>
            E-mail
            <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label>
            Mot de passe de synchro
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <p className="small muted">Utilise un mot de passe différent de ta phrase secrète.</p>
          <div className="row">
            <button className="btn primary" onClick={() => auth('in')}>
              Se connecter
            </button>
            <button className="btn" onClick={() => auth('up')}>
              Créer le compte
            </button>
            <button
              className="btn ghost small"
              onClick={() => {
                saveSyncConfig(null)
                setConfig(null)
              }}
            >
              Désactiver
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="small">
            Connectée en tant que <strong>{user}</strong>.{' '}
            {syncState.kind === 'ok' &&
              syncState.at &&
              `Dernière synchro à ${new Date(syncState.at).toLocaleTimeString('fr-FR')}.`}
            {syncState.kind === 'syncing' && 'Synchro en cours…'}
          </p>
          {!DEFAULT_SYNC && (
            <details className="small">
              <summary>Infos pour connecter un autre appareil</summary>
              <p className="muted">Adresse : {config.url}</p>
              <p className="muted" style={{ wordBreak: 'break-all' }}>
                Clé publique : {config.anonKey}
              </p>
            </details>
          )}
          {syncState.kind === 'error' && <p className="error">Synchro impossible : {syncState.message}</p>}
          {syncState.kind === 'foreign' && (
            <div className="card warn stack">
              <p>
                Le compte de synchro contient des données créées sur un autre appareil, avec une autre phrase secrète. Rien n'a
                été écrasé. Quelles données veux-tu garder ?
              </p>
              <p className="small muted">
                Si tu choisis l'autre appareil, les données de cet appareil-ci seront remplacées et l'app te demandera la phrase
                secrète de l'autre appareil.
              </p>
              <div className="row">
                <button className="btn small primary" onClick={() => resolveConflict('remote')}>
                  Celles de l'autre appareil
                </button>
                <button className="btn small" onClick={() => resolveConflict('local')}>
                  Celles de cet appareil
                </button>
              </div>
            </div>
          )}
          {syncState.kind === 'conflict' && (
            <div className="card warn stack">
              <p>
                Tes données ont été modifiées sur cet appareil et sur un autre depuis la dernière synchro. Quelle version garder ?
              </p>
              <div className="row">
                <button className="btn small primary" onClick={() => resolveConflict('local')}>
                  Celle de cet appareil
                </button>
                <button className="btn small" onClick={() => resolveConflict('remote')}>
                  Celle de l'autre appareil
                </button>
              </div>
            </div>
          )}
          <div className="row">
            <button className="btn" onClick={syncNow}>
              Synchroniser maintenant
            </button>
            <button
              className="btn ghost small"
              onClick={async () => {
                await signOut()
                setUser(null)
              }}
            >
              Se déconnecter
            </button>
          </div>
        </>
      )}
      {message && <p className="small">{message}</p>}
    </div>
  )
}
