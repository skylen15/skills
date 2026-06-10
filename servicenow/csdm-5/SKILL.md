---
name: csdm-5
description: "Knowledge base from \"CSDM 5 White Paper\" by Scott Lemm and Rob Koeten. Use when applying CSDM 5 frameworks for ServiceNow service modeling, lifecycle domains, CMDB relationships, adoption, migration, or governance."
allowed-tools:
  - Read
  - Grep
argument-hint: [topic, framework name, or chapter number]
---

# CSDM 5 White Paper
**Authors**: Scott Lemm, Rob Koeten | **Pages**: 63 | **Chapters**: 12 | **Generated**: 2026-06-10

## How to Use This Skill

- Without arguments: load core frameworks below.
- With a topic: use Topic Index, then read relevant chapter.
- With chapter: read requested `chapters/chNN-*.md`.
- For quick decisions: read `cheatsheet.md`.

## Core Frameworks & Mental Models

### CSDM Purpose
- Use CSDM as prescriptive shared data-model guidance, not a product, process guide, report set, or automatic remediation tool.
- Prefer out-of-box tables, agreed definitions, prescribed references, and prescribed relationships.
- Model for cross-product interoperability and reporting, not one isolated workflow.
- Pair every model expansion with ownership, governance, and measurable outcomes.

### End-to-End Lifecycle
- Trace service-related data through **Ideation & Strategy → Design & Planning → Build & Integration → Service Delivery → Service Consumption → Manage Portfolio**.
- Use **Foundation** as shared context across every domain.
- Keep intent, logical design, build artifacts, runtime delivery, and consumer value distinct but connected.

### Key Distinctions
- **Business Capability** = what business can do.
- **Business Application** = logical application used for planning and portfolio decisions.
- **SDLC Component** = source/build artifact.
- **Application Service** = operational application stack.
- **Business Service** = enduring value delivered to consumers.
- **Business Service Offering** = differentiated commitment or consumption choice.
- **Catalog Item** = request mechanism, not service itself.
- **Product Model** = reusable definition; instance = actual operational or physical occurrence.

### Relationship Judgment
- Use a reference for direct ownership or context.
- Use a prescribed CI relationship for dependency or topology.
- Use portfolios/groups for governance and grouping.
- Preserve relationship type and direction; validate using real impact and reporting questions.
- Prove an out-of-box semantic gap before creating custom tables or relationships.

### Adoption and Migration
- Adopt incrementally: **Foundation → Crawl → Walk → Run → Fly**.
- Advance only when current-stage data is governed and produces named outcomes.
- Migrate through **Assess → Map semantics → Pilot → Migrate in waves → Validate consumers**.
- Never automate or bulk-transform before quality and semantics are stable.

### Governance
- Start with decisions, workflows, and reports; derive minimum required data.
- Assign accountable owners and operational stewards.
- Measure correctness, completeness, uniqueness, freshness, and relationship validity.
- Avoid overmodeling: data without decision value creates maintenance cost.

## Chapter Index

| # | Title | Key Frameworks |
|---|---|---|
| [ch01](chapters/ch01-purpose-principles.md) | Purpose, Vision, and Principles | CSDM, Digital Value Network |
| [ch02](chapters/ch02-lifecycle-domains.md) | End-to-End Lifecycle and Domains | Lifecycle, Domains |
| [ch03](chapters/ch03-foundation.md) | Foundation Domain | Common Data, Definition vs Instance |
| [ch04](chapters/ch04-ideation-strategy.md) | Ideation and Strategy | Strategy-to-Execution |
| [ch05](chapters/ch05-design-planning.md) | Design and Planning | Design-Time Architecture |
| [ch06](chapters/ch06-build-integration.md) | Build and Integration | Build-to-Run |
| [ch07](chapters/ch07-service-delivery.md) | Service Delivery | Service Instance, Application Service |
| [ch08](chapters/ch08-consumption-portfolio.md) | Consumption and Portfolio | Service / Offering |
| [ch09](chapters/ch09-tables-relationships.md) | Tables and Relationships | Prescriptive Relationships |
| [ch10](chapters/ch10-adoption-stages.md) | Adoption Stages | Foundation-to-Fly |
| [ch11](chapters/ch11-migration.md) | Migration | Assess-to-Validate |
| [ch12](chapters/ch12-governance-decisions.md) | Governance and Decisions | Use-Case-Driven Governance |

## Topic Index

- **Adoption stages** → ch10
- **Application Service** → ch07, ch09
- **Business Application** → ch05, ch07
- **Business Capability** → ch05
- **Business Service / Offering** → ch08
- **Catalog Item** → ch08
- **CSDM principles** → ch01
- **Domains and lifecycle** → ch02
- **Foundation data** → ch03
- **Governance** → ch12
- **Ideation and strategy** → ch04
- **Migration** → ch11
- **Prescriptive relationships** → ch09
- **SDLC Component** → ch06
- **Service Delivery** → ch07

## Supporting Files

- [glossary.md](glossary.md) — key terms
- [patterns.md](patterns.md) — actionable modeling patterns
- [cheatsheet.md](cheatsheet.md) — decision rules and tables

## Scope & Limits

Derived from CSDM 5 White Paper. PDF layout-aware extraction failed from memory exhaustion; content used text extraction. Consult current ServiceNow documentation for release-specific implementation details.
