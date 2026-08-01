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
    title: 'Ghostwriter',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  win.on('closed', () => {
    win = null
  })
  await win.loadURL(baseUrl)
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

function buildMenu() {
  const template: MenuItemConstructorOptions[] = [
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
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

app.whenReady().then(() => {
  buildMenu()
  createWindow().catch((err) => {
    console.error('failed to start Ghostwriter:', err)
    dialog.showErrorBox('Ghostwriter failed to start', String(err))
    app.quit()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
