import type { AppData, Category, CategoryKind, Pot } from './types'

type Tree = [name: string, kind: CategoryKind, children: string[], extra?: Partial<Category>]

// Catégories de départ validées dans le cahier des charges ; Nina les ajuste dans l'app.
const TREE: Tree[] = [
  ['Logement', 'depense', ['Loyer', 'Énergie', 'Internet / téléphone', 'Assurance habitation']],
  ['Transport', 'depense', ['Transports en commun', 'Carburant', 'Entretien', 'VTC']],
  ['Courses', 'depense', ['Alimentation', 'Maison / hygiène']],
  ['Santé', 'depense', ['Médecin', 'Pharmacie', 'Mutuelle']],
  ['Abonnements', 'depense', ['Streaming', 'Apps', 'Sport']],
  ['Plaisir', 'depense', ['Resto', 'Sorties', 'Beauté', 'Vêtements', 'Loisirs', 'Cadeaux']],
  ['Commun', 'depense', ['Courses communes', 'Sorties communes']],
  ['Voyages', 'depense', []],
  ['Impôts et frais', 'depense', ['Impôts', 'Frais bancaires']],
  ['Épargne', 'epargne', ['Précaution', 'Projets', 'Provision impôts']],
  ['Investissement', 'investissement', ['PEA', 'Assurance-vie']],
  ['Revenus', 'revenu', ['Salaire', 'Freelance', 'Autres revenus']],
]

export function slug(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function defaultCategories(): Category[] {
  const out: Category[] = []
  for (const [name, kind, children] of TREE) {
    const id = 'cat-' + slug(name)
    out.push({ id, name, kind })
    for (const child of children) {
      out.push({
        id: `${id}--${slug(child)}`,
        name: child,
        kind,
        parentId: id,
        isSalary: child === 'Salaire' ? true : undefined,
      })
    }
  }
  return out
}

export function defaultPots(): Pot[] {
  return [
    { id: 'pot-non-reparti', name: 'Non réparti', type: 'non_reparti', priority: false },
    { id: 'pot-precaution', name: 'Précaution', type: 'precaution', goalMonths: 3, priority: true },
    { id: 'pot-impots', name: 'Impôts', type: 'impots', priority: true },
  ]
}

export function emptyData(): AppData {
  return {
    version: 1,
    accounts: [],
    categories: defaultCategories(),
    transactions: [],
    rules: [],
    budget: [],
    annualExpenses: [],
    pots: defaultPots(),
    potMovements: [],
    investments: [],
    rollovers: [],
    settings: { ruleTolerance: 10, alertThreshold: 80 },
    updatedAt: new Date().toISOString(),
  }
}
