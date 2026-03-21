import { useMemo, useState } from 'react'
import type { RuntimeOperationSnapshot, RuntimeUserSnapshot } from '../../../types/scheduling'
import { OperationDetailModal } from './OperationDetailModal'
import { GenericOpTable } from './GenericOpTable'

export function SalesTab({ operationsData, usersData = [] }: { operationsData: RuntimeOperationSnapshot[]; usersData?: RuntimeUserSnapshot[] }) {
  const [selectedOp, setSelectedOp] = useState<RuntimeOperationSnapshot | null>(null)
  const openOps = useMemo(
    () => operationsData.filter(o => (o.operationCategory === 'מכירות' || o.requestPurposeRaw?.includes('מכירות')) && o.isOpen),
    [operationsData]
  )
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#ddd' }}>פניות מכירות פתוחות</span>
        <span style={{ fontSize: 11, color: '#666', background: 'rgba(255,255,255,0.06)', borderRadius: 10, padding: '1px 8px' }}>{openOps.length}</span>
      </div>
      <GenericOpTable ops={openOps} usersData={usersData} onRowClick={setSelectedOp} statusLabel="סטטוס מכירה" statusField="salesStatus" />
      {selectedOp && <OperationDetailModal op={selectedOp} onClose={() => setSelectedOp(null)} />}
    </>
  )
}
