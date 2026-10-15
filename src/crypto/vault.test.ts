import { describe, expect, it } from 'vitest'
import {
  changePassphrase,
  createVault,
  decryptJson,
  formatRecoveryCode,
  parseRecoveryCode,
  unlockWithPassphrase,
  unlockWithRecovery,
  WrongSecretError,
} from './vault'

describe('coffre chiffré', () => {
  it('se déverrouille avec la phrase secrète et la clé de secours', async () => {
    const { vault, recoveryCode } = await createVault('ma phrase', { hello: 'monde' }, 1000)
    expect(JSON.stringify(vault)).not.toContain('monde')
    const k1 = await unlockWithPassphrase(vault, 'ma phrase')
    expect(await decryptJson(k1, vault.payload)).toEqual({ hello: 'monde' })
    const k2 = await unlockWithRecovery(vault, recoveryCode.toLowerCase())
    expect(await decryptJson(k2, vault.payload)).toEqual({ hello: 'monde' })
  })

  it('refuse une mauvaise phrase secrète', async () => {
    const { vault } = await createVault('ma phrase', {}, 1000)
    await expect(unlockWithPassphrase(vault, 'autre')).rejects.toBeInstanceOf(WrongSecretError)
    await expect(unlockWithRecovery(vault, 'AAAA-BBBB')).rejects.toBeInstanceOf(WrongSecretError)
  })

  it('change la phrase secrète sans casser la clé de secours', async () => {
    const { vault, key, recoveryCode } = await createVault('ancienne', { a: 1 }, 1000)
    const next = await changePassphrase(vault, key, 'nouvelle')
    await expect(unlockWithPassphrase(next, 'ancienne')).rejects.toBeInstanceOf(WrongSecretError)
    expect(await decryptJson(await unlockWithPassphrase(next, 'nouvelle'), next.payload)).toEqual({ a: 1 })
    expect(await decryptJson(await unlockWithRecovery(next, recoveryCode), next.payload)).toEqual({ a: 1 })
  })

  it('encode et relit la clé de secours', () => {
    const raw = crypto.getRandomValues(new Uint8Array(32))
    expect(parseRecoveryCode(formatRecoveryCode(raw))).toEqual(raw)
  })
})
