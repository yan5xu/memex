# Memex

> **Build a shared world model without giving up Markdown.**

**A local-first, typed knowledge workspace for people and agents.**

**English** · [简体中文](README.zh-CN.md)

Memex gives people and agents one place to build durable knowledge together.

People can read and write rich Markdown in the Web UI or their editor. Agents can create, query, link, and validate the same knowledge through a deterministic CLI and JSON API. Schema makes the knowledge queryable; links make it reusable; Markdown keeps it expressive and open.

> **Schema says what a thing is. Links place it in the model. Markdown explains why it matters.**

[Why Memex](#why-memex) · [Core model](#the-core-model) · [Get started](#quick-start) · [Documentation](#documentation)

## What Is Memex

Memex is a local-first knowledge system in which every thing can be modeled as a typed object, every durable relationship can be made explicit, and every object can carry a Markdown body for narrative context.

A company can link to its founders and sources. A research note can link to the evidence behind a judgment. An investor can be viewed through its investments without exposing every intermediate record. The same vault can then appear as a table, an object page, or a purpose-built graph.

Memex is not just a Markdown folder with generated pages, and it is not a database that forces all knowledge into rows and columns. It keeps structured facts and long-form understanding in their natural forms while giving both a shared identity and link model.

The name follows Vannevar Bush's Memex: a system for extending memory through stored knowledge and associative trails. This project makes that idea operational for a world in which people and agents maintain the same knowledge space.

```text
Person  <->  Web UI / Markdown editor
                    |
          Memex Vault
      Objects + Links + Bodies
                    |
Agent   <->  CLI / JSON API / files
```

## What You Can Do Today

- **Model a domain:** Define Types and typed Fields, including enums, lists, dates, URLs, references, and reference lists.
- **Work with objects:** Create, update, query, link, delete, and inspect objects from the CLI or Web UI.
- **Write real documents:** Give every object a Markdown body with tables, images, diagrams, code, footnotes, and `[[object.id]]` links.
- **Separate facts from narrative:** Keep queryable properties in SQLite and longer explanation, evidence, and judgment in Markdown.
- **Use multiple views:** Browse the same vault as tables, object pages, backlinks, and interactive graphs.
- **Configure graph projections:** Define path queries, node presentation, and bridge contraction in a Git-friendly JSON file.
- **Automate from agents:** Request stable JSON fields, filter with `--jq`, call the local API, or control the Web UI through `window.memex`.
- **Validate continuously:** Detect invalid fields, broken references, stale body links, and other integrity problems before committing a vault.

## Product Tour

### Read and Write Rich Object Pages

An object page brings structured identity, Markdown narrative, images, links, and editing into one reading surface.

![Memex object page showing a rich Markdown company profile](docs/images/memex-object-detail.png)

### Query the Same Knowledge as a Table

Types become focused, filterable tables without creating a second copy of the data.

![Memex object table with typed fields and visual filtering](docs/images/memex-objects.png)

### Project Relationships into Purpose-Built Graphs

Graph Views turn reusable path queries into navigable projections. This portfolio view contracts investment objects into labeled edges between an investor and companies.

![Memex configurable portfolio graph view](docs/images/memex-graph.png)

## Who Is It For

### People Who Think in Models

Memex is for people who do not want knowledge to remain a pile of pages. They want concepts, companies, people, evidence, decisions, projects, or any other domain object to have a clear identity, a reusable schema, and explicit relationships.

### People Working with Agents

Agents need more than prose retrieval. They need stable IDs, discoverable schemas, exact queries, predictable writes, and machine-readable results. People still need context, visual reading, flexible writing, and the freedom to edit files directly. Memex gives both sides the same underlying objects without forcing them into the same interface.

## Why Memex

### Markdown Is Open but Underspecified

Markdown is durable, portable, and easy for people and agents to edit. But a folder of Markdown files does not by itself answer basic modeling questions:

- Is this page a company, a source, a person, or a decision?
- Which fields are valid, required, or queryable?
- Does a link mean ownership, evidence, authorship, investment, or a passing mention?
- How can a table or graph be derived consistently from the same content?

### A Database Is Queryable but Not Enough

A database is good at identity, constraints, relations, and filtering. It is a poor home for evolving explanations, research reports, screenshots, code examples, and editorial structure. Moving the entire object into JSON or SQL makes writing less natural and direct file access less useful.

Memex therefore uses two complementary forms:

| Form | Owns | Best for |
|---|---|---|
| SQLite | Identity, type, fields, links, timestamps, integrity | Querying, constraints, automation, views |
| Markdown | Narrative body and embedded media | Reading, writing, evidence, explanation |

Neither is a cache of the other. Together they form one object.

### People and Agents Need a Shared Contract

The Web UI is optimized for reading, editing, filtering, and visual exploration. The CLI is optimized for exact operations and agent workflows. Both use the same application runner and the same vault, so a change made through one interface is immediately part of the same model seen by the other.

> **People shape understanding through pages; agents operate the model through objects.**

## The Core Model

| Concept | Meaning |
|---|---|
| **Vault** | A local Memex workspace containing its database, bodies, assets, and view configuration. |
| **Type** | The schema and relation capabilities of a class of objects. |
| **Field** | A typed property declared on a Type. |
| **Object** | A stable instance with an ID, Type, title, fields, and body. |
| **Body** | The object's Markdown narrative, stored as a normal file. |
| **Link** | A typed relation or a body mention between objects. |
| **View** | A table, page, or graph projection over the same underlying objects. |

### Three Layers of Links

Memex distinguishes three things that are often collapsed into one vague notion of a link:

1. **Link definition:** A Type declares a `ref` or `ref_list` Field and the Type it may target.
2. **Field link:** An Object assigns another object ID to that Field, asserting a durable, typed relation.
3. **Body link:** Markdown contains `[[object.id]]` or `[[object.id|label]]`, recording a contextual mention.

This distinction lets a graph separate modeled relationships from narrative associations. A person's `founder_of` relation is not treated the same as a passing mention in a research note, even though both remain navigable.

## One Vault, Different Ways to Work

### Human Workflow

A person typically starts from an object page, reads the Markdown body, follows links, edits the document, uploads images, filters a table, or opens a graph around the current object. The interface stays local and single-user; there is no account or cloud workspace model.

### Agent Workflow

An agent inspects the schema, checks for an existing object, writes structured fields and a body in one operation, links evidence, refreshes body mentions, and runs integrity checks:

```sh
mmx -C /path/to/vault field list company
mmx -C /path/to/vault query company --where 'title = "Example"'

cat <<'MD' | mmx -C /path/to/vault upsert company company.example \
  name="Example" \
  status=active \
  --body-stdin
# Example

Example is supported by [[source.example-home]].
MD

mmx -C /path/to/vault body refresh company.example
mmx -C /path/to/vault issues
```

Direct Markdown editing remains supported. After editing body files outside Memex, run `body refresh <id>` or `refresh` so body links and the local index reflect the files on disk.

## Views Are Projections, Not Copies

Memex does not create a separate dataset for every interface.

- **Table:** Compare objects of one Type, sort fields, and build filters visually.
- **Object page:** Read fields, Markdown, links, backlinks, and a local relationship graph together.
- **Graph:** Explore either the whole vault or a configured question such as `investor <- investment -> company`.

Graph Views live in `memex.graph-views.json`. Agents can edit this file directly, validate it, and execute a view without opening the browser. Version 2 views can combine multiple paths, choose which fields appear on nodes, and contract intermediate objects into derived edges.

```sh
mmx -C /path/to/vault graph view validate
mmx -C /path/to/vault graph query \
  --view portfolio \
  --center investor.example \
  --json nodes,edges,stats
```

The file is suitable for Git, review, reuse, and agent-generated changes. It remains the source of truth for both the CLI and Web UI.

## Quick Start

Build the CLI:

```sh
cd /path/to/memex
go build -o mmx ./cmd/mmx
```

Create a vault and its first linked objects:

```sh
VAULT=/tmp/memex-demo

./mmx -C "$VAULT" init
./mmx -C "$VAULT" type create concept
./mmx -C "$VAULT" field add concept title --kind text --required
./mmx -C "$VAULT" field add concept related --kind ref_list --target concept
./mmx -C "$VAULT" field add concept status --kind enum --values draft
./mmx -C "$VAULT" field enum add concept status published

./mmx -C "$VAULT" create concept concept.rag title="Retrieval-augmented generation"
printf '# Memex\n\nDifferent from [[concept.rag]].\n' | \
  ./mmx -C "$VAULT" create concept concept.memex title="Memex" --body-stdin
./mmx -C "$VAULT" link concept.memex related concept.rag
./mmx -C "$VAULT" body refresh concept.memex
./mmx -C "$VAULT" issues
```

Start the local Web UI:

```sh
./mmx serve --addr 127.0.0.1:8766
```

Open <http://127.0.0.1:8766>. When the current directory is not already a vault, Memex creates and opens a bundled **Memex Showcase** automatically. It is a normal writable vault with sample schemas, objects, field and body links, local images, rich Markdown, and configurable graph views. The showcase is created once in the operating system's user configuration directory, so later edits are preserved.

To open a specific vault as the server default, pass it explicitly:

```sh
./mmx -C /path/to/vault serve --addr 127.0.0.1:8766
```

The Web UI reads the server default on startup and keeps the Showcase available in the vault switcher. `MEMEX_SHOWCASE_VAULT=/custom/path` can override the bundled vault location for packaged or isolated environments.

Read-only public deployments use stable content routes instead of exposing internal UI state in query parameters. For example, `company.kernel` is available at `/companies/kernel` and `investor.accel` at `/investors/accel`. Existing query-string detail links remain readable and are replaced with their canonical content route after loading.

## Agent and API Surfaces

Human-readable output is the CLI default. Agents and scripts can request the full result envelope, select fields, and apply a `jq`-style expression without depending on a system `jq` binary:

```sh
mmx -C /path/to/vault get company.example --json
mmx -C /path/to/vault get company.example \
  --json object,body_abs_path,links,backlinks \
  --jq '.body_abs_path'
```

The Web UI calls the same internal runner through `POST /api/run`:

```json
{
  "vault": "/path/to/vault",
  "argv": ["query", "company", "--where", "status=active"]
}
```

Binary assets use a dedicated multipart endpoint because file upload is not naturally represented as command JSON:

```sh
curl -F 'vault=/path/to/vault' \
  -F 'file=@./screenshot.png' \
  http://127.0.0.1:8766/api/assets
```

For browser automation and UI development, `window.memex` exposes navigation, state inspection, graph operations, editing, and other high-level actions without requiring an agent to reproduce low-level click sequences.

## Product Boundary

Memex is local-first and single-user. It does not currently provide cloud hosting, accounts, permissions, or real-time multi-user collaboration. Git can version a vault as local files, while Markdown bodies and JSON view configuration remain directly reviewable; Memex itself remains responsible for object integrity and indexes.

Memex also does not replace a general Markdown editor or attempt to infer every relation automatically. People and agents decide which concepts deserve stable identity, which facts belong in fields, and which relationships should become explicit. Automation helps maintain the model, but the model remains inspectable and editable.

## Architecture

- **Core:** Go, Cobra, `database/sql`, and `modernc.org/sqlite`
- **Web:** React, TypeScript, Vite, Tailwind CSS, shadcn/ui primitives, TanStack, and React Flow
- **Storage:** SQLite object model plus Markdown bodies and local assets
- **Interfaces:** CLI, local JSON API, Web UI, and `window.memex` browser automation

The Web UI and CLI share the same internal command runner through `POST /api/run`.

## Development

Build and verify the frontend:

```sh
cd web
npm install
npm run build
```

Build and verify the Go application:

```sh
go test ./...
go build ./...
```

## Documentation

- [Complete usage guide](docs/usage-guide.md)
- [Markdown rendering lab](docs/markdown-render-lab.md)
- [YC modeling field notes](docs/yc-modeling-field-notes.md)

## Project Status

Memex is under active development. The object model, Markdown body workflow, CLI/API runner, table and object views, configurable Graph Views, and local Web UI are usable today.
