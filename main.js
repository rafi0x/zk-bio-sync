const { app, BrowserWindow, ipcMain, Menu, Tray } = require('electron');
const path = require('path');
const url = require('url');
const AutoLaunch = require('auto-launch');

const apiService = require('./src/services/apiService.js');
const syncService = require('./src/services/syncService.js');
const { formatDeviceData } = require('./src/utils/common.js');

let serverProcess;
let mainWindow;
let tray = null;

function createTray() {
  tray = new Tray(path.join(__dirname, 'public', 'icon.png'));
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
        }
      }
    },
    {
      label: 'Quit',
      click: () => {
        app.isQuiting = true; // Set the flag to true before quitting
        app.quit();
      }
    }
  ]);
  tray.setToolTip('HrmX Sync');
  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 500,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      devTools: true // Always enable DevTools
    },
    icon: path.join(__dirname, 'public', 'icon.png'),
    autoHideMenuBar: true,
    show: false // Start hidden
  });

  // Load the app
  if (app.isPackaged) {
    mainWindow.loadURL(url.format({
      pathname: path.join(__dirname, 'public', 'index.html'),
      protocol: 'file:',
      slashes: true
    }));
  } else {
    mainWindow.loadURL('http://localhost:4000');
  }

  // Open DevTools in a separate window (detached) when not packaged
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  Menu.setApplicationMenu(null);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('close', (event) => {
    if (!app.isQuiting) {
      event.preventDefault();
      mainWindow.hide();
    }
    return false;
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function startServer() {
  serverProcess = require('./server-electron.js');
}

app.whenReady().then(() => {
  if (process.platform === 'win32') {
    const autoLauncher = new AutoLaunch({
      name: 'HrmX Sync',
      path: app.getPath('exe')
    });
    autoLauncher.isEnabled().then((isEnabled) => {
      if (!isEnabled) autoLauncher.enable();
    });
  }
  startServer();
  createWindow();
  createTray();
  setupIpcHandlers();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

function setupIpcHandlers() {
  ipcMain.on('sync-now', async (event) => {
    try {
      mainWindow.webContents.send('sync-status', 'Synchronization started');
      const credentials = await syncService.getSavedCredentials();
      const period = await syncService.getSavedSyncPeriod();
      const result = await syncService.startSync(period, credentials, null);
      mainWindow.webContents.send('sync-results', result);
    } catch (error) {
      mainWindow.webContents.send('sync-results', {
        success: false,
        api: 'System',
        timestamp: new Date().toISOString(),
        error: error.message || 'Sync failed'
      });
      console.error('[Electron] Error in sync-now:', error);
    }
  });

  ipcMain.on('stop-sync', async (event) => {
    try {
      const result = await syncService.stopSync();
      mainWindow.webContents.send('sync-status', 'Synchronization stopped');
    } catch (error) {
      mainWindow.webContents.send('sync-results', {
        success: false,
        api: 'System',
        timestamp: new Date().toISOString(),
        error: error.message || 'Failed to stop sync'
      });
    }
  });

  ipcMain.on('get-settings', async (event) => {
    try {
      const authInfo = await syncService.getSavedCredentials();
      const syncPeriod = await syncService.getSavedSyncPeriod();
      mainWindow.webContents.send('settings', {
        username: authInfo.username,
        password: authInfo.password ? '********' : '',
        syncPeriod: syncPeriod,
        hasCredentials: !!(authInfo.username && authInfo.password),
        lastLogin: authInfo.lastLogin
      });
    } catch (error) {
      mainWindow.webContents.send('sync-results', {
        success: false,
        api: 'Settings',
        timestamp: new Date().toISOString(),
        error: error.message || 'Failed to get settings'
      });
    }
  });

  ipcMain.on('get-devices', async (event) => {
    try {
      const response = await apiService.getDevices();

      const devices = await formatDeviceData(response);

      mainWindow.webContents.send('devices-result', {
        success: true,
        devices: devices
      });
    } catch (error) {
      console.error('[Electron] Error getting devices:', error);
      mainWindow.webContents.send('devices-result', {
        success: false,
        error: error.message || 'Failed to get devices'
      });
    }
  });
}