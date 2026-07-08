# mbase

Local-first object graph base for people and agents.

## Concept

`mbase` stores structured objects in SQLite and keeps each object's narrative body in Markdown.

- `Type`: object model and relation capability.
- `Field`: typed attribute on a type.
- `Object`: an instance of a type.
- `Field link`: a strong relation asserted by a `ref` or `ref_list` field.
- `Body link`: a weak mention parsed from Markdown `[[object.id]]`.
- `Body`: Markdown narrative for human reading and open editing.

The same data is exposed as:

- table view: objects by type
- page view: object fields + Markdown body + links
- graph view: field links and body links

## Stack

- Go, Cobra, `database/sql`, `modernc.org/sqlite`, `net/http`
- Vite, React, TypeScript, Tailwind, shadcn-style components, React Flow
- Web UI calls `POST /api/run`, which invokes the same internal command runner as the CLI. `POST /_mbase/run` is kept as a compatibility alias.

## Commands

```bash
mbase init
mbase serve
mbase status
mbase vault info

mbase create <type> <id> title="..." field=value
mbase create <type> <id> --body ./note.md title="..."
printf '# Title\n\nBody\n' | mbase create <type> <id> --body-stdin title="..."
mbase get <id>
mbase get <id> --json object,links,backlinks
mbase get <id> --json object,body_preview --body-preview 400
mbase get <id> --json object,body_abs_path --jq '.body_abs_path'
mbase set <id> <field> <value>
mbase link <id> <field> <target-id>
mbase delete <id> --yes
mbase query <type> --select title,related --where "title contains Wiki"

mbase type list
mbase type show <type>
mbase type create <type>

mbase field add <type> <field> --kind text|number|boolean|date|url|enum|list|ref|ref_list
mbase field add concept related --kind ref_list --target concept
mbase field add source.article judged --kind enum --values pending,keep,kill,deep

mbase object create <type> --id <id> --field title="..."
mbase object get <id>
mbase object list --type <type>
mbase object set <id> <field> <value>
mbase object link <id> <field> <target-id>
mbase object unlink <id> <field> <target-id>

mbase links <id>
mbase backlinks <id>
mbase graph export
mbase graph views
cat mbase.graph-views.json | mbase graph views write --stdin

mbase body path <id>
mbase body refresh <id>
printf '\nMore notes\n' | mbase body append <id> --stdin
printf '# Replacement\n' | mbase body write <id> --stdin
mbase asset import ./screenshot.png --name company-demo.png
mbase refresh
mbase issues
mbase doctor
```

Daily CLI commands print human-readable summaries by default. Add `--json` for agent/script output. `--json` alone preserves the full command result envelope; `--json field,field` selects fields from the result data, similar to `gh`. Add `--jq <expr>` to filter selected JSON without requiring the system `jq` binary. `mbase delete <id> --yes` removes the object from SQLite and keeps its Markdown body file on disk. Web API requests always return JSON and can pass a `vault` path:

```json
{"vault":"/path/to/vault","argv":["query","concept"]}
```

Web body editing uses the same runner for Markdown saves and a dedicated multipart endpoint for binary assets:

```bash
curl -F 'vault=/path/to/vault' -F 'file=@./screenshot.png' http://127.0.0.1:8766/api/assets
```

Graph Viewer reads configurable views from `mbase.graph-views.json` in the vault root. Each view declares the root object type and the field-link path to follow:

```json
{
  "version": 1,
  "views": [
    {
      "id": "investment-chain",
      "label": "Investment chain",
      "root_type": "investor",
      "steps": [
        { "direction": "in", "relation": "investor", "target_type": "investment" },
        { "direction": "out", "relation": "company", "target_type": "company" }
      ]
    }
  ]
}
```

## Development

Build frontend assets:

```bash
cd web
npm install
npm run build
```

Build the CLI:

```bash
go build ./cmd/mbase
```

Quick fixture:

```bash
FIXTURE=/tmp/mbase-fixture
rm -rf "$FIXTURE"
mkdir -p "$FIXTURE"

./mbase -C "$FIXTURE" init --json
./mbase -C "$FIXTURE" type create concept --json
./mbase -C "$FIXTURE" field add concept title --kind text --required --json
./mbase -C "$FIXTURE" field add concept related --kind ref_list --target concept --json

./mbase -C "$FIXTURE" create concept concept.rag title=RAG
./mbase -C "$FIXTURE" create concept concept.llm-wiki title="LLM Wiki"
./mbase -C "$FIXTURE" link concept.llm-wiki related concept.rag

printf '# LLM Wiki\n\nDifferent from [[concept.rag]].\n' > "$FIXTURE/bodies/concept.llm-wiki.md"
./mbase -C "$FIXTURE" body refresh concept.llm-wiki
./mbase -C "$FIXTURE" get concept.llm-wiki
./mbase -C "$FIXTURE" query concept --select title,related
./mbase -C "$FIXTURE" graph export --json
```
