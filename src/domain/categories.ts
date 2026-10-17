import type { AppData, Category } from './types'

export const UNCATEGORIZED = 'sans-categorie'

export function categoryMap(categories: Category[]): Map<string, Category> {
  return new Map(categories.map((c) => [c.id, c]))
}

export function rootOf(id: string, map: Map<string, Category>): string {
  let c = map.get(id)
  while (c?.parentId && map.has(c.parentId)) c = map.get(c.parentId)
  return c?.id ?? id
}

export function categoryLabel(id: string | undefined, map: Map<string, Category>): string {
  if (!id || id === UNCATEGORIZED) return 'À classer'
  const c = map.get(id)
  if (!c) return 'Catégorie supprimée'
  const parent = c.parentId ? map.get(c.parentId) : undefined
  return parent ? `${parent.name} › ${c.name}` : c.name
}

/** La catégorie et toutes ses sous-catégories. */
export function subtree(id: string, categories: Category[]): Set<string> {
  const ids = new Set([id])
  let grew = true
  while (grew) {
    grew = false
    for (const c of categories) {
      if (c.parentId && ids.has(c.parentId) && !ids.has(c.id)) {
        ids.add(c.id)
        grew = true
      }
    }
  }
  return ids
}

/** Catégories triées : chaque catégorie suivie de ses sous-catégories. */
export function orderedCategories(categories: Category[], includeArchived = false): Category[] {
  const visible = categories.filter((c) => includeArchived || !c.archived)
  const roots = visible.filter((c) => !c.parentId)
  const out: Category[] = []
  for (const r of roots) {
    out.push(r)
    out.push(...visible.filter((c) => c.parentId === r.id))
  }
  return out
}

function remapCategory(data: AppData, from: Set<string>, to: string): AppData {
  const map = (id: string | undefined) => (id && from.has(id) ? to : id)
  return {
    ...data,
    transactions: data.transactions.map((t) => ({
      ...t,
      categoryId: map(t.categoryId),
      splits: t.splits?.map((s) => ({ ...s, categoryId: map(s.categoryId)! })),
    })),
    rules: data.rules.map((r) => ({ ...r, categoryId: map(r.categoryId)! })),
    accounts: data.accounts.map((a) => ({ ...a, purposeCategoryId: map(a.purposeCategoryId) })),
    budget: mergeBudget(
      data.budget.map((b) => ({ ...b, categoryId: map(b.categoryId)! })),
    ),
    periodBudgets:
      data.periodBudgets &&
      Object.fromEntries(
        Object.entries(data.periodBudgets).map(([k, lines]) => [k, mergeBudget(lines.map((b) => ({ ...b, categoryId: map(b.categoryId)! })))]),
      ),
    annualExpenses: data.annualExpenses.map((e) => ({ ...e, categoryId: map(e.categoryId) })),
    investments: data.investments.map((i) => ({ ...i, categoryId: map(i.categoryId)! })),
    rollovers: data.rollovers.map((r) => ({ ...r, categoryId: map(r.categoryId)! })),
  }
}

function mergeBudget(lines: AppData['budget']): AppData['budget'] {
  const byCat = new Map<string, AppData['budget'][number]>()
  for (const l of lines) {
    const prev = byCat.get(l.categoryId)
    byCat.set(l.categoryId, prev ? { ...prev, amount: prev.amount + l.amount } : l)
  }
  return [...byCat.values()]
}

/** Fusionne `fromId` dans `intoId` : l'historique, les règles et le budget suivent. */
export function mergeCategory(data: AppData, fromId: string, intoId: string): AppData {
  if (fromId === intoId) return data
  const moved = remapCategory(data, new Set([fromId]), intoId)
  return {
    ...moved,
    categories: moved.categories
      .filter((c) => c.id !== fromId)
      .map((c) => (c.parentId === fromId ? { ...c, parentId: intoId } : c)),
  }
}

/** Déplace une catégorie sous un nouveau parent (ou au premier niveau). */
export function moveCategory(data: AppData, id: string, parentId: string | undefined): AppData {
  if (parentId && subtree(id, data.categories).has(parentId)) return data
  return { ...data, categories: data.categories.map((c) => (c.id === id ? { ...c, parentId } : c)) }
}
