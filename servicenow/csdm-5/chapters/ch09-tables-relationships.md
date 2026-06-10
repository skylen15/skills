# Chapter 9: Tables and Relationships

## Core Idea
CSDM value depends on using the correct out-of-box tables, references, and prescribed relationship semantics.

## Frameworks Introduced
- **Table-Reference-Relationship Decision**: Use a table for entity identity, a reference for direct ownership/context, and a CI relationship for dependency or service topology.
- **Prescriptive Relationships**: Standard directional semantics supporting reporting and impact analysis.

## Key Concepts
- **Table label vs table name**: Human label and technical identifier must both be understood.
- **Reference field**: Direct structured link stored on a record.
- **CI relationship**: Typed, directional connection between configuration items.
- **Relationship direction**: Parent/child semantics affect traversal and impact.

## Mental Models
- Choose relationship based on intended question and traversal.
- Prefer prescribed semantics over convenient generic links.
- Validate model quality through reports and impact paths.

## Anti-patterns
- **Custom tables before fit analysis**: Creates avoidable divergence.
- **Generic or reversed relationships**: Produces misleading impact results.
- **Duplicating a reference as an arbitrary relationship**: Creates conflicting sources of truth.

## Worked Example
To answer "what service is affected if this database fails?", model the database-to-application-service dependency using prescribed direction. Test impact traversal before scaling population.

## Key Takeaways
1. Use out-of-box tables where they fit.
2. Understand references versus CI relationships.
3. Preserve relationship type and direction.
4. Test with real reporting and impact questions.

## Connects To
- **Ch 1**: Prescriptive relationships are a core principle.
- **Ch 10**: Adoption stages progressively improve relationship coverage.
