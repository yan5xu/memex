# YC Modeling Field Notes

This note summarizes the YC P26 modeling run with Arga Labs and Lightsprint. It records what worked, what was corrected, and what should shape the next schema and CLI improvements.

## Model That Held Up

The current object model is directionally right:

- `company`, `person`, and `batch` form the core entity network.
- `touchpoint` is a persistent monitoring entry, such as a company page, website, X account, LinkedIn page, feed, repo, or other recurring source.
- `source.item` is a single evidence item, such as a launch post, article, docs page snapshot, tweet, Similarweb snapshot, or captured page.
- `note` is a first-class object for CP takeaways and human judgment.

The important split is that `company` body is a synthesized profile, `source.item` body is evidence content, and `note` body is interpretation.

## Boundary Corrections

The run exposed an early modeling mistake: one-time pages were sometimes created as `touchpoint`.

Use this rule:

- Persistent entry: model as `touchpoint`.
- One-time content or captured evidence: model as `source.item`.

Examples:

- YC company page, X account, website, LinkedIn company page: `touchpoint`.
- YC Launch post, docs page, article, tweet, Similarweb snapshot: `source.item`.

Mis-modeled objects can be kept with `status=ignored` until cleanup. Correct `source.item.from_touchpoint` to point at the persistent entry that emitted or contextualized the evidence.

## Why Note Is Necessary

`note` should stay as a first-class type. CP needs to query their own observations directly, not only read them inside `company` body text.

The practical schema used in the run:

- `title`
- `kind`
- `author`
- `tags`
- `about_company`
- `about_person`
- `about_batch`
- `source_items`
- `created_at`

This lets `query note` show product and GTM takeaways, while backlinks keep the notes visible from related companies.

## Tags And Concepts

Tags are still useful for quick filtering, especially on `company`, with values such as `agent-infra`, `validation-layer`, `agentic-sdlc`, and `demo-led`.

When a tag starts to represent a reusable cross-company idea, it should graduate into `concept`.

Good `concept` candidates from this run:

- `validation-layer`
- `team-layer`
- `network-driven-gtm`

The next useful step is to add a `concept` type and connect it to companies, notes, and evidence.

## Body Writing Practice

The body workflow is now central to mbase. Agents should prefer creating objects with body content in one step:

```bash
mbase create source.item source.some-evidence title="Some Evidence" --body-stdin <<'EOF'
# Some Evidence

Summary and evidence notes.
EOF
```

Use `body append` and `body write` for updates, then run `body refresh` whenever the body contains images or `[[object.id]]` links.

## Image Practice

Markdown bodies should be graph-and-media friendly. For company research, a useful minimum image set is:

- Company website or product-positioning image.
- Product demo or interface screenshot.
- Traffic, launch, or evidence screenshot.

Store assets inside the vault, usually under `assets/`, and reference them with relative Markdown paths.

This makes the Web UI more useful for reading while preserving agent-friendly text and files.

## Source Item Evidence Body

`source.item` should not stop at URL and metadata. Its body should describe:

- Capture method and quality.
- Evidence level.
- Summary or excerpt.
- Which claim, note, concept, or decision the source supports.
- Any caveats in the capture.

For example, a Similarweb snapshot body should include the metric definitions, period, channel split, interpretation, and confidence limits.

## Schema And Tool Follow-Ups

Highest-value schema additions:

- Add `concept` as a reusable pattern or idea object.
- Add `source.item.capture_method`.
- Add `source.item.capture_status`.
- Add `source.item.captured_at`.

Possible later type:

- `media.asset`, with fields such as `file_path`, `kind`, `source_url`, `about_company`, `about_source_item`, `caption`, and `captured_at`.

CLI and UX items to keep sharp:

- `delete`/`remove` is useful for cleaning accidental objects while keeping Markdown body files on disk.
- `get --body-preview <n>` should remain visible in human-readable output for quick body inspection.
- URLs containing `?` or `&` need shell quoting in CLI examples.
- External platform writes should be serialized when the platform is sensitive to concurrent writes.

## Conclusion

The SQLite graph plus Markdown body architecture is holding up. The product is no longer just dynamic tables; it is becoming an object network with evidence sources, CP notes, reusable concepts, and readable visual bodies.

The next schema work should focus on `concept` and capture metadata for `source.item`.
