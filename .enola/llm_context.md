# Architecture Snapshot

## Repository Map

| Module | Language | Symbols | Exported |
|--------|----------|---------|----------|
| `apps/signaling/src` | typescript | 16 | 2 |
| `apps/web` | typescript | 3 | 3 |
| `apps/web/app` | typescript | 4 | 3 |
| `apps/web/app/room/[roomId]` | typescript | 3 | 2 |
| `packages/protocol/src` | typescript | 9 | 9 |
| `packages/rtc-core/src` | typescript | 60 | 32 |
| `scripts` | typescript | 11 | 0 |

## Extraction Quality

- Files parsed: **26** / 40 seen (0 file(s) + 5 directory tree(s) skipped by ignore globs)
- Parse errors: 0

## Architecture Pattern

_No specific architecture pattern detected._

## Entry Points

- **handler**: `packages/rtc-core/src.fetchIceServers` (packages/rtc-core/src/ice.ts)
- **route** GET `/health` (scripts/e2e-ice.mjs)
- **route** GET `/ice` (scripts/e2e-ice.mjs)

## Routes

| Method | Path | File | Type |
|--------|------|------|------|
| GET | `/health` | `scripts/e2e-ice.mjs` |  |
| GET | `/ice` | `scripts/e2e-ice.mjs` |  |

## Dependency Rules

_No internal dependency rules detected._

## Critical Modules

_No cross-module dependencies detected._

---

*Generated at 2026-10-07T13:53:28Z in 190.4625ms. 186 facts, 10 insights.*
