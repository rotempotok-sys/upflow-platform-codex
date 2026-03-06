export type Priority = 'P1' | 'P2' | 'P3'

export interface Technician {
  id: string
  name: string
  role: string
  color: string
}

export interface PendingTask {
  id: string
  technicianId: string
  title: string
  mondayId: string
  priority: Priority
}

export interface Client {
  id: string
  name: string
  facilityType: string
  facilityStatus: string
  contractType: string
  openTickets: number
  city: string
  group: string
}

export interface FacilityColumnValue {
  id: string
  title: string
  type: string
  text: string
  value: string | null
}

export interface FacilityRecord extends Client {
  columns: FacilityColumnValue[]
}
