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

type Status = 'loading' | 'new' | 'locked' | 'unlocked'

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
  vault: Vault | null
}

const Ctx = createContext<Store | null>(null)

const AUTO_LOCK_MS = 15 * 60 * 1000

export function StoreProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading')
  const [data, setData] = useState<AppData>(emptyData)
  const vaultRef = useRef<Vault | null>(null)
  const keyRef = useRef<CryptoKey | null>(null)
  const saving = useRef<Promise<void>>(Promise.resolve())
  const [vaultState, setVaultState] = useState<Vault | null>(null)

  useEffect(() => {
    loadVault().then((v) => {
      vaultRef.current = v ?? null
      setVaultState(v ?? null)
      setStatus(v ? 'locked' : 'new')
    })
  }, [])

  const persist = useCallback((next: AppData) => {
    // Les sauvegardes sont mises en file pour garder l'ordre des révisions.
    saving.current = saving.current.then(async () => {
      if (!vaultRef.current || !keyRef.current) return
      const sealed = await sealPayload(vaultRef.current, keyRef.current, next)
      vaultRef.current = sealed
      setVaultState(sealed)
      await saveVault(sealed)
    })
  }, [])

  // Référence à jour des données, pour enchaîner plusieurs modifications dans un même geste.
  const dataRef = useRef(data)

  const commit = useCallback(
    (next: AppData) => {
      dataRef.current = next
      setData(next)
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

  const replaceAll = commit

  const open = async (vault: Vault, key: CryptoKey) => {
    const decoded = await decryptJson<AppData>(key, vault.payload)
    keyRef.current = key
    vaultRef.current = vault
    setVaultState(vault)
    const loaded = { ...emptyData(), ...decoded }
    dataRef.current = loaded
    setData(loaded)
    setStatus('unlocked')
  }

  const create = async (passphrase: string) => {
    const initial = emptyData()
    const { vault, key, recoveryCode } = await createVault(passphrase, initial)
    await saveVault(vault)
    keyRef.current = key
    vaultRef.current = vault
    setVaultState(vault)
    dataRef.current = initial
    setData(initial)
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
    await saveVault(vault)
    await open(vault, key)
  }

  const setPassphrase = async (newPassphrase: string) => {
    await saving.current
    const vault = await changePassphrase(vaultRef.current!, keyRef.current!, newPassphrase)
    vaultRef.current = vault
    setVaultState(vault)
    await saveVault(vault)
  }

  const finishSetup = () => setStatus('unlocked')

  const lock = useCallback(() => {
    keyRef.current = null
    dataRef.current = emptyData()
    setData(dataRef.current)
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

  return (
    <Ctx.Provider
      value={{ status, data, update, create, finishSetup, unlock, recover, setPassphrase, lock, replaceAll, vault: vaultState }}
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
