interface NotAuthorizedScreenProps {
  message?: string
  onBackToLogin: () => void
}

export function NotAuthorizedScreen({ message, onBackToLogin }: NotAuthorizedScreenProps) {
  return (
    <main className="app-shell" dir="rtl">
      <section className="panel" style={{ maxWidth: 560, margin: '12vh auto', padding: '2rem' }}>
        <h1>אין הרשאת גישה למערכת</h1>
        <p>{message || 'האימייל אינו מוגדר בלוח ההרשאות של Upflow.'}</p>
        <button type="button" className="tab" onClick={onBackToLogin}>
          חזרה למסך התחברות
        </button>
      </section>
    </main>
  )
}
