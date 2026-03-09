export interface MondayBoardIds {
  auth: string
  operations: string
  schedule: string
  reports: string
  clients: string
  equipment: string
}

export interface MondayAuthColumns {
  role: string
  approval: string
  employeeStatus: string
  email: string
  phone: string
  assistantToggle: string
  calendarToggle: string
  clientsToggle: string
  teamToggle: string
  equipmentToggle: string
  aiAskToggle: string
  assignedClientsRelation: string
  assignedFacilitiesRelation: string
}

export interface MondayOperationsColumns {
  shortOperationId: string
  requestPurpose: string
  businessStatus: string
  clientRelation: string
  performerRelation: string
  performerEmailMirror: string
  scheduleRelation: string
  calendarEventMirror: string
  reportSequenceNumber: string
  executionStatusCheck: string
}

export interface MondayClientsColumns {
  facilitiesRelation: string
}

export interface MondayScheduleColumns {
  operationIdRef: string
  technicianRelation: string
  technicianEmailMirror: string
  technicianLegacyDropdown: string
  taskType: string
  plannedDate: string
  calendarEventRef: string
  scheduleStatus: string
  reportRelation: string
  calendarSyncStatus: string
  scheduleControlStatus: string
}

export interface MondayReportsColumns {
  operationIdRef: string
  scheduleRelation: string
  technicianEmailMirror: string
  flowStatus: string
  qaStatus: string
  executedAt: string
}

export interface MondayIdentityMirrors {
  operationsTechnicianEmail: string
  scheduleTechnicianEmail: string
  reportsTechnicianEmail: string
}

export interface MondayRelationKeys {
  authAssignedClients: string
  authAssignedFacilities: string
  operationsPerformer: string
  operationsSchedule: string
  scheduleTechnician: string
  scheduleReport: string
  reportsSchedule: string
  clientsFacilities: string
}

export interface MondayMappingInventory {
  boards: MondayBoardIds
  columns: {
    auth: MondayAuthColumns
    operations: MondayOperationsColumns
    clients: MondayClientsColumns
    schedule: MondayScheduleColumns
    reports: MondayReportsColumns
  }
  identityMirrors: MondayIdentityMirrors
  relations: MondayRelationKeys
}

export interface MondayMappingInventoryOverrides {
  boards?: Partial<MondayBoardIds>
  columns?: {
    auth?: Partial<MondayAuthColumns>
    operations?: Partial<MondayOperationsColumns>
    clients?: Partial<MondayClientsColumns>
    schedule?: Partial<MondayScheduleColumns>
    reports?: Partial<MondayReportsColumns>
  }
}

export const DEFAULT_MONDAY_MAPPING_INVENTORY: MondayMappingInventory = {
  boards: {
    auth: '1729562303',
    operations: '1798247340',
    schedule: '1783389345',
    reports: '1282241018',
    clients: '1284652674',
    equipment: '2119399147',
  },
  columns: {
    auth: {
      role: 'color_mm16fjq9',
      approval: 'color_mm167kpn',
      employeeStatus: 'status_mkmesmm9',
      email: 'email',
      phone: 'phone_mkn2my3a',
      assistantToggle: 'boolean_mm16vydm',
      calendarToggle: 'boolean_mm1680j8',
      clientsToggle: 'boolean_mm16kwda',
      teamToggle: 'boolean_mm1699jc',
      equipmentToggle: 'boolean_mm16e9yf',
      aiAskToggle: 'boolean_mm16vdk4',
      assignedClientsRelation: 'board_relation_mm172f5y',
      assignedFacilitiesRelation: 'board_relation_mm17fgf6',
    },
    operations: {
      shortOperationId: 'text_mknfh1x1',
      requestPurpose: 'dropdown_mkmm9qzh',
      businessStatus: 'color_mkngxc3y',
      clientRelation: 'connect_boards_mkmmhxe7',
      performerRelation: 'board_relation_mm17kvck',
      performerEmailMirror: 'lookup_mm174zqb',
      scheduleRelation: 'connect_boards_mkn82w54',
      calendarEventMirror: 'lookup_mm17kybq',
      reportSequenceNumber: 'numbers_mkmvq21y',
      executionStatusCheck: 'color_mm17daw5',
    },
    clients: {
      facilitiesRelation: 'board_relation_mm18w9fb',
    },
    schedule: {
      operationIdRef: 'text_mknfnj59',
      technicianRelation: 'board_relation_mm173tqk',
      technicianEmailMirror: 'lookup_mm17dqgp',
      technicianLegacyDropdown: 'dropdown_mkmmb2x',
      taskType: 'dropdown_mkn9g57j',
      plannedDate: 'date4',
      calendarEventRef: 'integration',
      scheduleStatus: 'status',
      reportRelation: 'connect_boards_mkn1c2vc',
      calendarSyncStatus: 'color_mm17pp1n',
      scheduleControlStatus: 'color_mm179n1t',
    },
    reports: {
      operationIdRef: 'text_mkmemh8m',
      scheduleRelation: 'connect_boards_1_mkmxq34v',
      technicianEmailMirror: 'lookup_mm171ygf',
      flowStatus: 'status_12',
      qaStatus: 'status6',
      executedAt: 'date4',
    },
  },
  identityMirrors: {
    operationsTechnicianEmail: 'lookup_mm174zqb',
    scheduleTechnicianEmail: 'lookup_mm17dqgp',
    reportsTechnicianEmail: 'lookup_mm171ygf',
  },
  relations: {
    authAssignedClients: 'board_relation_mm172f5y',
    authAssignedFacilities: 'board_relation_mm17fgf6',
    operationsPerformer: 'board_relation_mm17kvck',
    operationsSchedule: 'connect_boards_mkn82w54',
    scheduleTechnician: 'board_relation_mm173tqk',
    scheduleReport: 'connect_boards_mkn1c2vc',
    reportsSchedule: 'connect_boards_1_mkmxq34v',
    clientsFacilities: 'board_relation_mm18w9fb',
  },
}

function requireValue(label: string, value: string): void {
  if (!value.trim()) {
    throw new Error(`MAPPING_CONFIG_MISSING: ${label} is required`)
  }
}

function assertNoAmbiguousDuplicates(entries: Array<[string, string]>): void {
  const byValue = new Map<string, string[]>()

  for (const [label, value] of entries) {
    const key = value.trim()
    if (!key) continue
    const current = byValue.get(key) ?? []
    current.push(label)
    byValue.set(key, current)
  }

  for (const [value, labels] of byValue.entries()) {
    if (labels.length > 1) {
      throw new Error(`MAPPING_CONFIG_AMBIGUOUS: ${value} is shared by ${labels.join(', ')}`)
    }
  }
}

export function assertMondayMappingInventory(inventory: MondayMappingInventory): void {
  requireValue('boards.auth', inventory.boards.auth)
  requireValue('boards.operations', inventory.boards.operations)
  requireValue('boards.schedule', inventory.boards.schedule)
  requireValue('boards.reports', inventory.boards.reports)

  requireValue('columns.auth.email', inventory.columns.auth.email)
  requireValue('columns.auth.role', inventory.columns.auth.role)
  requireValue('columns.auth.approval', inventory.columns.auth.approval)
  requireValue('columns.auth.employeeStatus', inventory.columns.auth.employeeStatus)
  requireValue('columns.auth.assignedClientsRelation', inventory.columns.auth.assignedClientsRelation)
  requireValue('columns.auth.assignedFacilitiesRelation', inventory.columns.auth.assignedFacilitiesRelation)

  requireValue('columns.operations.shortOperationId', inventory.columns.operations.shortOperationId)
  requireValue('columns.operations.reportSequenceNumber', inventory.columns.operations.reportSequenceNumber)
  requireValue('columns.operations.requestPurpose', inventory.columns.operations.requestPurpose)
  requireValue('columns.operations.businessStatus', inventory.columns.operations.businessStatus)
  requireValue('columns.operations.clientRelation', inventory.columns.operations.clientRelation)
  requireValue('columns.operations.performerRelation', inventory.columns.operations.performerRelation)
  requireValue('columns.operations.performerEmailMirror', inventory.columns.operations.performerEmailMirror)
  requireValue('columns.operations.scheduleRelation', inventory.columns.operations.scheduleRelation)

  requireValue('columns.clients.facilitiesRelation', inventory.columns.clients.facilitiesRelation)

  requireValue('columns.schedule.operationIdRef', inventory.columns.schedule.operationIdRef)
  requireValue('columns.schedule.technicianRelation', inventory.columns.schedule.technicianRelation)
  requireValue('columns.schedule.technicianEmailMirror', inventory.columns.schedule.technicianEmailMirror)
  requireValue('columns.schedule.technicianLegacyDropdown', inventory.columns.schedule.technicianLegacyDropdown)
  requireValue('columns.schedule.taskType', inventory.columns.schedule.taskType)
  requireValue('columns.schedule.plannedDate', inventory.columns.schedule.plannedDate)
  requireValue('columns.schedule.calendarEventRef', inventory.columns.schedule.calendarEventRef)
  requireValue('columns.schedule.scheduleStatus', inventory.columns.schedule.scheduleStatus)
  requireValue('columns.schedule.reportRelation', inventory.columns.schedule.reportRelation)

  requireValue('columns.reports.operationIdRef', inventory.columns.reports.operationIdRef)
  requireValue('columns.reports.scheduleRelation', inventory.columns.reports.scheduleRelation)
  requireValue('columns.reports.technicianEmailMirror', inventory.columns.reports.technicianEmailMirror)

  if (inventory.identityMirrors.operationsTechnicianEmail !== inventory.columns.operations.performerEmailMirror) {
    throw new Error('MAPPING_CONFIG_AMBIGUOUS: operations technician email mirror mismatch')
  }

  if (inventory.identityMirrors.scheduleTechnicianEmail !== inventory.columns.schedule.technicianEmailMirror) {
    throw new Error('MAPPING_CONFIG_AMBIGUOUS: schedule technician email mirror mismatch')
  }

  if (inventory.identityMirrors.reportsTechnicianEmail !== inventory.columns.reports.technicianEmailMirror) {
    throw new Error('MAPPING_CONFIG_AMBIGUOUS: reports technician email mirror mismatch')
  }

  if (inventory.relations.authAssignedClients !== inventory.columns.auth.assignedClientsRelation) {
    throw new Error('MAPPING_CONFIG_AMBIGUOUS: auth assigned clients relation mismatch')
  }

  if (inventory.relations.authAssignedFacilities !== inventory.columns.auth.assignedFacilitiesRelation) {
    throw new Error('MAPPING_CONFIG_AMBIGUOUS: auth assigned facilities relation mismatch')
  }

  if (inventory.relations.operationsPerformer !== inventory.columns.operations.performerRelation) {
    throw new Error('MAPPING_CONFIG_AMBIGUOUS: operations performer relation mismatch')
  }

  if (inventory.relations.operationsSchedule !== inventory.columns.operations.scheduleRelation) {
    throw new Error('MAPPING_CONFIG_AMBIGUOUS: operations schedule relation mismatch')
  }

  if (inventory.relations.scheduleTechnician !== inventory.columns.schedule.technicianRelation) {
    throw new Error('MAPPING_CONFIG_AMBIGUOUS: schedule technician relation mismatch')
  }

  if (inventory.relations.scheduleReport !== inventory.columns.schedule.reportRelation) {
    throw new Error('MAPPING_CONFIG_AMBIGUOUS: schedule report relation mismatch')
  }

  if (inventory.relations.reportsSchedule !== inventory.columns.reports.scheduleRelation) {
    throw new Error('MAPPING_CONFIG_AMBIGUOUS: reports schedule relation mismatch')
  }

  if (inventory.relations.clientsFacilities !== inventory.columns.clients.facilitiesRelation) {
    throw new Error('MAPPING_CONFIG_AMBIGUOUS: clients facilities relation mismatch')
  }

  assertNoAmbiguousDuplicates([
    ['columns.operations.shortOperationId', inventory.columns.operations.shortOperationId],
    ['columns.operations.reportSequenceNumber', inventory.columns.operations.reportSequenceNumber],
    ['columns.schedule.operationIdRef', inventory.columns.schedule.operationIdRef],
    ['columns.reports.operationIdRef', inventory.columns.reports.operationIdRef],
  ])

  assertNoAmbiguousDuplicates([
    ['identityMirrors.operationsTechnicianEmail', inventory.identityMirrors.operationsTechnicianEmail],
    ['identityMirrors.scheduleTechnicianEmail', inventory.identityMirrors.scheduleTechnicianEmail],
    ['identityMirrors.reportsTechnicianEmail', inventory.identityMirrors.reportsTechnicianEmail],
  ])
}

export function buildMondayMappingInventory(overrides?: MondayMappingInventoryOverrides): MondayMappingInventory {
  const merged: MondayMappingInventory = {
    boards: {
      ...DEFAULT_MONDAY_MAPPING_INVENTORY.boards,
      ...(overrides?.boards ?? {}),
    },
    columns: {
      auth: {
        ...DEFAULT_MONDAY_MAPPING_INVENTORY.columns.auth,
        ...(overrides?.columns?.auth ?? {}),
      },
      operations: {
        ...DEFAULT_MONDAY_MAPPING_INVENTORY.columns.operations,
        ...(overrides?.columns?.operations ?? {}),
      },
      clients: {
        ...DEFAULT_MONDAY_MAPPING_INVENTORY.columns.clients,
        ...(overrides?.columns?.clients ?? {}),
      },
      schedule: {
        ...DEFAULT_MONDAY_MAPPING_INVENTORY.columns.schedule,
        ...(overrides?.columns?.schedule ?? {}),
      },
      reports: {
        ...DEFAULT_MONDAY_MAPPING_INVENTORY.columns.reports,
        ...(overrides?.columns?.reports ?? {}),
      },
    },
    identityMirrors: {
      ...DEFAULT_MONDAY_MAPPING_INVENTORY.identityMirrors,
    },
    relations: {
      ...DEFAULT_MONDAY_MAPPING_INVENTORY.relations,
    },
  }

  merged.identityMirrors.operationsTechnicianEmail = merged.columns.operations.performerEmailMirror
  merged.identityMirrors.scheduleTechnicianEmail = merged.columns.schedule.technicianEmailMirror
  merged.identityMirrors.reportsTechnicianEmail = merged.columns.reports.technicianEmailMirror

  merged.relations.authAssignedClients = merged.columns.auth.assignedClientsRelation
  merged.relations.authAssignedFacilities = merged.columns.auth.assignedFacilitiesRelation
  merged.relations.operationsPerformer = merged.columns.operations.performerRelation
  merged.relations.operationsSchedule = merged.columns.operations.scheduleRelation
  merged.relations.scheduleTechnician = merged.columns.schedule.technicianRelation
  merged.relations.scheduleReport = merged.columns.schedule.reportRelation
  merged.relations.reportsSchedule = merged.columns.reports.scheduleRelation
  merged.relations.clientsFacilities = merged.columns.clients.facilitiesRelation

  assertMondayMappingInventory(merged)
  return merged
}

