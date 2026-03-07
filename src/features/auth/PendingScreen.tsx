interface PendingScreenProps {
  onLogout: () => Promise<void> | void
}

export function PendingScreen({ onLogout }: PendingScreenProps) {
  return (
    <main className="app-shell" dir="rtl">
      <section className="panel" style={{ maxWidth: 560, margin: '12vh auto', padding: '2rem' }}>
        <h1>החשבון ממתין לאישור</h1>
        <p>ברגע שאישור הגישה יעודכן במערכת, ניתן יהיה להיכנס.</p>
        <button type="button" className="tab" onClick={() => void onLogout()}>
          התנתקות
        </button>
      </section>
    </main>
  )
}
