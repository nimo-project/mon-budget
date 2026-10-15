import type { Rule } from './types'
import { normalizeLabel, uid, today } from './util'

export interface RuleMatch {
  rule: Rule
  /** La règle porte sur un montant différent : probable changement de prix d'un abonnement. */
  priceChanged?: boolean
}

/**
 * Cherche la règle qui s'applique à une opération.
 * Priorité : libellé + montant (dans la tolérance), puis libellé seul ; à égalité, le motif le plus long.
 */
export function matchRule(label: string, amount: number, rules: Rule[], tolerance: number): RuleMatch | null {
  const norm = normalizeLabel(label)
  const candidates = rules.filter((r) => r.pattern && norm.includes(r.pattern))
  if (candidates.length === 0) return null
  const byLength = (a: Rule, b: Rule) => b.pattern.length - a.pattern.length

  const withAmount = candidates.filter((r) => r.amount !== undefined)
  const exact = withAmount
    .filter((r) => Math.abs(r.amount! - amount) <= tolerance)
    .sort((a, b) => Math.abs(a.amount! - amount) - Math.abs(b.amount! - amount) || byLength(a, b))
  if (exact.length) return { rule: exact[0] }

  const labelOnly = candidates.filter((r) => r.amount === undefined).sort(byLength)
  if (labelOnly.length) return { rule: labelOnly[0] }

  // Un seul abonnement connu sous ce libellé, avec le même signe : sans doute une hausse ou une baisse de prix.
  const sameSign = withAmount.filter((r) => Math.sign(r.amount!) === Math.sign(amount))
  const patterns = new Set(sameSign.map((r) => r.pattern))
  if (sameSign.length === 1 && patterns.size === 1) {
    const r = sameSign[0]
    const ratio = Math.abs(amount) / Math.abs(r.amount!)
    if (ratio > 0.5 && ratio < 2) return { rule: r, priceChanged: true }
  }
  return null
}

/**
 * Mémorise une correction de Nina. Remplace une règle existante sur le même libellé
 * (et le même montant, pour une règle libellé + montant).
 */
export function learnRule(
  rules: Rule[],
  label: string,
  amount: number,
  categoryId: string,
  withAmount: boolean,
  tolerance: number,
): { rules: Rule[]; rule: Rule } {
  const pattern = normalizeLabel(label)
  const existing = rules.find(
    (r) =>
      r.pattern === pattern &&
      (withAmount ? r.amount !== undefined && Math.abs(r.amount - amount) <= tolerance : r.amount === undefined),
  )
  const rule: Rule = existing
    ? { ...existing, categoryId, amount: withAmount ? amount : undefined }
    : { id: uid(), pattern, amount: withAmount ? amount : undefined, categoryId, createdAt: today() }
  return { rule, rules: existing ? rules.map((r) => (r.id === existing.id ? rule : r)) : [...rules, rule] }
}

/** Met à jour le montant d'une règle d'abonnement après un changement de prix accepté. */
export function updateRuleAmount(rules: Rule[], ruleId: string, amount: number): Rule[] {
  return rules.map((r) => (r.id === ruleId ? { ...r, amount } : r))
}
