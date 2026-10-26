---
name: sn-docs
description: >
  Research ServiceNow products, APIs, SDKs, Fluent metadata-as-code,
  tables, security, and configuration using authoritative documentation.
---

# ServiceNow Docs Advisor

Authoritative source is the local repo `./repos/ServiceNowDocs` beside this `SKILL.md`. It is a monthly snapshot of one release family (`australia`/latest). Treat it as **Tier 1 official** and exhaust it before any web access.

## Local-first contract

- Resolve `./repos/ServiceNowDocs` from this skill's directory; never substitute workspace-relative or external paths.
- Treat the repo as read-only. Never fetch, pull, clone, or modify it.
- Search with your native ripgrep-backed search tool over `./repos/ServiceNowDocs/markdown`. Fall back to shell `grep -r` only if no native tool exists (`rg` is usually NOT installed).
- Cite a repo path for every claim drawn from local docs.

## Graphify index (optional accelerator)

The local corpus has a persistent Graphify index at `./graphify-out` beside
`repos/`. Use it as a navigation and relationship index when the question spans
multiple publications, APIs, tables, plugins, or cross-links. The index is not
an authority and does not replace reading the source markdown.

- Resolve the Graphify working directory from this skill's directory; never
  place generated output inside `repos/ServiceNowDocs`.
- Before graph traversal, check `./graphify-out/graph.json`. If it exists, use
  the Graphify query workflow to identify candidate nodes and source locations.
- Validate every material answer against the cited files under
  `./repos/ServiceNowDocs/markdown`; preserve the local-first contract and cite
  those files, not Graphify output.
- If the index is absent or stale, use the six local-search steps below. Do not
  block a documentation answer on Graphify availability.
- Build or refresh the index from this skill directory with:
  `graphify extract repos/ServiceNowDocs/markdown --out .`
  The same command is safe to rerun; Graphify uses its manifest and semantic
  cache to process only changed documentation files. `graphify update` is for
  code-only incremental extraction and is not the refresh command for this
  Markdown corpus.
- Treat `graphify-out/` as generated state. Do not modify the vendored docs
  repository, and do not cite generated reports as official documentation.

## Local search discipline

Run all six steps before declaring local insufficient. Skipping steps causes false "I don't know" answers when docs exist.

1. **Translate** the question into ServiceNow terminology (exact API/table/property/feature names). Never search the user's casual wording — docs are formal prose and literal phrases return zero hits.
2. **Search identifiers + variants**: exact names plus known ServiceNow synonyms.
3. **Navigate structure**: pick the relevant product area under `markdown/`, open that publication's `index.md`, and scan its titles.
4. **Search frontmatter**: match `title` and `product_area` for precise pages.
5. **Read** the top candidate files and follow their cross-links.
6. **Declare insufficient only after 1–5**, and state what you searched.

"Local exhausted" = steps 1–5 done with no supporting evidence. This same bar gates web access below.

## Version awareness

Local covers `australia`/latest only. Note the family on version-sensitive answers. If the user names another family (`zurich`, `yokohama`, `xanadu`), treat it as a local gap and fetch that branch's raw markdown via web (still Tier 1):
`https://raw.githubusercontent.com/ServiceNow/ServiceNowDocs/{branch}/markdown/{publication}/{file}`

## Web fallback

Web fires **only after local is exhausted**. Use it wisely: gated, ordered by trust, and labeled.

- **Announce, then go.** State the local gap before crossing to web (e.g. "Local has no coverage of X — checking official ServiceNow remote.").
- **Go in trust order**, stopping as soon as a higher tier answers:
1. Official remote (Tier 1): raw.githubusercontent ServiceNow branches, ServiceNow developer docs, support KBs, release notes, SDK docs.
2. Community (Tier 2), then Practitioner (Tier 3), then Weak signals (Tier 4).
- **Never fetch `servicenow.com/docs`** — it is a JS single-page app that returns no readable content. Use raw markdown URLs or web search instead.
- **Label every web claim** with its trust label and cite the URL.
- Lower tiers (2–4) are loud about being non-official; surface their labels prominently.

The six trust labels: **Official guidance**, **Community signal**, **Practitioner advice**, **Weak/unverified signal**, **Instance-confirmed finding**, **Model judgment, low confidence**. Full tier definitions and routing: see [SOURCE-TRUST.md](SOURCE-TRUST.md). Read it before relying on Tier 2–4 sources.

Optional context hygiene: when the web step goes broad across multiple tiers, you may delegate it to a subagent that returns trust-labeled findings (prefer a model strong at web search, e.g. Google Gemini, when the runtime offers it). Default is inline. Stay tool-agnostic — never require a subagent.

## Answer contract

- Separate documented facts from interpretation; omit unsupported interpretation.
- Prefer concise paraphrase over long quotation.
- Cite a source per material claim: repo path for local, URL + trust label for web.
- Never claim completeness beyond your evidence.
- If local and web both fail, say so transparently: state what you searched, and give a clearly labeled **Model judgment, low confidence** answer if useful. Do not silently emit a bare "I don't know."
