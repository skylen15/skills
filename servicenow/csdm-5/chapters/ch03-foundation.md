# Chapter 3: Foundation Domain

## Core Idea
Foundation data supplies reusable context for all CSDM domains. Stable, governed foundation records prevent duplicate meanings and inconsistent reporting.

## Frameworks Introduced
- **Foundation Domain**: Shared reference data and lifecycle capabilities used across CSDM.
- **CSDM Life Cycle**: Standard lifecycle stages and statuses for supported records.
- **Common Data**: Reusable organizational, location, team, knowledge, and related records.

## Key Concepts
- **Value Stream**: End-to-end sequence delivering value.
- **Business Process**: Structured activities producing an outcome.
- **Contract**: Agreement context connected to products or services.
- **Product Model**: Definition of a product, separate from individual instances.
- **Product Feature**: Product capability or characteristic.
- **SBOM**: Software component inventory.
- **CMDB Group**: Grouping of configuration items.
- **Location and Team**: Shared context used throughout the model.

## Mental Models
- Treat product models as definitions and installed/deployed items as instances.
- Use common data once, then reference it.
- Govern lifecycle values centrally.

## Anti-patterns
- **Duplicating foundation records per domain**: Creates conflicting identities.
- **Confusing models with instances**: Breaks product and asset traceability.
- **Inventing local lifecycle statuses**: Prevents consistent reporting.

## Worked Example
Define one product model and its features. Link contracts, owning teams, locations, and lifecycle status to that shared definition. Runtime instances reference the definition rather than duplicating it.

## Key Takeaways
1. Establish foundation data before advanced domain modeling.
2. Separate definitions from instances.
3. Standardize lifecycle states and ownership.
4. Reuse common references.

## Connects To
- **Ch 4**: Strategy relies on foundation entities.
- **Ch 7**: Runtime delivery references products, teams, and lifecycle data.
