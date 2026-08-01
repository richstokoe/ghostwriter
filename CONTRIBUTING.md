# Contributing to Ghostwriter

Thanks for your interest! Ghostwriter is a local-first Markdown + git + AI book-authoring
tool. This guide covers getting set up and the conventions the codebase follows.

## Getting started

Requires **Node.js ≥ 20**.

```bash
npm install
npm run dev        # web app at http://localhost:8787 (Vite middleware, hot reload)
```

The dev server opens the bundled `sample-project/`. Point it at another book with
`?root=/absolute/path/to/book`.

### Desktop (Electron)

```bash
npm run electron:dev   # Electron window against the Vite dev server
npm run electron       # build the client + run the packaged-style app locally
```

## Checks before you push

CI runs these on every push and PR; run them locally first:

```bash
npm run typecheck      # tsc --noEmit — must pass
npm run build:app      # vite build + esbuild the Electron bundle — must succeed
```

There is no separate lint/format step; match the style of the surrounding code.

## Project layout

| Path | What it is |
|---|---|
| `src/client` | React + Vite UI (components, `lib/api.ts` client) |
| `src/server` | Fastify backend — filesystem, git, LLM proxy; serves the client in prod |
| `src/shared` | Isomorphic code: types, the Markdown block splitter, the lint engine |
| `electron/`  | Electron main + preload (the server is bundled into the main process) |
| `sample-project/` | The bundled demo book (public-domain Alice in Wonderland) |
| `arch/` | Design docs |

See [`arch/DESIGN.md`](arch/DESIGN.md) for the architecture and the project format.

## Conventions

- **TypeScript throughout**, ES modules. Keep `src/shared` isomorphic — no Node-only or
  browser-only APIs there.
- **Server owns all privileged capability** (filesystem, git, LLM calls). The client only
  talks to the server over the `/api` REST + SSE surface — never the disk directly. This is
  what lets the same UI run in a browser and in Electron.
- **Path safety:** any filesystem access derived from a request path must go through
  `safeJoin` (`src/server/paths.ts`) so it can't escape the project root.
- **Roles, not hardcoded folders:** resolve a project's working directories from
  `rolesOf(await loadConfig(root))`, never string literals like `'manuscript'`.
- **Automate for the user:** prefer auto-discovery (order from filename, title from H1) over
  asking them to configure things.
- Match the existing code's naming, comment density, and idioms. Prefer small, focused
  changes with clear commit messages.

## Reporting issues & proposing changes

- Open an issue for bugs and feature ideas: <https://github.com/richstokoe/ghostwriter/issues>.
- For pull requests: keep them scoped, ensure `typecheck` + `build:app` pass, and describe
  what you changed and why. If a change is user-visible, verify it in the running app.

## License

By contributing, you agree that your contributions are licensed under the project's
[MIT License](LICENSE).
