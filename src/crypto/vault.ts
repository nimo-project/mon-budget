// Chiffrement de bout en bout.
//
// Une clé de données (AES-GCM 256 bits) chiffre toutes les données de l'app.
// Elle n'est jamais stockée en clair : elle est « emballée » deux fois,
//  - par une clé dérivée de la phrase secrète (PBKDF2-SHA256),
//  - par la clé de secours (32 octets aléatoires montrés une seule fois à Nina).
// Le serveur de synchro ne reçoit que le coffre ci-dessous, illisible sans l'une des deux.

export interface Sealed {
  iv: string
  data: string
}

export interface VaultHeader {
  v: 1
  salt: string
  iterations: number
  passWrap: Sealed
  recoveryWrap: Sealed
}

export interface Vault extends VaultHeader {
  payload: Sealed
  /** Incrémenté à chaque sauvegarde, sert à la synchro. */
  revision: number
}

const ITERATIONS = 600_000
const enc = new TextEncoder()
const dec = new TextDecoder()

function b64(bytes: ArrayBuffer | Uint8Array): string {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let s = ''
  for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i])
  return btoa(s)
}

function unb64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s)
  const u = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i)
  return u
}

function random(n: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(n))
}

async function passphraseKey(passphrase: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(passphrase.normalize('NFC')), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['wrapKey', 'unwrapKey'],
  )
}

async function recoveryKey(raw: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['wrapKey', 'unwrapKey'])
}

async function wrap(dataKey: CryptoKey, wrapping: CryptoKey): Promise<Sealed> {
  const iv = random(12)
  const data = await crypto.subtle.wrapKey('raw', dataKey, wrapping, { name: 'AES-GCM', iv })
  return { iv: b64(iv), data: b64(data) }
}

async function unwrap(sealed: Sealed, wrapping: CryptoKey): Promise<CryptoKey> {
  return crypto.subtle.unwrapKey(
    'raw',
    unb64(sealed.data),
    wrapping,
    { name: 'AES-GCM', iv: unb64(sealed.iv) },
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  )
}

// Clé de secours affichée en base32 Crockford, par groupes de 4 : lisible et sans caractères ambigus.
const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

export function formatRecoveryCode(raw: Uint8Array): string {
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of raw) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31]
  return out.match(/.{1,4}/g)!.join('-')
}

export function parseRecoveryCode(code: string): Uint8Array<ArrayBuffer> | null {
  const clean = code
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const ch of clean) {
    const v = B32.indexOf(ch)
    if (v < 0) return null
    value = (value << 5) | v
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  if (out.length !== 32) return null
  return new Uint8Array(out)
}

export async function encryptJson(key: CryptoKey, value: unknown): Promise<Sealed> {
  const iv = random(12)
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(value)))
  return { iv: b64(iv), data: b64(data) }
}

export async function decryptJson<T>(key: CryptoKey, sealed: Sealed): Promise<T> {
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(sealed.iv) }, key, unb64(sealed.data))
  return JSON.parse(dec.decode(plain)) as T
}

export interface NewVault {
  vault: Vault
  key: CryptoKey
  recoveryCode: string
}

export async function createVault(passphrase: string, initial: unknown, iterations = ITERATIONS): Promise<NewVault> {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
  const salt = random(16)
  const recoveryRaw = random(32)
  const vault: Vault = {
    v: 1,
    salt: b64(salt),
    iterations,
    passWrap: await wrap(key, await passphraseKey(passphrase, salt, iterations)),
    recoveryWrap: await wrap(key, await recoveryKey(recoveryRaw)),
    payload: await encryptJson(key, initial),
    revision: 1,
  }
  return { vault, key, recoveryCode: formatRecoveryCode(recoveryRaw) }
}

export class WrongSecretError extends Error {
  constructor() {
    super('Phrase secrète ou clé de secours incorrecte')
  }
}

export async function unlockWithPassphrase(vault: VaultHeader, passphrase: string): Promise<CryptoKey> {
  try {
    return await unwrap(vault.passWrap, await passphraseKey(passphrase, unb64(vault.salt), vault.iterations))
  } catch {
    throw new WrongSecretError()
  }
}

export async function unlockWithRecovery(vault: VaultHeader, code: string): Promise<CryptoKey> {
  const raw = parseRecoveryCode(code)
  if (!raw) throw new WrongSecretError()
  try {
    return await unwrap(vault.recoveryWrap, await recoveryKey(raw))
  } catch {
    throw new WrongSecretError()
  }
}

/** Change la phrase secrète (après déverrouillage ou avec la clé de secours). La clé de secours reste valable. */
export async function changePassphrase<V extends VaultHeader>(vault: V, key: CryptoKey, newPassphrase: string): Promise<V> {
  const salt = random(16)
  return {
    ...vault,
    salt: b64(salt),
    passWrap: await wrap(key, await passphraseKey(newPassphrase, salt, vault.iterations)),
  }
}

export async function sealPayload(vault: Vault, key: CryptoKey, data: unknown): Promise<Vault> {
  return { ...vault, payload: await encryptJson(key, data), revision: vault.revision + 1 }
}
