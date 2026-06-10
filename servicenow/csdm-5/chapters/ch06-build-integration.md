# Chapter 6: Build and Integration

## Core Idea
Build & Integration connects development and delivery artifacts to the designs and operational services they implement.

## Frameworks Introduced
- **DevOps Change Data Model**: Shared structure connecting development activity, changes, and operational impact.
- **Build-to-Run Traceability**: Link SDLC components and AI systems to deployed services.

## Key Concepts
- **SDLC Component**: Version-controlled component managed through software delivery.
- **AI System Digital Asset**: Governed digital asset representing an AI system.
- **Change Traceability**: Connection from delivered change to affected runtime services.

## Mental Models
- Treat source/build components as distinct from deployed runtime instances.
- Link delivery artifacts to the services they change.
- Include AI systems in lifecycle and governance models.

## Anti-patterns
- **Stopping traceability at deployment**: Operations cannot assess service impact.
- **Modeling repositories as application services**: Build artifacts and runtime services have different roles.

## Worked Example
A source repository is represented as an SDLC component linked to a business application. A release changes an application service; that relationship supports change risk and operational impact analysis.

## Key Takeaways
1. Connect development artifacts to design and runtime.
2. Preserve distinction between component and deployed service.
3. Model AI systems as governed digital assets.

## Connects To
- **Ch 7**: Delivery domain contains runtime objects affected by builds.
