interface BlockedScreenProps {
  message?: string
  onLogout: () => Promise<void> | void
}

export function BlockedScreen({ message, onLogout }: BlockedScreenProps) {
  return (
    <main className="app-shell" dir="rtl">
      <section className="panel" style={{ maxWidth: 560, margin: '12vh auto', padding: '2rem' }}>
        <h1>החשבון חסום</h1>
        <p>{message || 'הגישה למערכת חסומה. יש לפנות למנהל המערכת.'}</p>
        <button type="button" className="tab" onClick={() => void onLogout()}>
          התנתקות
        </button>
      </section>
    </main>
  )
}
