// Synchro entre appareils via Supabase. Seul le coffre chiffré est envoyé :
// le serveur ne voit jamais les données en clair ni la phrase secrète.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Vault } from '../crypto/vault'

export interface SyncConfig {
  url: string
  anonKey: string
}

const CONFIG_KEY = 'budget-sync-config'
const BASE_KEY = 'budget-sync-base-revision'

export function loadSyncConfig(): SyncConfig | null {
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    return raw ? (JSON.parse(raw) as SyncConfig) : null
  } catch {
    return null
  }
}

export function saveSyncConfig(config: SyncConfig | null) {
  try {
    if (config) localStorage.setItem(CONFIG_KEY, JSON.stringify(config))
    else {
      localStorage.removeItem(CONFIG_KEY)
      localStorage.removeItem(BASE_KEY)
    }
  } catch {
    /* stockage indisponible : la synchro restera désactivée */
  }
  client = null
}

/** Dernière révision connue du serveur, pour détecter les modifications faites ailleurs. */
export function baseRevision(): number {
  try {
    return Number(localStorage.getItem(BASE_KEY) ?? 0)
  } catch {
    return 0
  }
}

function setBaseRevision(rev: number) {
  try {
    localStorage.setItem(BASE_KEY, String(rev))
  } catch {
    /* ignoré */
  }
}

let client: SupabaseClient | null = null

// Le client Supabase n'est chargé que si la synchro est activée.
export async function supabase(): Promise<SupabaseClient | null> {
  const config = loadSyncConfig()
  if (!config) return null
  if (!client) {
    const { createClient } = await import('@supabase/supabase-js')
    client = createClient(config.url, config.anonKey, { auth: { persistSession: true, storageKey: 'budget-sync-auth' } })
  }
  return client
}

export async function signIn(email: string, password: string): Promise<void> {
  const sb = await supabase()
  if (!sb) throw new Error('Synchro non configurée')
  const { error } = await sb.auth.signInWithPassword({ email, password })
  if (error) throw new Error(error.message)
}

export async function signUp(email: string, password: string): Promise<void> {
  const sb = await supabase()
  if (!sb) throw new Error('Synchro non configurée')
  const { error } = await sb.auth.signUp({ email, password })
  if (error) throw new Error(error.message)
}

export async function signOut(): Promise<void> {
  await (await supabase())?.auth.signOut()
}

export async function currentUser(): Promise<string | null> {
  const sb = await supabase()
  if (!sb) return null
  const { data } = await sb.auth.getUser()
  return data.user?.email ?? null
}

export async function fetchRemote(): Promise<Vault | null> {
  const sb = await supabase()
  if (!sb) return null
  const { data, error } = await sb.from('vaults').select('vault').maybeSingle()
  if (error) throw new Error(error.message)
  return (data?.vault as Vault | undefined) ?? null
}

export type SyncResult =
  | { kind: 'pushed'; revision: number }
  | { kind: 'pulled'; vault: Vault }
  | { kind: 'up-to-date' }
  | { kind: 'conflict'; remote: Vault }

/**
 * Compare le coffre local et celui du serveur.
 *  - serveur inchangé depuis la dernière synchro et local plus récent → envoi ;
 *  - local inchangé et serveur plus récent → récupération ;
 *  - les deux ont changé → conflit, Nina choisit la version à garder.
 */
export async function sync(local: Vault): Promise<SyncResult> {
  const sb = await supabase()
  if (!sb) return { kind: 'up-to-date' }
  const remote = await fetchRemote()
  const base = baseRevision()
  const remoteRev = remote?.revision ?? 0
  if (remote && remoteRev === local.revision) {
    setBaseRevision(remoteRev)
    return { kind: 'up-to-date' }
  }
  const remoteChanged = remote !== null && remoteRev !== base
  const localChanged = local.revision !== base
  if (remoteChanged && localChanged && base !== 0) return { kind: 'conflict', remote }
  if (remoteChanged && (!localChanged || base === 0) && remoteRev > local.revision) {
    setBaseRevision(remoteRev)
    return { kind: 'pulled', vault: remote }
  }
  await push(local)
  return { kind: 'pushed', revision: local.revision }
}

export async function push(vault: Vault): Promise<void> {
  const sb = await supabase()
  if (!sb) return
  const { data: auth } = await sb.auth.getUser()
  if (!auth.user) throw new Error('Connecte-toi à la synchro')
  const { error } = await sb
    .from('vaults')
    .upsert({ user_id: auth.user.id, vault, revision: vault.revision, updated_at: new Date().toISOString() })
  if (error) throw new Error(error.message)
  setBaseRevision(vault.revision)
}

export function acceptRemote(remote: Vault) {
  setBaseRevision(remote.revision)
}

/** Script SQL à exécuter une fois dans Supabase (éditeur SQL). */
export const SETUP_SQL = `create table if not exists public.vaults (
  user_id uuid primary key references auth.users on delete cascade,
  vault jsonb not null,
  revision integer not null,
  updated_at timestamptz not null default now()
);
alter table public.vaults enable row level security;
grant select, insert, update, delete on public.vaults to authenticated;
create policy "Chacun son coffre" on public.vaults
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);`
