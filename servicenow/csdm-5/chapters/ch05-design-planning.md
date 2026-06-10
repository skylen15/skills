# Chapter 5: Design and Planning

## Core Idea
Design & Planning describes business capabilities, business applications, and information objects before they become operational runtime services.

## Frameworks Introduced
- **Design-Time Architecture**: Model what the business needs and what applications are intended to do, independent of current runtime instances.

## Key Concepts
- **Business Capability**: What the business can do.
- **Business Application**: Logical application used to manage application portfolios.
- **Information Object**: Meaningful information used or produced by business activity.

## Mental Models
- Model capabilities as stable business abilities, not org charts or projects.
- Treat business applications as logical portfolio objects, not servers or deployments.
- Use information objects to clarify data dependencies.

## Anti-patterns
- **Using business applications as runtime CIs**: Mixes planning with operations.
- **Equating capability with department**: Capabilities should survive reorganizations.

## Worked Example
For a customer onboarding capability, model the logical onboarding business application and its customer-profile information object. Later, connect runtime application services that realize the design.

## Key Takeaways
1. Keep logical design distinct from runtime.
2. Connect applications to capabilities and information.
3. Use design records for planning and portfolio decisions.

## Connects To
- **Ch 6**: Build artifacts realize designs.
- **Ch 7**: Runtime services realize business applications.
