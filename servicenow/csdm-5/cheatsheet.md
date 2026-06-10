# CSDM 5 Decision Cheatsheet

## Choose the Entity

| Need | Use | Avoid |
|---|---|---|
| Describe what business can do | Business Capability | Department or project |
| Manage logical application portfolio | Business Application | Runtime CI |
| Represent operational application stack | Application Service | Business Application alone |
| Expose enduring consumer value | Business Service | Catalog item |
| Differentiate commitments/channels | Business Service Offering | Duplicate service |
| Enable a request | Catalog Item linked to offering | Treating catalog item as service |
| Represent source/build artifact | SDLC Component | Application Service |
| Group services for governance | Service Portfolio | Runtime dependency map |

## Relationship Decision

1. Same entity needs direct ownership/context? Use reference field.
2. Two CIs have dependency/topology semantics? Use prescribed CI relationship.
3. Need grouping/governance? Use portfolio or group structure.
4. No out-of-box fit? Prove semantic gap before customization.

## Lifecycle Decision

| Question | Domain |
|---|---|
| Why invest/change? | Ideation & Strategy |
| What capability/application is designed? | Design & Planning |
| What component is built? | Build & Integration |
| What runs and depends on what? | Service Delivery |
| What does consumer receive? | Service Consumption |
| How are items grouped/governed? | Manage Portfolio |
| What shared context supports all? | Foundation |

## Adoption Gate

| Stage | Advance only when |
|---|---|
| Foundation | Owners, definitions, lifecycle, common data governed |
| Crawl | Essential applications/services support named use cases |
| Walk | Consumption and design links produce reporting value |
| Run | Operational dependencies support reliable impact |
| Fly | Cross-lifecycle automation and optimization are trustworthy |

## Fast Rules

- If model cannot answer named decision, reduce or revise it.
- If object is logical/design-time, do not use it as runtime CI.
- If relationship direction is untested, impact analysis is untrusted.
- If catalog item is called a service, separate request channel from value.
- If migration maps labels only, stop and map semantics.
- If no owner exists, do not expand scope.
- If automation scales before quality stabilizes, it scales defects.
