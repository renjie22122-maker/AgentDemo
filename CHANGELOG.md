# Changelog

[English](CHANGELOG.md) | [简体中文](CHANGELOG.zh-CN.md) · [Documentation](docs/README.md)

Entries below describe repository changes, not a semantic-version release series. Historical test counts belong to their recorded runs.

## 2026-10-06 — Engineering checks and preview sizing

Compiled backend with runtime assets, memory-domain routes, Unicode regression, package metadata without a license grant, bilingual link checks and compiled smoke tests. Preview adds content/window fitting and SVG support.

## 2026-10-06 — Memory scope controls

Separate storage and recall scopes; original-chat filtering, current-chat shortcut, searchable manual creation and bulk scope overrides/reset with revision and conflict checks.

## 2026-10-06 — Memory candidate review

Unlimited memory selection with sequential batches, separate candidate/deactivated states, and source-backed automatic review of existing opted-in candidates.

## 2026-10-05 — Memory management

Memory management: scoped bulk actions, readable source/status filters, incremental extraction, local episodes, configurable type-based decay, and maintained provenance links.

## 2026-10-05 — Interactive component results

Generic multi-result bridge with editable records, batch draft insertion, source validation and localized compact preview controls. No automatic message sending; unsent records remain local UI state.

## 2026-10-05 — Documentation consolidation

- Paired current English/Chinese guides for setup, architecture, interaction, tools, approval, security, memory, retrieval, scheduling and evaluation.
- Removed conflicting obsolete limits and descriptions from current guides.
- Preserved all 21 pre-consolidation Markdown documents in the [history archive](docs/history/README.md), with fixed-revision links.
- Separated historical experiment summaries from current behavior. No new benchmark or capability gain is claimed by this documentation change.

## 2026-10-05 — Amadeus rename · d663030

- Renamed the GitHub project, interface defaults, notifications and documentation.
- Added First-Start-Amadeus / Start-Amadeus launchers, keeping old names compatible.
- Retained data paths, internal compatibility identifiers and custom assistant names.
- Validation: 333 passed, 2 environment-dependent skips; typecheck/build passed.

## 2026-10-05 — Interactive preview and startup · 9e8dc67

- Default HTML preview, persistent preview/code switching, internal source scrolling and adjustable panel height.
- Local Mermaid diagrams with strict SVG rendering.
- First Start protects live dependencies; Quick Start warns about outdated build inputs.

## Earlier recorded changes

- f2e4863: media discovery across historical/current jobs and output types.
- 49a6a6a: scoped media references, inspection/export and browser popup continuity.
- 9552c9d: stable review prefixes, in-flight review deduplication and separate cache metrics.
- See [historical source documents](docs/history/README.md) for earlier implementation notes and dated experiments. Those documents may describe superseded behavior; use current guides for operation.
