# Source Trust Policy

The advisor may search all configured sources, but every important claim must be labeled by source trust. Search in tier order and stop as soon as a higher tier answers.

## Tier 1: Official

- Local `./repos/ServiceNowDocs` (authoritative; prefer over remote)
- ServiceNow official docs
- ServiceNow developer docs
- ServiceNow support KBs
- ServiceNow release notes
- Official ServiceNow GitHub repos (incl. raw.githubusercontent ServiceNowDocs branches)
- ServiceNow SDK docs

Use for authoritative guidance.

## Tier 2: Community

- ServiceNow Community accepted answers
- ServiceNow Community articles
- Posts by ServiceNow employees, support, MVPs, or product teams

Use as strong signals, but do not treat as official product documentation.

## Tier 3: Practitioner

- Partner blogs
- Consultant writeups
- Non-official GitHub examples
- StackOverflow
- Technical blogs

Use as practical implementation or field-experience signals.

## Tier 4: Weak signals

- Reddit
- LinkedIn posts
- YouTube comments/transcripts
- Random forum posts
- Unsourced blog posts

Use only as weak signals. Clearly label them as unverified.

## Required labels

- Official guidance
- Community signal
- Practitioner advice
- Weak/unverified signal
- Instance-confirmed finding
- Model judgment, low confidence

## Credit

Adapted from work by [mitchellOpZero](https://github.com/mitchellOpZero/sn-advisor/blob/main/providers/claude/plugin/references/source-trust-policy.md).
