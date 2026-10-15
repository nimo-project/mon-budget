import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  changePassphrase,
  createVault,
  decryptJson,
  sealPayload,
  unlockWithPassphrase,
  unlockWithRecovery,
  type Vault,
} from '../crypto/vault'
import { emptyData } from '../domain/defaults'
import type { AppData } from '../domain/types'
import { loadVault, saveVault } from '../storage/local'
import { acceptRemote, loadSyncConfig, push, sync } from '../sync/remote'

type Status = 'loading' | 'unavailable' | 'new' | 'locked' | 'unlocked'

export type SyncState =
  | { kind: 'off' }
  | { kind: 'syncing' }
  | { kind: 'ok'; at: string }
  | { kind: 'error'; message: string }
  | { kind: 'conflict'; remote: Vault }

interface Store {
  status: Status
  data: AppData
  /** Applique une modification et la sauvegarde chiffrée. */
  update: (change: (d: AppData) => AppData) => void
  create: (passphrase: string) => Promise<string>
  finishSetup: () => void
  unlock: (passphrase: string) => Promise<void>
  recover: (code: string, newPassphrase: string) => Promise<void>
  setPassphrase: (newPassphrase: string) => Promise<void>
  lock: () => void
  /** Remplace toutes les données (restauration d'une sauvegarde). */
  replaceAll: (data: AppData) => void
  /** Installe sur cet appareil un coffre récupéré depuis la synchro (nouvel appareil). */
  adoptVault: (vault: Vault) => Promise<void>
  vault: Vault | null
  syncState: SyncState
  syncNow: () => Promise<void>
  resolveConflict: (keep: 'local' | 'remote') => Promise<void>
}

const Ctx = createContext<Store | null>(null)

const AUTO_LOCK_MS = 15 * 60 * 1000
const SYNC_DELAY_MS = 2000

export function StoreProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading')
  const [data, setData] = useState<AppData>(emptyData)
  const vaultRef = useRef<Vault | null>(null)
  const keyRef = useRef<CryptoKey | null>(null)
  const saving = useRef<Promise<void>>(Promise.resolve())
  const [vaultState, setVaultState] = useState<Vault | null>(null)
  const [syncState, setSyncState] = useState<SyncState>({ kind: loadSyncConfig() ? 'ok' : 'off', at: '' } as SyncState)
  const syncTimer = useRef<number | undefined>(undefined)
  // Référence à jour des données, pour enchaîner plusieurs modifications dans un même geste.
  const dataRef = useRef(data)

  useEffect(() => {
    loadVault()
      .then((v) => {
        vaultRef.current = v ?? null
        setVaultState(v ?? null)
        setStatus(v ? 'locked' : 'new')
      })
      .catch(() => setStatus('unavailable'))
  }, [])

  const storeVault = async (vault: Vault) => {
    vaultRef.current = vault
    setVaultState(vault)
    await saveVault(vault)
  }

  const showData = (next: AppData) => {
    dataRef.current = next
    setData(next)
  }

  const runSync = useCallback(async () => {
    if (!loadSyncConfig() || !vaultRef.current || !keyRef.current) {
      if (!loadSyncConfig()) setSyncState({ kind: 'off' })
      return
    }
    await saving.current
    setSyncState({ kind: 'syncing' })
    try {
      const result = await sync(vaultRef.current)
      if (result.kind === 'pulled') {
        const remoteData = await decryptJson<AppData>(keyRef.current, result.vault.payload)
        await storeVault(result.vault)
        showData({ ...emptyData(), ...remoteData })
      }
      if (result.kind === 'conflict') setSyncState({ kind: 'conflict', remote: result.remote })
      else setSyncState({ kind: 'ok', at: new Date().toISOString() })
    } catch (e) {
      setSyncState({ kind: 'error', message: (e as Error).message })
    }
  }, [])

  const scheduleSync = useCallback(() => {
    if (!loadSyncConfig()) return
    window.clearTimeout(syncTimer.current)
    syncTimer.current = window.setTimeout(runSync, SYNC_DELAY_MS)
  }, [runSync])

  const persist = useCallback(
    (next: AppData) => {
      // Les sauvegardes sont mises en file pour garder l'ordre des révisions.
      saving.current = saving.current.then(async () => {
        if (!vaultRef.current || !keyRef.current) return
        await storeVault(await sealPayload(vaultRef.current, keyRef.current, next))
      })
      scheduleSync()
    },
    [scheduleSync],
  )

  const commit = useCallback(
    (next: AppData) => {
      showData(next)
      persist(next)
    },
    [persist],
  )

  const update = useCallback(
    (change: (d: AppData) => AppData) => {
      commit({ ...change(dataRef.current), updatedAt: new Date().toISOString() })
    },
    [commit],
  )

  const open = async (vault: Vault, key: CryptoKey) => {
    const decoded = await decryptJson<AppData>(key, vault.payload)
    keyRef.current = key
    vaultRef.current = vault
    setVaultState(vault)
    showData({ ...emptyData(), ...decoded })
    setStatus('unlocked')
    void runSync()
  }

  const create = async (passphrase: string) => {
    const initial = emptyData()
    const { vault, key, recoveryCode } = await createVault(passphrase, initial)
    await storeVault(vault)
    keyRef.current = key
    showData(initial)
    // Le statut passe à « unlocked » seulement après confirmation de la clé de secours (finishSetup).
    return recoveryCode
  }

  const unlock = async (passphrase: string) => {
    const vault = vaultRef.current!
    await open(vault, await unlockWithPassphrase(vault, passphrase))
  }

  const recover = async (code: string, newPassphrase: string) => {
    const key = await unlockWithRecovery(vaultRef.current!, code)
    const vault = await changePassphrase(vaultRef.current!, key, newPassphrase)
    const bumped = { ...vault, revision: vault.revision + 1 }
    await storeVault(bumped)
    await open(bumped, key)
  }

  const setPassphrase = async (newPassphrase: string) => {
    await saving.current
    const vault = await changePassphrase(vaultRef.current!, keyRef.current!, newPassphrase)
    await storeVault({ ...vault, revision: vault.revision + 1 })
    scheduleSync()
  }

  const adoptVault = async (vault: Vault) => {
    acceptRemote(vault)
    await storeVault(vault)
    setStatus('locked')
  }

  const resolveConflict = async (keep: 'local' | 'remote') => {
    if (syncState.kind !== 'conflict' || !keyRef.current) return
    const remote = syncState.remote
    if (keep === 'remote') {
      const remoteData = await decryptJson<AppData>(keyRef.current, remote.payload)
      acceptRemote(remote)
      await storeVault(remote)
      showData({ ...emptyData(), ...remoteData })
    } else {
      // On repart de la révision du serveur pour que la version locale passe devant.
      const local = { ...vaultRef.current!, revision: Math.max(remote.revision, vaultRef.current!.revision) + 1 }
      await storeVault(local)
      await push(local)
    }
    setSyncState({ kind: 'ok', at: new Date().toISOString() })
  }

  const finishSetup = () => {
    setStatus('unlocked')
    void runSync()
  }

  const lock = useCallback(() => {
    keyRef.current = null
    showData(emptyData())
    setStatus((s) => (s === 'unlocked' ? 'locked' : s))
  }, [])

  // Verrouillage automatique après 15 minutes sans activité.
  useEffect(() => {
    if (status !== 'unlocked') return
    let timer = window.setTimeout(lock, AUTO_LOCK_MS)
    const reset = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(lock, AUTO_LOCK_MS)
    }
    const events = ['pointerdown', 'keydown', 'scroll'] as const
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }))
    return () => {
      window.clearTimeout(timer)
      events.forEach((e) => window.removeEventListener(e, reset))
    }
  }, [status, lock])

  // Synchro au retour sur l'app (changement d'onglet, réouverture sur le téléphone).
  useEffect(() => {
    if (status !== 'unlocked') return
    const onVisible = () => document.visibilityState === 'visible' && void runSync()
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [status, runSync])

  return (
    <Ctx.Provider
      value={{
        status,
        data,
        update,
        create,
        finishSetup,
        unlock,
        recover,
        setPassphrase,
        lock,
        replaceAll: commit,
        adoptVault,
        vault: vaultState,
        syncState,
        syncNow: runSync,
        resolveConflict,
      }}
    >
      {children}
    </Ctx.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useStore(): Store {
  const s = useContext(Ctx)
  if (!s) throw new Error('StoreProvider manquant')
  return s
}
