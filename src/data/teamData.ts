import type { PendingTask, Technician } from '../types/scheduling'

export const technicians: Technician[] = [
  { id: 'nimrod', name: 'נמרוד כפרי', role: 'טכנאי ראשי', color: '#6366f1' },
  { id: 'or', name: 'אור ויינשטיין', role: 'טכנאי', color: '#0ea5e9' },
  { id: 'idan', name: 'עידן', role: 'טכנאי', color: '#10b981' },
  { id: 'ofir', name: 'אופיר', role: 'טכנאי', color: '#f59e0b' },
]

export const pendingTasks: PendingTask[] = [
  { id: 'p1', technicianId: 'nimrod', title: 'יסעור', mondayId: '3035', priority: 'P2' },
  { id: 'p2', technicianId: 'nimrod', title: 'גלעד', mondayId: '7451', priority: 'P2' },
  { id: 'p3', technicianId: 'or', title: 'נחל עוז', mondayId: '2665', priority: 'P1' },
  { id: 'p4', technicianId: 'idan', title: 'מקווה ישראל', mondayId: '7831', priority: 'P3' },
  { id: 'p5', technicianId: 'ofir', title: 'איילת השחר', mondayId: '2602', priority: 'P2' },
]
