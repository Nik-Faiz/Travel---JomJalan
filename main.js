// main.js - Electron main process: creates the application window
const { app, BrowserWindow, ipcMain, net } = require('electron');
const path = require('path');

app.setName('JomJalan'); // name shown in native dialog titles (confirm, alert)

function createWindow() {
  const win = new BrowserWindow({
    width: 1100, height: 780, minWidth: 900, minHeight: 600,
    title: 'JomJalan - Travel Agency',
    webPreferences: {
      preload: path.join(__dirname, 'renderer.js'), // preload bridge
      contextIsolation: true,
      sandbox: false // preload needs 'fs' to read data/itineraries.json
    }
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

// Holidays are requested from the main process (Node/Chromium network stack),
// which is not limited by browser CORS / CSP rules.
const ALLOWED_HOSTS = ['date.nager.at', 'cdn.jsdelivr.net'];
ipcMain.handle('fetch-json', async (event, url) => {
  const u = new URL(url);
  if (!ALLOWED_HOSTS.includes(u.hostname)) throw new Error('Host not allowed');
  const res = await net.fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const text = await res.text();
  return text ? JSON.parse(text) : []; // empty body = no data for that country
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
