import { useEffect, useState } from 'react'

/** Bandeau « nouvelle version » : vérifie les mises à jour au retour sur l'app et propose de recharger. */
export function UpdateBanner() {
  const [update, setUpdate] = useState<null | (() => void)>(null)

  useEffect(() => {
    if (import.meta.env.MODE === 'artifact' || !('serviceWorker' in navigator)) return
    let registration: ServiceWorkerRegistration | undefined
    const check = () => document.visibilityState === 'visible' && registration?.update().catch(() => {})
    import('virtual:pwa-register').then(({ registerSW }) => {
      const updateSW = registerSW({
        onNeedRefresh: () => setUpdate(() => () => updateSW(true)),
        onRegisteredSW: (_url, r) => {
          registration = r
        },
      })
    })
    document.addEventListener('visibilitychange', check)
    return () => document.removeEventListener('visibilitychange', check)
  }, [])

  if (!update) return null
  return (
    <div className="update-banner" role="status">
      <span>Une nouvelle version de l'app est disponible.</span>
      <button className="btn small primary" onClick={update}>
        Mettre à jour
      </button>
    </div>
  )
}
