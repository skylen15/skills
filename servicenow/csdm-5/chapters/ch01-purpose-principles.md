# Chapter 1: Purpose, Vision, and Principles

## Core Idea
CSDM is ServiceNow's prescriptive, shared service-related data model. It standardizes definitions, tables, references, and relationships so products can work together and reporting can remain consistent.

## Frameworks Introduced
- **Common Service Data Model (CSDM)**: Shared definitions plus prescriptive modeling guidance.
  - When to use: Designing or governing service-related data on the ServiceNow AI Platform.
  - How: Prefer out-of-box tables, agreed definitions, and prescribed relationships.
- **Common Service + Data Model**: Separate the service-management meaning from the platform data structure supporting it.
- **Digital Value Network**: Connect strategy, design, build, delivery, consumption, and portfolios through shared data.

## Key Concepts
- **CSDM is not a product**: It is guidance using mostly out-of-box platform structures.
- **Prescriptive relationships**: Standard relationship types that enable cross-product use cases.
- **Shared data model collaboration**: Product areas contribute to and consume one common model.
- **Data governance**: Ownership and process make modeled data valuable.

## Mental Models
- Use CSDM as a reference architecture, not an implementation project plan.
- Treat customization as debt when an out-of-box CSDM structure supports the requirement.
- Model for reporting and product interoperability, not only one team's workflow.

## Anti-patterns
- **Treating CSDM as an automatic fix**: It cannot repair weak ownership, process, or source data.
- **Creating bespoke service classes**: Custom classifications reduce interoperability.
- **Modeling without governance**: Populated tables alone do not create reliable outcomes.

## Worked Example
A team needs service reporting across ITSM, ITOM, and SPM. Instead of creating a custom service table, it maps concepts to CSDM tables, uses prescribed relationships, assigns owners, then validates reports across products.

## Key Takeaways
1. Start with shared definitions.
2. Prefer out-of-box tables and relationships.
3. Design for multiple products and reporting needs.
4. Pair modeling with governance.

## Connects To
- **Ch 2**: Lifecycle and domains organize the shared model.
- **Ch 10**: Adoption stages turn principles into a roadmap.
