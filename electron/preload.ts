import { contextBridge } from 'electron'

// The UI talks to the local server over HTTP, so it needs no privileged bridge.
// Expose a tiny marker so the app can tell it is running inside Electron if useful.
contextBridge.exposeInMainWorld('ghostwriter', { desktop: true })
