# Task 008 - Reground AI Context on Live Snapshot Data

## Goal
Stop relying on legacy mock task arrays in AI context generation and use normalized snapshot entities.

## Scope
- Refactor AI context builder inputs to consume API snapshot outputs.
- Keep current chat UX and memory flow.

## Out of Scope
- LLM provider migration.
- Prompt strategy overhaul.

## Dependencies
- Tasks 002, 003, 005.

## Likely Files
- `src/features/assistant/OperationsAIAgentPage.tsx`
- `vite.config.ts` (if context endpoint/helper changes)
- `src/types/scheduling.ts`

## Validation Expectations
- AI summaries reflect live operation/schedule/report states.
- Context payload size remains bounded and predictable.
- No dependency on `src/data/teamData.ts` for core operational answers.
