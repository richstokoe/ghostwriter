# Ghostwriter — An AI-facilitated authoring suite

**Write a whole book with an AI collaborator that never takes the pen out of your hand.**

Ghostwriter is a writing studio for novelists and long-form authors. Draft the next paragraph
or a whole chapter from your own outline, in your own voice — then edit, review, and revise
with an AI that works *to your plan*, not off on its own. Your work remains a folder of plain
Markdown files that you own outright, versioned with git, with nothing locked in a proprietary
format or a cloud you can't see.

- ✍️ **Draft with intent, not autopilot** — AI writes from your per-chapter outline and a
  codified author voice, so new prose sounds like *you* and stays on-story.
- 📖 **Keep the whole book in view** — chapters, character bible, and timeline stay in sync,
  with key events pulled straight from your outlines.
- 🧭 **Stay in control** — a block editor, a house-style prose linter, and a no-sycophancy
  editorial pass with one-click rewrites keep quality high and the final call yours.
- 🔒 **Yours, on your machine** — everything is local-first: Markdown on your disk, versioned
  with git, drafting against a **local** LLM (Ollama / LM Studio) or a remote AI API you choose.

Runs in your browser (served locally) or as a desktop app.

> **Local-first, secure by design.** The server binds to `127.0.0.1` only and acts as you on your
> own machine — it reads and writes whatever book folder you point it at, and proxies to
> whatever LLM you configure. Don't expose it on a network. API keys are stored in
> `~/.ghostwriter/config.json`, never in the project.

See [`arch/DESIGN.md`](arch/DESIGN.md) for the architecture and design decisions.

## Features

- **Block editor** — preview by default; click a block to edit it.
  Tables, lists, and code fences edit as a single cohesive unit. Insert / append / delete
  blocks; which are saved as soon as you click off that block.
- **Chapter organiser** — create, delete, reorder chapters; an editable word-count target.
- **Open any folder** — point Ghostwriter at any folder of Markdown. If it doesn't match the
  default layout, a mapping dialog lets you assign each role (chapters, outlines, characters,
  …) to a folder; the mapping is saved to a portable `.ghostwriter/config.json`.
- **Characters** — a bible of character notes, with a timeline and key events auto-derived
  from the chapter outlines.
- **Timeline** — an editable chronology, plus key events pulled from the outlines with
  one-click promote-to-timeline.
- **Git automation** — status, commit, per-chapter history and diff, and opt-in
  auto-commit-on-save.
- **Voice & lint** — a house-style prose linter (the "signs of AI writing" checks) with a
  live lint panel.
- **AI drafting** — draft the next paragraph inline from inside any empty block, or write a
  whole chapter from its outline + voice, streamed token-by-token (with a separate
  "thinking" channel for reasoning models).
- **Editorial review** — run a hard, no-sycophancy editor pass over a chapter; each note
  comes with a one-click *Implement suggestion* that applies the rewrite in place.
- **Console** — a toggleable activity panel logging every operation (git, file, AI, …).

## Run

```bash
npm install
npm run dev        # web app: http://localhost:8787
```

It opens the bundled `sample-project/` (Alice's Adventures in Wonderland, public domain).
Point it at another book folder with `?root=/absolute/path/to/book`.

### Desktop (Electron)

```bash
npm run electron:dev   # dev: Electron window against the Vite dev server
npm run electron       # build the client + run the packaged-style app locally
npm run dist           # produce a distributable (AppImage / dmg / nsis) via electron-builder
```

In the desktop app, use **File → Open Book Folder…** to open any folder.

## Project format

A book is just a folder of Markdown. Its configuration lives in a single, portable
`.ghostwriter/config.json` that maps *roles* to folders — so a folder that doesn't follow the
default layout can be opened without moving any files. Files inside a mapped folder are
auto-discovered (chapter order from the numeric filename prefix, title from the H1).

Default layout (used when a role isn't mapped):

```
manuscript/   chapter prose  (counts toward the word target)
outline/      per-chapter outline = the AI prompt (One purpose / Characters / Key events / TODO)
characters/   one Markdown file per character (with frontmatter)
timeline/     events.yml
voice/        voice.md + rules.yml (the linter's house style)
.ghostwriter/ config.json (roles, title, word target)
```

Example `.ghostwriter/config.json`:

```json
{
  "format": "ghostwriter-config",
  "version": 1,
  "title": "Alice's Adventures in Wonderland",
  "wordTarget": 30000,
  "roles": { "chapters": "manuscript", "outline": "outline", "voice": "voice" }
}
```

Any role may be left unmapped (its panel is simply empty). A folder that already has a
`manuscript/` directory is recognised automatically; otherwise the mapping dialog appears the
first time you open it.

## Layout

- `src/client` — React + Vite UI
- `src/server` — Fastify backend (filesystem, git, LLM proxy); serves the client in prod
- `src/shared` — isomorphic types + the Markdown block splitter + the lint engine
- `electron/` — Electron main + preload (the server is bundled into the main process)
- `sample-project/` — the bundled demo book
- `arch/` — design docs

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md).

## License

[MIT](LICENSE) © Rich Stokoe. The bundled sample book is *Alice's Adventures in Wonderland*
by Lewis Carroll (1865), public domain — see [`sample-project/README.md`](sample-project/README.md).
