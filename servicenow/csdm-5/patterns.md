# Patterns

## Lifecycle Traceability
**When to use**: Need to explain why a runtime service exists or what business outcome it supports.  
**How**: Link strategy → design → build → delivery → consumption → portfolio records.  
**Trade-offs**: High decision value; requires ownership across domains.

## Definition Versus Instance
**When to use**: Modeling products, applications, services, or deployed technology.  
**How**: Store reusable definition separately; make operational or physical occurrences reference it.  
**Trade-offs**: Reduces duplication; introduces explicit links that must be governed.

## Service and Offering
**When to use**: Consumers receive variants of one enduring service.  
**How**: Model service as value proposition; offerings capture different commitments or channels; catalog items request offerings.  
**Trade-offs**: Improves consumption reporting; unnecessary offerings add maintenance.

## Design-to-Run
**When to use**: Need portfolio planning plus operational impact.  
**How**: Model business application for logical design; connect application services representing runtime.  
**Trade-offs**: Preserves distinct concerns; teams must maintain realization links.

## Build-to-Run
**When to use**: Need change risk, deployment traceability, or DevOps integration.  
**How**: Link SDLC components and releases to affected application services.  
**Trade-offs**: Enables change impact; depends on automated integration quality.

## Prescribed Dependency
**When to use**: Need reliable service impact analysis.  
**How**: Select prescribed relationship type and direction; test traversal using real failure scenarios.  
**Trade-offs**: Strong analytics; relationship semantics require training and controls.

## Staged Adoption
**When to use**: Starting or expanding CSDM.  
**How**: Foundation → Crawl → Walk → Run → Fly; gate advancement on governed outcomes.  
**Trade-offs**: Slower initial scope; lowers migration risk and produces earlier value.

## Controlled Migration
**When to use**: Existing custom data must move into CSDM.  
**How**: Assess → map semantics → pilot → migrate in waves → validate consumers.  
**Trade-offs**: Requires analysis; avoids moving defects and breaking integrations.

## Use-Case-Driven Governance
**When to use**: Defining mandatory fields, relationships, and quality thresholds.  
**How**: Start with decision/workflow/report; identify minimum trusted data; assign owners; automate checks.  
**Trade-offs**: Keeps scope lean; may not satisfy teams seeking exhaustive inventory.
