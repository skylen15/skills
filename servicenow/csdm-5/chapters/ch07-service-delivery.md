# Chapter 7: Service Delivery

## Core Idea
Service Delivery models the operational systems, instances, applications, infrastructure, and dependencies that deliver service outcomes.

## Frameworks Introduced
- **Service Instance**: A specific operational occurrence of a service.
- **Application Service**: Operational view of an application or application stack.
- **Service Delivery Network**: Connected operational dependencies enabling delivery.

## Key Concepts
- **API**: Managed interface participating in delivery.
- **Application**: Runtime software entity.
- **AI Function / AI Application**: Runtime AI capability or application.
- **Operational Technology**: Operational and industrial technology components.
- **Infrastructure CI**: Hosts, networks, and other supporting configuration items.
- **Technology Management Service**: Service for managing technology.
- **Dynamic CI Group**: Query-driven grouping of CIs.

## Mental Models
- Use application services for operational visibility and impact.
- Use service instances when the same service has distinct operational occurrences.
- Model dependencies to support impact analysis, not merely inventory.

## Anti-patterns
- **Using one generic service record for every layer**: Hides operational distinctions.
- **Relationship overload**: Unprescribed links make impact analysis unreliable.
- **Inventory without service context**: Infrastructure alone does not explain delivered outcomes.

## Worked Example
A payment business application has production and test application services. Production depends on APIs, databases, hosts, and network components. Incidents on infrastructure can roll up through dependencies to the affected service instance.

## Key Takeaways
1. Model runtime objects and dependencies deliberately.
2. Separate application design from operational application services.
3. Use prescribed relationships for impact analysis.
4. Connect infrastructure to service outcomes.

## Connects To
- **Ch 8**: Consumption exposes delivered capability to consumers.
- **Ch 9**: Relationship semantics determine impact quality.
