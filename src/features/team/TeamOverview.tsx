import { pendingTasks, technicians } from '../../data/teamData'

function countByPriority(priority: 'P1' | 'P2' | 'P3') {
  return pendingTasks.filter((task) => task.priority === priority).length
}

function taskCountForTechnician(technicianId: string) {
  return pendingTasks.filter((task) => task.technicianId === technicianId).length
}

export function TeamOverview() {
  return (
    <section>
      <div className="kpis">
        <div className="kpi">
          <strong>{pendingTasks.length}</strong>
          <span>משימות פתוחות</span>
        </div>
        <div className="kpi">
          <strong>{countByPriority('P1')}</strong>
          <span>משימות דחופות P1</span>
        </div>
        <div className="kpi">
          <strong>{technicians.length}</strong>
          <span>טכנאים פעילים</span>
        </div>
      </div>

      <div className="team-grid">
        {technicians.map((technician) => (
          <article className="panel tech-card" key={technician.id}>
            <h3>{technician.name}</h3>
            <p>{technician.role}</p>
            <p>משימות פתוחות: {taskCountForTechnician(technician.id)}</p>
            <span className="tech-chip" style={{ backgroundColor: `${technician.color}33` }}>
              מזהה: {technician.id}
            </span>
          </article>
        ))}
      </div>

      <div className="panel pending-panel">
        <h2>משימות בהמתנה (גל ראשון מהמיגרציה)</h2>
        <ol className="pending-list">
          {pendingTasks.map((task) => {
            const owner = technicians.find((technician) => technician.id === task.technicianId)

            return (
              <li key={task.id}>
                <strong>{task.title}</strong> | {owner?.name ?? task.technicianId} | {task.priority} | Monday #{task.mondayId}
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}
