# Monday Mapping Inventory (V1 Canonical Alignment)

## Purpose
Central inventory for board IDs, column IDs, mirrored identity fields, relation keys, and V1 canonical field semantics.

## Source Baseline
- `docs/upflow_operational_model_v1_he.md` (canonical)
- `docs/upflow_monday_system_spec.md`
- `docs/upflow_information_system_blueprint_he.md`
- Runtime defaults in `server/monday/mappingInventory.ts`

## Validation behavior
- Missing required mapping -> `MAPPING_CONFIG_MISSING` (fail closed)
- Ambiguous/contradicting mapping -> `MAPPING_CONFIG_AMBIGUOUS` (fail closed)

## Board IDs
- Auth / Employees: `1729562303`
- Operations Control: `1798247340`
- Schedule / Employees Schedule: `1783389345`
- Reports / QA: `1282241018`
- Clients: `1284652674`
- Equipment: `2119399147`

## Canonical runtime entities (V1)
- `operation` (primary business entity)
- `user`
- `assignment`
- `schedule_entry`
- `report`
- `facility`
- `client`

## Operation field classification
- `operation_id` (`item.id`): `canonical`
- `short_operation_id` (`text_mknfh1x1`): `canonical`
- `request_purpose_raw` (`dropdown_mkmm9qzh`): `raw_source`
- `operation_category` (normalized from `request_purpose_raw`): `derived`
- `business_status` (`color_mkngxc3y`): `canonical`
- `execution_status_check` (`color_mm17daw5`): `raw_source` (secondary operational status)
- `assigned_technician_email` (`lookup_mm174zqb`): `canonical`
- `performer_relation` (`board_relation_mm17kvck`): `canonical`
- `client_relation` (`connect_boards_mkmmhxe7`): `canonical`
- `facility_item_id`: `derived` (nullable by rule)

## Technician linkage classification
- Canonical target linkage:
  - `board_relation_mm173tqk` (schedule technician relation): `canonical`
  - `lookup_mm17dqgp` (schedule technician email mirror): `canonical`
- Current runtime canonical source for operation assignment:
  - `lookup_mm174zqb` (operations technician email mirror): `canonical`
- Temporary fallback:
  - `dropdown_mkmmb2x` (legacy schedule technician dropdown): `legacy_fallback`

## Facility linkage rules (explicit)
1. If operation has no client relation -> `facility_item_id = null` and linkage state `no_client_link`.
2. If client relation resolves to exactly one client but facility cannot be resolved deterministically -> `facility_item_id = null` and linkage state `client_linked_facility_pending`.
3. If client relation is ambiguous (>1) -> `facility_item_id = null` and linkage state `ambiguous_client_link`.
4. Ambiguity must remain explicit; no silent heuristic fallback.

## Operation category normalization (explicit)
Derived from `request_purpose_raw` (`dropdown_mkmm9qzh`) into:
- `Service`
- `Logistics`
- `Project`
- `Procurement`
- `Sales`
- `Repair`
- `General`

## Notes
- Clients->Facilities canonical relation column: oard_relation_mm18w9fb on clients board (1284652674).
- Operation facility derivation states: esolved_unique_client_facility_link, mbiguous_client_facility_link, missing_client_facility_link.
- Planned datetime precedence: calendar event datetime -> Monday date4 -> missing.
- V1 requires operation-centric model and explicit linkage metadata.
- UI heuristics must not be primary where canonical runtime projection fields exist.
- Full projection/exceptions wiring remains for Task 011+.


- Runtime persistence: clients.facilities_relation_ids stores values from Monday oard_relation_mm18w9fb (clients->facilities relation).
