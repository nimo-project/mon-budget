import type { EnvelopeStatus } from '../domain/budget'
import { subtree } from '../domain/categories'
import { periodSpendingRows } from '../domain/charts'
import { periodLabel, type Period } from '../domain/periods'
import { useStore } from '../state/store'
import { TransactionsSheet } from './TransactionsSheet'

/** Opérations qui alimentent une ligne de budget sur la période, avec la part comptée dans la ligne. */
export function EnvelopeDetail({ envelope, period, onClose }: { envelope: EnvelopeStatus; period: Period; onClose: () => void }) {
  const { data } = useStore()
  const ids = subtree(envelope.line.categoryId, data.categories)
  const rows = periodSpendingRows(data, period, (id) => ids.has(id))
  return <TransactionsSheet title={envelope.name} subtitle={`Période ${periodLabel(period)}`} rows={rows} onClose={onClose} />
}
