import path from 'node:path'
import fs from 'node:fs'
import { app, BrowserWindow, Menu, dialog, shell, type MenuItemConstructorOptions } from 'electron'
import { startProd } from '../src/server/server'

// A separate port from the web dev server (8787) so both can run side by side.
const PORT = Number(process.env.PORT ?? 8788)

let win: BrowserWindow | null = null
let baseUrl = ''

/** In dev (unpackaged) assets sit at the repo root; when packaged they are extraResources. */
function resourceBase(): string {
  return app.isPackaged ? process.resourcesPath : path.join(__dirname, '..')
}

/**
 * The window/taskbar icon. Linux needs a PNG (the .ico is only used by the
 * Windows installer via electron-builder). Bundled to resources/icon.png when
 * packaged; read from docs/images in dev.
 */
function appIconPath(): string | undefined {
  const p = app.isPackaged
    ? path.join(process.resourcesPath, 'icon.png')
    : path.join(__dirname, '..', 'docs', 'images', 'ghostwriter-studio-icon.png')
  return fs.existsSync(p) ? p : undefined
}

// ---- remember the last-opened book folder across launches ----
function statePath(): string {
  return path.join(app.getPath('userData'), 'ghostwriter-state.json')
}
function readLastRoot(): string | undefined {
  try {
    const s = JSON.parse(fs.readFileSync(statePath(), 'utf8'))
    return typeof s?.lastRoot === 'string' ? s.lastRoot : undefined
  } catch {
    return undefined
  }
}
function writeLastRoot(root: string | undefined): void {
  try {
    fs.writeFileSync(statePath(), JSON.stringify({ lastRoot: root ?? null }, null, 2))
  } catch (err) {
    console.error('could not persist last folder:', err)
  }
}

/** Copy the bundled sample book into a writable location on first run. */
function ensureDefaultProject(resBase: string): string {
  const dest = path.join(app.getPath('userData'), 'sample-project')
  try {
    if (!fs.existsSync(dest)) {
      fs.cpSync(path.join(resBase, 'sample-project'), dest, { recursive: true })
    }
  } catch (err) {
    console.error('could not seed default project:', err)
  }
  return dest
}

async function startBackend(): Promise<string> {
  const devUrl = process.env.GHOSTWRITER_DEV_URL
  if (devUrl) return devUrl // electron:dev points at the Vite dev server

  const resBase = resourceBase()
  process.env.NODE_ENV = 'production'
  process.env.GHOSTWRITER_DEFAULT_ROOT = ensureDefaultProject(resBase)
  const { url } = await startProd({ port: PORT, clientDir: path.join(resBase, 'dist', 'client') })
  return url
}

async function createWindow() {
  baseUrl = await startBackend()
  win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#14161a',
    title: 'Ghostwriter Studio',
    icon: appIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  win.on('closed', () => {
    win = null
  })

  // Persist whichever book folder is currently loaded (from ?root), so the next launch
  // can reopen it. Fires for opens via the menu and for client-side navigations alike.
  win.webContents.on('did-navigate', (_e, url) => {
    try {
      writeLastRoot(new URL(url).searchParams.get('root') || undefined)
    } catch {
      /* ignore non-http(s) urls */
    }
  })

  // Reopen the last folder if it still exists; otherwise fall back to the default book.
  const last = readLastRoot()
  if (last && !fs.existsSync(last)) writeLastRoot(undefined)
  const startUrl = last && fs.existsSync(last) ? `${baseUrl}/?root=${encodeURIComponent(last)}` : baseUrl
  await win.loadURL(startUrl)
}

async function openBookFolder() {
  if (!win) return
  const res = await dialog.showOpenDialog(win, {
    title: 'Open book folder',
    properties: ['openDirectory'],
  })
  if (res.canceled || !res.filePaths[0]) return
  await win.loadURL(`${baseUrl}/?root=${encodeURIComponent(res.filePaths[0])}`)
}

const DISCLAIMER =
  'Provided "as is", without warranty of any kind. To the maximum extent permitted by law, ' +
  'the authors accept no liability for any damage, disruption, or loss of data arising from its ' +
  'use — you use it at your own risk. Keep your work under version control and back up anything ' +
  'you can\'t afford to lose.'

function showAbout() {
  const opts = {
    type: 'info' as const,
    title: 'About Ghostwriter Studio',
    message: `Ghostwriter Studio ${app.getVersion()}`,
    detail: `AI-facilitated, local-first book-authoring tool.\n\n${DISCLAIMER}\n\nMIT License © Rich Stokoe`,
    buttons: ['OK'],
  }
  if (win) dialog.showMessageBox(win, opts)
  else dialog.showMessageBox(opts)
}

function buildMenu() {
  const isMac = process.platform === 'darwin'
  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { label: 'About Ghostwriter Studio', click: showAbout },
              { type: 'separator' },
              { role: 'quit' },
            ],
          } as MenuItemConstructorOptions,
        ]
      : []),
    {
      label: 'File',
      submenu: [
        { label: 'Open Book Folder…', accelerator: 'CmdOrCtrl+O', click: openBookFolder },
        { label: 'Use Sample Book', click: () => win?.loadURL(baseUrl) },
        { type: 'separator' },
        {
          label: 'Open Project Folder in Finder/Explorer',
          click: () => shell.openPath(app.getPath('userData')),
        },
        { type: 'separator' },
        { role: process.platform === 'darwin' ? 'close' : 'quit' },
      ],
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
    ...(isMac
      ? []
      : [
          {
            role: 'help',
            submenu: [{ label: 'About Ghostwriter Studio', click: showAbout }],
          } as MenuItemConstructorOptions,
        ]),
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

app.whenReady().then(() => {
  buildMenu()
  createWindow().catch((err) => {
    console.error('failed to start Ghostwriter Studio:', err)
    dialog.showErrorBox('Ghostwriter Studio failed to start', String(err))
    app.quit()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
