import type { RuntimeOperationSnapshot } from '../../../types/scheduling'




const LINKAGE_LABEL: Record<string, string> = {
  resolved_unique_client_facility_link: 'מקושר ✓',
  ambiguous_client_facility_link: 'מספר אפשרויות',
  missing_client_facility_link: 'לא מקושר',
  canonical_schedule_email: 'אימייל לו"ז ✓',
  canonical_operations_email_fallback: 'אימייל אופרציות',
  legacy_schedule_dropdown_resolved: 'נפתן (legacy)',
  legacy_schedule_dropdown_fallback_pending: 'ממתין (legacy)',
  unlinked: 'לא מקושר',
}

function FieldRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value && value !== false && value !== 0) return null
  return (
    <div
      style={{
        display: 'flex',
        gap: 12,
        padding: '7px 0',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        alignItems: 'flex-start',
      }}
    >
      <div style={{ width: 140, fontSize: 11, color: '#666', flexShrink: 0, paddingTop: 1, textAlign: 'right' }}>
        {label}
      </div>
      <div style={{ flex: 1, fontSize: 13, color: '#ddd', wordBreak: 'break-all' }}>{value}</div>
    </div>
  )
}

export function OperationDetailModal({
  op,
  onClose,
}: {
  op: RuntimeOperationSnapshot
  onClose: () => void
}) {
  const isOpen = op.isOpen
  const mondayUrl = `https://upflow-team.monday.com/boards/1798247340/pulses/${op.id}`

  return (
    <>
      {/* Backdrop */}
      <div
        role="button"
        tabIndex={0}
        aria-label="סגור"
        onClick={onClose}
        onKeyDown={(e) => { if (e.key === 'Escape' || e.key === 'Enter') onClose() }}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(4px)',
          zIndex: 1000,
          cursor: 'pointer',
        }}
      />

      {/* Panel */}
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 'min(520px, 95vw)',
          maxHeight: '85vh',
          background: '#1a1a1a',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 14,
          boxShadow: '0 24px 80px rgba(0,0,0,0.8)',
          zIndex: 1001,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 12,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 4, wordBreak: 'break-word' }}>
              {op.title ?? op.requestPurposeRaw ?? 'ללא שם'}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              {op.shortOperationId && (
                <span style={{ fontSize: 11, color: '#888', background: 'rgba(255,255,255,0.06)', borderRadius: 4, padding: '1px 7px' }}>
                  {op.shortOperationId}
                </span>
              )}
              <span
                style={{
                  fontSize: 11,
                  borderRadius: 4,
                  padding: '1px 7px',
                  background: isOpen ? 'rgba(255,122,0,0.1)' : 'rgba(82,196,26,0.1)',
                  color: isOpen ? '#ff7a00' : '#52c41a',
                }}
              >
                {isOpen ? 'פתוח' : 'סגור'}
              </span>
              {op.operationCategory && (
                <span style={{ fontSize: 11, color: '#579bfc', background: 'rgba(87,155,252,0.1)', borderRadius: 4, padding: '1px 7px' }}>
                  {op.operationCategory}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="סגור"
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: 'none',
              borderRadius: 6,
              color: '#888',
              cursor: 'pointer',
              fontSize: 16,
              width: 28,
              height: 28,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 20px' }}>
          {/* תוכן הפניה — full text block */}
          {op.operationContent && (
            <div style={{ marginBottom: 14, padding: '10px 14px', background: 'rgba(255,255,255,0.04)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ fontSize: 11, color: '#666', marginBottom: 6 }}>תוכן הפניה</div>
              <div style={{ fontSize: 13, color: '#ccc', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{op.operationContent}</div>
            </div>
          )}
          {!op.operationContent && (
            <div style={{ marginBottom: 14, padding: '8px 14px', background: 'rgba(255,255,255,0.02)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.05)', fontSize: 12, color: '#555', fontStyle: 'italic' }}>
              תוכן הפניה יסונכרן לאחר הרצת הסנכרון הבאה
            </div>
          )}
          <FieldRow label="מטרת הפניה" value={op.requestPurposeRaw} />
          <FieldRow label="סטטוס עסקי" value={op.businessStatus} />
          <FieldRow label="סטטוס ביצוע" value={op.executionStatus} />
          <FieldRow label="סטטוס קבוצה" value={op.operationGroupStatus} />
          <FieldRow label="טכנאי מטפל" value={op.technicianNameHint ?? op.assignedTechnicianEmail ?? undefined} />
          <FieldRow
            label="קישור מתקן"
            value={LINKAGE_LABEL[op.facilityLinkageState] ?? op.facilityLinkageState}
          />
          <FieldRow
            label="קישור טכנאי"
            value={LINKAGE_LABEL[op.technicianLinkageState] ?? op.technicianLinkageState}
          />
          <FieldRow label="מזהה לקוח" value={op.clientItemId} />
          <FieldRow label="מזהה מתקן" value={op.facilityItemId} />
          <FieldRow label="מזהה אופרציה" value={op.id} />
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid rgba(255,255,255,0.07)',
            display: 'flex',
            gap: 8,
            justifyContent: 'flex-end',
          }}
        >
          <a
            href={mondayUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: 12,
              color: '#579bfc',
              textDecoration: 'none',
              border: '1px solid #579bfc40',
              borderRadius: 6,
              padding: '5px 14px',
              background: 'rgba(87,155,252,0.06)',
            }}
          >
            פתח במאנדיי ↗
          </a>
          <button
            onClick={onClose}
            style={{
              fontSize: 12,
              color: '#888',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 6,
              padding: '5px 14px',
              cursor: 'pointer',
            }}
          >
            סגור
          </button>
        </div>
      </div>
    </>
  )
}
