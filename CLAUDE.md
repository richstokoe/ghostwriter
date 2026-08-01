# Ghostwriter Studio

AI-facilitated, local-first book-authoring tool. Markdown-on-disk; a Fastify server
(`src/server`) exposes a small REST API that a React client (`src/client`) drives. Also ships
as an Electron desktop app (`electron/`). Optional AI drafting talks to a local model
(LM Studio / Ollama) or a hosted provider.

## Guiding principle: automate as much as possible

Prefer **auto-discovery over manual configuration**. The user should be able to open a folder
of markdown and get a working project with zero setup wherever we can infer intent (chapter
order from filename, title from the H1, outline location by convention). Ask the user to
configure something only when it genuinely can't be inferred — and remember their answer so
they're never asked twice.

## Project model: `.ghostwriter/config.json`

A project is just a folder. Its **single, canonical, portable** config lives at
`<root>/.ghostwriter/config.json` (see `src/server/config.ts`). It travels with the book and
supersedes any earlier format — the legacy root `ghostwriter.json` is no longer read.

The config is a **path map** from *roles* to directories, not a per-file manifest. Files inside
a mapped directory are auto-discovered. Roles Ghostwriter Studio consumes:

| Role         | Default dir   | Contents |
|--------------|---------------|----------|
| `chapters`   | `manuscript`  | one markdown file per chapter (numeric filename prefix = order, H1 = title) |
| `outline`    | `outline`     | per-chapter notes: One purpose / Characters / Key events / TODO |
| `characters` | `characters`  | one markdown file per character, with frontmatter |
| `timeline`   | `timeline`    | `events.yml` |
| `voice`      | `voice`       | `voice.md` + `rules.yml` |

Any role may be left unmapped (its panel is simply empty). `extraRoles` stores additional
user-named folders that Ghostwriter records but does not yet consume. An outline note is matched
to its chapter by mirroring the path from the chapters dir into the outline dir (same basename).

**Vocabulary:** the per-chapter planning note is an **"outline"** (not a "brief").

## Opening & mapping folders

- Desktop: **File → Open Book Folder…** picks a directory and reloads with `?root=<path>`
  (`electron/main.ts`). The web build reads the same `?root=` param.
- When a folder isn't auto-recognised (no config **and** no `manuscript/` dir), the client shows
  `FolderMapper` (`src/client/components/FolderMapper.tsx`), which pre-fills role→folder guesses
  from directory-name heuristics and writes `.ghostwriter/config.json` on save. It's re-openable
  anytime via "Configure folders…" in the sidebar.

Relevant API (`src/server/api.ts`): `GET /config`, `GET /dirs`, `POST /config`.

## Conventions

- Server modules resolve their working directory from `rolesOf(await loadConfig(root))` — never
  hardcode `manuscript/`, `outline/`, etc.
- All file writes go through `safeJoin` (`src/server/paths.ts`) to stay inside the project root.
- Run `npm run typecheck` after changes. Dev server: `npm run dev` (port 8787).
