# Monday Mapping Inventory (Task 001)

## Purpose
Central inventory for board IDs, column IDs, mirrored identity fields, and relation keys required by Task 001 contracts.

## Source Baseline
- `docs/upflow_monday_system_spec.md`
- `docs/upflow_information_system_blueprint_he.md`
- Existing runtime defaults in `vite.config.ts` and `server/auth/*`

## Canonical Runtime Inventory
Implemented in:
- `server/monday/mappingInventory.ts`

Validation behavior:
- Missing required mapping -> `MAPPING_CONFIG_MISSING` (fail closed)
- Ambiguous/contradicting mapping -> `MAPPING_CONFIG_AMBIGUOUS` (fail closed)

## Board IDs
- Auth / Employees: `1729562303`
- Operations Control: `1798247340`
- Schedule / Employees Schedule: `1783389345`
- Reports / QA: `1282241018`
- Clients (snapshot context): `1284652674`
- Equipment (snapshot context): `2119399147`

## Critical Identity Mirrors
- Operations technician email mirror: `lookup_mm174zqb`
- Schedule technician email mirror: `lookup_mm17dqgp`
- Reports technician email mirror: `lookup_mm171ygf`

## Critical Relation Keys
- Auth assigned clients: `board_relation_mm172f5y`
- Auth assigned facilities: `board_relation_mm17fgf6`
- Operations performer: `board_relation_mm17kvck`
- Operations schedule relation: `connect_boards_mkn82w54`
- Schedule technician: `board_relation_mm173tqk`
- Schedule report relation: `connect_boards_mkn1c2vc`
- Reports schedule relation: `connect_boards_1_mkmxq34v`

## Critical Mapping Assumptions (Explicit)
1. Technician visibility is anchored to mirrored email fields, not free text.
2. Operation linkage is anchored by explicit operation-id reference fields and board relations.
3. Reports must link back to schedule and operation identifiers to be treated as authoritative.
4. Calendar is a scheduling layer; not a primary identity source.

## Notes for Future Tasks
- Task 002+ should reuse this inventory for new endpoints instead of duplicating string literals.
- If mappings diverge by environment, provide explicit env overrides and keep validation enabled.

