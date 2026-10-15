// Stockage local du coffre chiffré dans IndexedDB. Rien n'y est en clair.
import type { Vault } from '../crypto/vault'

const DB = 'budget-app'
const STORE = 'kv'

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode)
    const req = run(t.objectStore(STORE))
    t.oncomplete = () => {
      db.close()
      resolve(req.result)
    }
    t.onerror = () => reject(t.error)
  })
}

export function loadVault(): Promise<Vault | undefined> {
  return tx('readonly', (s) => s.get('vault'))
}

export async function saveVault(vault: Vault): Promise<void> {
  await tx('readwrite', (s) => s.put(vault, 'vault'))
}

export async function deleteVault(): Promise<void> {
  await tx('readwrite', (s) => s.delete('vault'))
}
