---
name: sn-docs-repo-only
description: Search and answer ServiceNow documentation questions using only files under repos/servicenow-docs. Use when ServiceNow answers must be grounded exclusively in the vendored ServiceNowDocs repository, with no web, Context7, shared clones, or memory fallback.
---

# ServiceNow Docs Repo Only

Use `repos/servicenow-docs` as sole source.

## Hard Rules

- Search, read, and cite only files under `repos/servicenow-docs`.
- Treat repository as read-only.
- Do not use web search, Context7, external docs, shared clones, other repository files, or model memory as evidence.
- Do not run commands that fetch, pull, clone, transform, or modify docs.
- If repository is missing, requested fact is not found, or evidence is insufficient, return exactly:

```text
I don't know
```

Do not add explanation, suggestions, or inferred answer after fallback.

## Workflow

1. Confirm `repos/servicenow-docs` exists.
2. Search exact API names, table names, properties, and user wording.
3. Search likely ServiceNow terminology variants when exact search misses.
4. Open relevant matches and nearby documentation pages.
5. Answer only claims directly supported by read files.
6. Cite supporting paths under `repos/servicenow-docs`.
7. Return `I don't know` when support remains insufficient.

## Search

Prefer `rg`:

```sh
rg -n -i "exact term|known variant" repos/servicenow-docs
rg --files repos/servicenow-docs
```

If `rg` is unavailable, use `git grep` scoped to repository or PowerShell:

```powershell
Get-ChildItem -Path repos/servicenow-docs -Recurse -File |
  Select-String -Pattern "exact term|known variant"
```

Never widen search beyond `repos/servicenow-docs`.

## Answer Contract

- Separate documented facts from interpretation. Omit interpretation not directly supported.
- Prefer concise paraphrase over long quotation.
- Include local source path for each material claim.
- Never claim completeness unless repository evidence supports it.
