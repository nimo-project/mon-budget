// Tous les montants sont en centimes (entiers). Négatif = sortie d'argent.
// Les dates sont des chaînes ISO "AAAA-MM-JJ".

export type BankId = 'boursobank' | 'sg' | 'revolut' | 'autre'
export type AccountKind = 'courant' | 'epargne' | 'investissement'

export interface Account {
  id: string
  name: string
  bank: BankId
  kind: AccountKind
  /** Catégorie appliquée par défaut aux dépenses de ce compte (compte « enveloppe »). */
  purposeCategoryId?: string
  /** Compte sur lequel arrive le salaire : sert à détecter le début des périodes. */
  isSalaryAccount?: boolean
  /** Solde au jour précédant la première opération suivie, pour calculer le solde actuel. */
  openingBalance: number
  archived?: boolean
}

export type CategoryKind = 'depense' | 'revenu' | 'epargne' | 'investissement'

export interface Category {
  id: string
  name: string
  parentId?: string
  kind: CategoryKind
  /** Marque la catégorie qui identifie le salaire (début de période). */
  isSalary?: boolean
  archived?: boolean
}

export interface Split {
  categoryId: string
  amount: number
}

export type TxSource = 'import' | 'manuel'

export interface Transaction {
  id: string
  accountId: string
  date: string
  amount: number
  /** Libellé brut tel qu'il apparaît sur le relevé. */
  label: string
  note?: string
  categoryId?: string
  /** Découpage après coup : la somme des parts vaut `amount`. */
  splits?: Split[]
  tags: string[]
  source: TxSource
  /** Empreinte pour détecter les doublons à l'import. */
  importKey?: string
  /** Identifiant partagé par les deux jambes d'un virement entre comptes de Nina. */
  transferId?: string
  /** Remboursement : id de la dépense d'origine qu'il réduit. */
  reimbursesId?: string
  /** true tant que la ligne doit passer par l'écran « À vérifier ». */
  toReview: boolean
  /** Règle qui a catégorisé la ligne, le cas échéant. */
  ruleId?: string
  /** Abonnement connu revenu avec un nouveau montant : Nina valide la mise à jour de la règle. */
  priceAlert?: { ruleId: string; previousAmount: number }
  /** Opération du compte épargne laissée volontairement dans « Non réparti ». */
  potSettled?: boolean
  /** Saisie manuelle rapprochée d'une ligne importée (la manuelle est alors masquée). */
  matchedTxId?: string
}

export interface Rule {
  id: string
  /** Libellé normalisé à rechercher (contenu dans le libellé). */
  pattern: string
  /** Montant attendu en centimes ; absent = règle sur le libellé seul. */
  amount?: number
  categoryId: string
  createdAt: string
}

export type BudgetKind = 'fixe' | 'variable' | 'epargne' | 'investissement'

export interface BudgetLine {
  id: string
  categoryId: string
  /** Montant prévu par période, en centimes positifs. */
  amount: number
  kind: BudgetKind
}

export interface AnnualExpense {
  id: string
  name: string
  amount: number
  /** Mois d'échéance, 1-12. */
  dueMonth: number
  categoryId?: string
}

export type PotType = 'precaution' | 'projet' | 'impots' | 'non_reparti'

export interface Pot {
  id: string
  name: string
  type: PotType
  goalAmount?: number
  goalDate?: string
  /** Pour la précaution : objectif en mois de frais fixes. */
  goalMonths?: number
  priority: boolean
  archived?: boolean
}

export interface PotMovement {
  id: string
  date: string
  potId: string
  /** Positif = versement dans la cagnotte, négatif = retrait. */
  amount: number
  note?: string
  transactionId?: string
}

export interface InvestmentGoal {
  id: string
  name: string
  /** Catégorie d'investissement suivie (versements). */
  categoryId: string
  monthlyGoal?: number
}

export type RolloverAction = 'garder' | 'extra' | 'epargne'

export interface RolloverDecision {
  /** Date de début de la période qui se termine. */
  periodStart: string
  categoryId: string
  amount: number
  action: RolloverAction
  potId?: string
}

export interface Settings {
  /** Tolérance en centimes pour les règles libellé + montant. */
  ruleTolerance: number
  /** Seuil d'alerte des enveloppes, en pourcentage. */
  alertThreshold: number
  /** Début de la première période budgétée : pas de reste à décider avant. */
  budgetSince?: string
}

export interface AppData {
  version: 1
  accounts: Account[]
  categories: Category[]
  transactions: Transaction[]
  rules: Rule[]
  budget: BudgetLine[]
  annualExpenses: AnnualExpense[]
  pots: Pot[]
  potMovements: PotMovement[]
  investments: InvestmentGoal[]
  rollovers: RolloverDecision[]
  settings: Settings
  updatedAt: string
}
