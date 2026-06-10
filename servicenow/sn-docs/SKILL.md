---
name: sn-docs
description: "Use ServiceNow documentation sources in version-aware order: project-local docs, shared release clone, then Context7 CLI sources. Use when answering or implementing ServiceNow-related work, when user mentions ServiceNow docs/content/source-of-truth, or when a repo should use official ServiceNow documentation."
---

# ServiceNow Docs Source

## Quick Start

When ServiceNow facts matter, determine the documentation version first, then use the source order below before relying on memory or broad web search.

1. Determine release family/version:
   - Use the version explicitly named by the user, such as `australia`, `zurich`, `xanadu`, or `yokohama`.
   - If no version is explicit, use the current project's `AGENTS.md` default when it names a ServiceNow release.
   - If no project default is available, default to `zurich`.
   - The user may switch versions in any later command by naming the release explicitly.
2. Search project-local docs first: `repos/servicenow-docs`.
3. If project-local docs are unavailable, search the shared release clone: `~/.local/share/servicenow-docs/{version}`.
4. If neither local source is available or sufficient, use Context7 CLI sources in this exact order:
   - `https://context7.com/websites/developer_servicenow?contextType=info`
   - `https://context7.com/websites/servicenowguru`
   - `https://context7.com/servicenowdevprogram/code-snippets`


Context7 CLI workflow:

1. Resolve the best Context7 library ID first:

```sh
ctx7 library "ServiceNow" "<user question>"
```

2. Prefer matches for the source order above: `developer_servicenow`, then `servicenowguru`, then `servicenowdevprogram/code-snippets`. Pick the best exact or most relevant library ID from the CLI output.
3. Fetch documentation with the selected ID and the user's full question:

```sh
ctx7 docs <libraryId> "<user question>"
```

4. Do not use Context7 MCP tools for this skill. The expected interface is the globally installed `ctx7` CLI.

The ServiceNowDocs `main` branch is only repository metadata. Product docs live on release branches such as `zurich`, `yokohama`, `xanadu`, and `australia`.

## Lookup Workflow

1. Determine the ServiceNow release family. Use the user's explicit version first, then the current project's `AGENTS.md` default if present, otherwise use `zurich`.
2. Check for `repos/servicenow-docs` in the current project. Treat this as the highest-priority source, regardless of operating system or agent runtime.
3. If `repos/servicenow-docs` exists, confirm it contains product docs, usually a `markdown/` tree plus files such as `llms.txt`. Search it first with exact terms from the request.
4. If `repos/servicenow-docs` does not exist, check `~/.local/share/servicenow-docs/{version}` where `{version}` is the selected release family. Resolve `~` using the current environment's home-directory mechanism; do not hard-code OS-specific paths.
5. If the shared release clone exists, search it with exact terms from the request.
6. If neither local source exists, tell the user to clone or pull the selected branch from:

```text
https://github.com/ServiceNow/ServiceNowDocs
```

Use a normal git clone that tracks the selected branch, for example:

```sh
git clone --branch {version} --single-branch https://github.com/ServiceNow/ServiceNowDocs.git ~/.local/share/servicenow-docs/{version}
```

7. If exact-term local search is noisy, empty, or likely missing docs because the user's wording differs from ServiceNow's wording, use semantic search over the selected local docs path when available.
8. If local docs and semantic search do not provide enough evidence, use Context7 CLI sources in the required order listed above.
9. Read nearby files, navigation files, examples, and related pages before answering.
10. Treat local ServiceNowDocs trees as read-only reference material.
11. Do not import, copy wholesale, or edit files from ServiceNowDocs unless explicitly asked.
12. Cite the local path for local docs and include Context7 library IDs or source URLs when Context7 was used.

## Search Patterns

Use focused searches before broad ones:

```sh
rg -n "GlideRecord|Table API|Flow Designer" <docs-path>
rg -n "sysparm_query|encoded query" <docs-path>
rg -n "Zurich|Yokohama|Xanadu|Australia" <docs-path>
```

Use `rg` when available, but do not require it. If `rg` is not installed, use these cross-platform fallbacks:

```sh
git grep -n "GlideRecord\|Table API\|Flow Designer" -- <docs-path>
grep -R -n -E "GlideRecord|Table API|Flow Designer" <docs-path>
```

On Windows PowerShell:

```powershell
Get-ChildItem -Path <docs-path> -Recurse -File | Select-String -Pattern "GlideRecord|Table API|Flow Designer"
```

If names differ from common wording, search likely variants:

```sh
rg -n "IntegrationHub|Integration Hub|spoke" <docs-path>
rg -n "RESTMessageV2|REST Message V2|outbound REST" <docs-path>
```

Apply the same fallback pattern for variant searches when `rg` is unavailable.

`<docs-path>` is `repos/servicenow-docs` when present; otherwise it is `~/.local/share/servicenow-docs/{version}` when present.

Use exact local search first for API names, table names, properties, release markers, exhaustive checks, and quick confirmation of literal strings. Use semantic search second for conceptual, fuzzy, or broad documentation lookup over the selected local docs path. Use Context7 third, in the required order, when local docs are unavailable or insufficient.

When using the Semble CLI fallback, include `--content docs`:

```sh
semble search "how to configure credentials for integrations" <docs-path> --content docs --top-k 10
semble search "how to create a custom Flow Designer action" <docs-path> --content docs --top-k 10
semble search "encoded query syntax and examples" <docs-path> --content docs --top-k 10
```

Semble output is a retrieval aid, not the source of truth. After Semble returns candidate chunks, open and read the actual local markdown files under the selected docs path, then cite those local paths in the answer.

If semantic-search tooling is unavailable, skip it and proceed from exact local search to Context7. Do not add OS-specific setup instructions to this skill.


## Source Rules

- Prefer `repos/servicenow-docs` for ServiceNow documentation facts when present.
- Use `~/.local/share/servicenow-docs/{version}` when project-local docs are unavailable.
- Use Context7 third via the globally installed `ctx7` CLI, in this source preference order: `developer_servicenow`, `servicenowguru`, `servicenowdevprogram/code-snippets`.
- Treat `developer_servicenow` as the preferred Context7 source for official developer documentation.
- Use non-official sources only as secondary context and label them as such.
- Never treat vendored docs as application code.
