# Chapter 11: Migrating into CSDM

## Core Idea
Migration into CSDM is a governed mapping and remediation effort, not a table-copy exercise.

## Frameworks Introduced
- **Assess → Map → Pilot → Migrate → Validate**: Controlled migration workflow.

## Key Concepts
- **Source inventory**: Existing tables, classes, records, relationships, integrations, and consumers.
- **Semantic mapping**: Map meaning and use, not only field names.
- **Pilot scope**: Small representative service slice used to prove mappings.
- **Validation**: Confirm workflows, reporting, integrations, and impact analysis after migration.

## Mental Models
- Preserve business meaning while moving toward standard structures.
- Prioritize records supporting high-value use cases.
- Retire legacy structures only after consumers move.

## Anti-patterns
- **Blind bulk transformation**: Moves defects and wrong semantics.
- **Mapping by label alone**: Similar names can represent different concepts.
- **Ignoring downstream consumers**: Breaks reports, integrations, and workflows.

## Worked Example
Inventory custom service records and consumers. Map each concept to CSDM entities, pilot one critical service, reconcile relationships, validate incidents and reports, then migrate in waves with rollback criteria.

## Key Takeaways
1. Inventory before mapping.
2. Map semantics and use cases.
3. Pilot representative slices.
4. Validate all consumers.
5. Migrate incrementally.

## Connects To
- **Ch 9**: Correct table and relationship semantics drive mapping.
- **Ch 10**: Adoption maturity determines migration sequence.
