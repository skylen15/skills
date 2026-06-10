# Chapter 2: End-to-End Lifecycle and Domains

## Core Idea
CSDM 5 organizes data around an end-to-end service lifecycle. Domains group entities by the activity they support, while shared foundation data connects every stage.

## Frameworks Introduced
- **End-to-End Service Lifecycle**: Ideate and strategize, design and plan, build and integrate, deliver, consume, and manage portfolios.
- **CSDM Domains**: Functional groupings of the model aligned to lifecycle activity.
- **Enterprise and Operational Service Model**: Combines a common data model with common service-delivery concepts.

## Key Concepts
- **Foundation**: Shared entities used across domains.
- **Ideation & Strategy**: Intent, priorities, goals, and planning.
- **Design & Planning**: Business architecture and application design.
- **Build & Integration**: Components produced and integrated through delivery pipelines.
- **Service Delivery**: Operational instances, applications, infrastructure, and dependencies.
- **Service Consumption**: Customer-facing services and offerings.
- **Manage Portfolio**: Grouping and governance of portfolio elements.

## Mental Models
- Think lifecycle first, table second.
- Use foundation data as connective tissue, not a dumping ground.
- Distinguish design-time intent from runtime delivery.

## Anti-patterns
- **Using domains as organizational silos**: Domains describe model activity, not team ownership boundaries.
- **Skipping lifecycle transitions**: Missing links between strategy, design, build, and runtime break traceability.

## Worked Example
A new digital product begins as an idea and planning item, becomes a business application and designed service, produces SDLC components, runs through application services, and is consumed through business service offerings. Portfolio records group and govern it.

## Key Takeaways
1. Place records according to lifecycle role.
2. Link adjacent lifecycle stages.
3. Keep design-time and runtime objects distinct.
4. Use common foundation records across domains.

## Connects To
- **Ch 3**: Foundation entities support every domain.
- **Ch 4–8**: Each lifecycle domain has specific modeling responsibilities.
