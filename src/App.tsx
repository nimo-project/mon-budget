import { useEffect, useState } from 'react'
import { HashRouter, Link, NavLink, Route, Routes } from 'react-router-dom'
import { useStore } from './state/store'
import { Setup, Unlock } from './screens/Locked'
import { Icon } from './ui/Icon'
import { QuickAdd } from './screens/QuickAdd'
import { Dashboard } from './screens/Dashboard'
import { Transactions } from './screens/Transactions'
import { ImportScreen } from './screens/Import'
import { BudgetScreen } from './screens/Budget'
import { SavingsScreen } from './screens/Savings'
import { AnalysisScreen } from './screens/Analysis'
import { SettingsScreen } from './screens/Settings'

const NAV = [
  { to: '/', label: 'Accueil', icon: 'home', mobile: true },
  { to: '/operations', label: 'Opérations', icon: 'list', mobile: true },
  { to: '/budget', label: 'Budget', icon: 'budget', mobile: true },
  { to: '/epargne', label: 'Épargne', icon: 'savings', mobile: true },
  { to: '/import', label: 'Importer', icon: 'import', mobile: false },
  { to: '/analyse', label: 'Analyse', icon: 'chart', mobile: false },
  { to: '/reglages', label: 'Réglages', icon: 'settings', mobile: false },
]

function MorePage() {
  return (
    <div className="stack">
      <h1>Plus</h1>
      <div className="card">
        <ul className="list">
          {NAV.filter((n) => !n.mobile).map((n) => (
            <li key={n.to}>
              <Link className="nav-link" to={n.to}>
                <Icon name={n.icon} /> {n.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function Shell() {
  const { data, lock, syncState } = useStore()
  const [adding, setAdding] = useState(() => new URLSearchParams(location.search).has('ajout'))
  const toReview = data.transactions.filter((t) => t.toReview).length

  useEffect(() => {
    // Raccourci de l'écran d'accueil : on retire le paramètre une fois la saisie ouverte.
    if (location.search) history.replaceState(null, '', location.pathname + location.hash)
  }, [])

  return (
    <div className="app">
      <nav className="sidebar" aria-label="Navigation">
        <div className="brand">
          <img src="favicon.svg" width={28} height={28} alt="" /> Mon budget
        </div>
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'} className="nav-link">
            <Icon name={n.icon} /> {n.label}
            {n.to === '/operations' && toReview > 0 && <span className="badge warn count">{toReview}</span>}
          </NavLink>
        ))}
        <div style={{ marginTop: 'auto' }}>
          <button className="nav-link btn ghost" style={{ width: '100%', justifyContent: 'flex-start' }} onClick={lock}>
            <Icon name="lock" /> Verrouiller
          </button>
        </div>
      </nav>
      <main className="content">
        {import.meta.env.MODE === 'artifact' && (
          <div className="card warn small" style={{ marginBottom: '1rem' }}>
            Version d'essai : tes données restent chiffrées dans ce navigateur. La synchro entre appareils et les téléchargements
            (export CSV, sauvegarde) arriveront avec la version installée.
          </div>
        )}
        {(syncState.kind === 'foreign' || syncState.kind === 'conflict' || syncState.kind === 'error') && (
          <div className="card warn small" style={{ marginBottom: '1rem' }}>
            {syncState.kind === 'error' ? 'La synchro a échoué.' : 'La synchro a besoin que tu choisisses quelles données garder.'}{' '}
            <Link to="/reglages">Voir dans Réglages</Link>
          </div>
        )}
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/operations" element={<Transactions />} />
          <Route path="/import" element={<ImportScreen />} />
          <Route path="/budget" element={<BudgetScreen />} />
          <Route path="/epargne" element={<SavingsScreen />} />
          <Route path="/analyse" element={<AnalysisScreen />} />
          <Route path="/reglages" element={<SettingsScreen />} />
          <Route path="/plus" element={<MorePage />} />
        </Routes>
      </main>
      <nav className="bottom-nav" aria-label="Navigation">
        {NAV.filter((n) => n.mobile).map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'}>
            <Icon name={n.icon} />
            {n.label}
          </NavLink>
        ))}
        <NavLink to="/plus">
          <Icon name="more" />
          Plus
        </NavLink>
      </nav>
      <button className="fab" aria-label="Ajouter une dépense" onClick={() => setAdding(true)}>
        +
      </button>
      {adding && <QuickAdd onClose={() => setAdding(false)} />}
    </div>
  )
}

export default function App() {
  const { status } = useStore()
  if (status === 'loading') return null
  if (status === 'unavailable')
    return (
      <div className="center-screen">
        <div className="card">
          <h1>Stockage indisponible</h1>
          <p>Ce navigateur bloque le stockage local (navigation privée ou données de site bloquées). Ouvre l'app dans une fenêtre normale.</p>
        </div>
      </div>
    )
  if (status === 'new') return <Setup />
  if (status === 'locked') return <Unlock />
  return (
    <HashRouter>
      <Shell />
    </HashRouter>
  )
}
