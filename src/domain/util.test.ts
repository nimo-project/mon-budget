import { describe, expect, it } from 'vitest'
import { normalizeLabel } from './util'

describe('normalizeLabel', () => {
  it('ignore la date incluse dans le libellé', () => {
    const variants = [
      'CARTE X1234 15/10 CARREFOUR CITY',
      'CB CARREFOUR CITY 03/11/26',
      'CARREFOUR CITY 2026-10-15',
      'CARREFOUR CITY 15-10-2026',
      'CB CARREFOUR CITY 15OCT',
      'CARREFOUR CITY 3 NOV 26',
      'CARREFOUR CITY 15.10.26',
    ]
    for (const v of variants) expect(normalizeLabel(v)).toBe('CARREFOUR CITY')
  })
})
