# Chapter 12: Governance and Decision Guidance

## Core Idea
CSDM succeeds when ownership, quality controls, and outcome-based decisions keep the model trustworthy over time.

## Frameworks Introduced
- **Use-Case-Driven Governance**: Define required data quality from decisions, workflows, and reports the model must support.
- **Model Stewardship**: Assign accountable owners for definitions, records, relationships, and lifecycle.

## Key Concepts
- **Data owner**: Accountable for meaning and policy.
- **Data steward**: Maintains quality and resolves issues.
- **Quality rule**: Testable completeness, correctness, uniqueness, or freshness requirement.
- **Certification**: Periodic confirmation that records remain trustworthy.

## Mental Models
- Every required field or relationship should support a named outcome.
- Governance is part of service management, not cleanup after implementation.
- Measure trustworthiness, not record count.

## Anti-patterns
- **No accountable owner**: Quality issues persist indefinitely.
- **Unmeasured quality**: Teams cannot know whether use cases are reliable.
- **Overmodeling**: Extra data increases maintenance without producing value.

## Worked Example
For incident impact analysis, define required service owners, critical dependencies, freshness thresholds, and certification cadence. Report failures to stewards and block maturity expansion until quality meets target.

## Key Takeaways
1. Tie governance rules to use cases.
2. Assign owners and stewards.
3. Automate measurable quality checks.
4. Avoid data with no decision value.

## Connects To
- **Ch 1**: Governance is a core CSDM principle.
- **Ch 10**: Governance gates adoption progress.
