# Ghostwriter — Design

An AI-facilitated book-authoring tool that productizes a Markdown + git + AI writing
workflow: chapter+brief pairs, a codified author voice, automated prose linting,
a timeline, git automation, and spec-driven AI drafting — all backed by Markdown on
local disk.

> **Status note (2026-07).** This is the original design record. The architecture below is
> accurate and every roadmap phase has since shipped. Two things evolved from the first
> sketch: the project format moved from a root `ghostwriter.json` manifest to a portable
> `.ghostwriter/config.json` that maps *roles* to folders (see "Native project format"), and
> the per-chapter "brief" is now called an **outline**. The `packages/*` names below are
> `src/client`, `src/server`, and `src/shared` in the actual single-package layout.

## Decisions (locked 2026-07-24)

| Question | Decision |
|---|---|
| Runtime | **Local backend + browser, one codebase**, wrapped as Electron. "Website" = run locally, open `localhost`. Identical code ships in Electron. |
| Native format | **Fresh design.** Tool-owned project format, still Markdown-on-disk. Organiser can open *any* Markdown folder; a portable `.ghostwriter/config.json` (role → folder map) layers on the native structure. |
| First slice | **Editor + organiser + disk.** No git/AI/timeline/lint yet — but the data model accommodates them. |
| Frontend | **React + TypeScript + Vite.** |

## System architecture

```
┌──────────────────────────────────────────────────────────┐
│ Electron (later)  — main process spawns server, loads web │
└──────────────────────────────────────────────────────────┘
        │ in the browser you just open http://localhost:PORT
        ▼
┌────────────────────┐    HTTP/JSON + SSE    ┌────────────────────┐
│ src/client         │ ───────────────────▶ │ src/server          │
│ React + Vite       │                       │ Fastify (Node)      │
│ block editor,      │ ◀─────────────────── │ filesystem, git,    │
│ organiser, views   │                       │ LLM proxy           │
└────────────────────┘                       └────────────────────┘
        │ shared TS types + markdown block utils
        ▼
┌────────────────────┐
│ src/shared         │  isomorphic: types, block splitter (mdast)
└────────────────────┘
```

- **web** never touches disk/git/LLMs directly — everything goes through the server API.
  This is what lets the same UI run in a plain browser *and* in Electron.
- **server** owns all privileged capability (fs, `simple-git`, spawning `pandoc`,
  proxying Ollama/LM Studio/Anthropic/OpenAI). In dev, Vite proxies `/api` → server.
  In prod/Electron, server serves the built web assets and API on one port.
- **shared** holds pure, isomorphic code: TS types and the Markdown **block splitter**,
  so both sides agree on what a "block" is.

## The block editor (signature feature)

Requirement: preview by default; click a block to edit it; multi-line cohesive entities
(tables, lists, code fences, blockquotes) become editable *as one unit*.

**Key insight:** a top-level [mdast](https://github.com/syntax-tree/mdast) node *is* the
cohesive entity. Parsing with `remark-parse` + `remark-gfm` yields one node per table,
list, fenced code block, blockquote, heading, or paragraph — each carrying a source
`position` (start/end offset).

Algorithm (`src/shared/blocks.ts`):
1. Parse the document to mdast; read each top-level node's `position`.
2. Slice the **original source string** by those offsets → `{ source, start, end }` per
   block. Slicing the original (not re-serializing) preserves exact formatting; the gaps
   between blocks (blank lines) are preserved verbatim too.
3. Render: each block shows a `react-markdown` preview. Click → swap to a CodeMirror
   editor seeded with *that block's source only*. Blur/save → splice the edited source
   back into the full document at `[start,end)`, re-split, re-render.

Because the split granularity is the top-level node, clicking any cell of a table edits
the whole table; clicking a list item edits the whole list. The "smart" behaviour falls
out of the parse for free.

## Native project format (Markdown-on-disk)

A book is a folder of Markdown. Configuration lives in a single, portable
`.ghostwriter/config.json` that maps **roles** (`chapters`, `outline`, `characters`,
`timeline`, `voice`) to folders, so a folder that doesn't follow the default layout can be
opened without moving files.

Opening a folder:
- Read `.ghostwriter/config.json` if present → its `roles` map + optional `title`/`wordTarget`
  are canonical. This is the single source of truth (the older root `ghostwriter.json` is no
  longer read).
- Resolve each role to a folder (config value, else the default). Within the chapters folder,
  auto-discover `*.md`, order by leading numeric prefix, derive titles from the H1. Each
  chapter's outline is the same-named file under the outline folder.
- When a folder is not auto-recognised (no config **and** no `manuscript/` dir), the client
  shows a mapping dialog that writes `.ghostwriter/config.json` on save.

```
<project>/
  .ghostwriter/config.json  # roles → folders, title, word target  (portable, canonical)
  manuscript/               # chapters  (role: chapters — counts toward word target)
    01-<slug>.md
  outline/                  # per-chapter outline = the AI prompt (One purpose / Characters / Key events / TODO)
    01-<slug>.md
  voice/                    # author voice + structured lint rules
  timeline/                 # events.yml
  characters/               # one Markdown file per character (frontmatter)
```

`.ghostwriter/config.json`:
```json
{
  "format": "ghostwriter-config",
  "version": 1,
  "title": "Alice's Adventures in Wonderland",
  "wordTarget": 30000,
  "roles": { "chapters": "manuscript", "outline": "outline", "voice": "voice" }
}
```

Any role may be omitted (falls back to a default folder of the same name; its panel is empty
if that folder is absent). Extra, inert roles can be recorded under `extraRoles` for future
use. Concept → format mapping:
- chapter + outline matched pair  → `<chapters>/*.md` + `<outline>/*.md` (same basename)
- author voice + "signs of AI writing" → `voice/voice.md` + `voice/rules.yml` (tool-native lint)
- timeline + discrepancies    → `timeline/events.yml` (+ a view derived from outline key events)
- character bible             → `characters/*.md`

## First-slice API (server)

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/health` | liveness |
| GET | `/api/project?root=<abs>` | manifest + ordered chapter list (title, file, words) |
| GET | `/api/file?root=<abs>&path=<rel>` | raw Markdown of one file |
| PUT | `/api/file` `{root,path,content}` | write Markdown to disk (path-sandboxed to root) |

Safety: `path` is resolved against `root` and rejected if it escapes (`..`, absolute).
Writes are the only mutation in this slice; git/AI come later.

## Roadmap (phases after the first slice)

1. **Editor + organiser + disk** ← first slice (this).
2. **Git automation** — `simple-git`: commit-on-save (opt-in), history, per-chapter diff, word-count-to-target in status bar.
3. **Voice & lint** — `voice/rules.yml` engine (regex/token rules à la Vale prose-linting styles), inline squiggles + a lint panel.
4. **AI drafting** — provider abstraction over an OpenAI-compatible endpoint (covers Ollama + LM Studio + OpenAI) plus native Anthropic; in-app model discovery/selection; "write next paragraph" / "write whole chapter" driven by the brief + voice as system prompt; optional lint feedback loop.
5. **Timeline view** — parse `timeline/events.yml`, weekday spine, chapter cross-links, discrepancy detection.
6. **Electron packaging** — wrap server+web; native open-folder; auto-update later.

## Non-goals (for now)
Cloud sync, multi-user, mobile, a hosted SaaS backend. Local-first only.
