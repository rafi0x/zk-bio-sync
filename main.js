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
  // Use try-catch to handle potential icon loading issues
  try {
    const iconPath = path.join(__dirname, 'public', 'icon.png');
    tray = new Tray(iconPath);
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
  } catch (error) {
    console.error('Error creating tray:', error);
  }
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
    const indexPath = path.join(__dirname, 'public', 'index.html');
    mainWindow.loadURL(url.format({
      pathname: indexPath,
      protocol: 'file:',
      slashes: true
    }));

    // For debugging production build
    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
      console.error('Failed to load:', errorCode, errorDescription);
    });
  } else {
    mainWindow.loadURL('http://localhost:4000');
  }

  // Open DevTools in a separate window (detached)
  if (!app.isPackaged) {
  }
  mainWindow.webContents.openDevTools({ mode: 'detach' });

  Menu.setApplicationMenu(null);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();

    // For debugging - uncomment to open DevTools in production
    // if (app.isPackaged) {
    //   mainWindow.webContents.openDevTools();
    // }
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
      await syncService.stopSync();
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

  // Add explicit handler for get-sync-status to fix the "res is not defined" error
  ipcMain.on('get-sync-status', async (event) => {
    try {
      const config = await syncService.getConfig();
      mainWindow.webContents.send('sync-status-result', {
        success: true,
        isRunning: config.isRunning || false,
        lastSyncTime: config.lastSyncTime || new Date().toISOString(),
        syncPeriod: config.syncPeriod || '5'
      });
    } catch (error) {
      console.error('[Electron] Error getting sync status:', error);
      mainWindow.webContents.send('sync-status-result', {
        success: false,
        isRunning: false,
        error: error.message || 'Failed to get sync status'
      });
    }
  });

  ipcMain.on('get-settings', async (event) => {
    try {
      const authInfo = await syncService.getSavedCredentials();
      const syncPeriod = await syncService.getSavedSyncPeriod();
      const serverUrl = await syncService.getServerUrl();

      mainWindow.webContents.send('settings', {
        username: authInfo.username,
        password: authInfo.password ? '********' : '',
        syncPeriod: syncPeriod,
        serverUrl: serverUrl,
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

  ipcMain.on('save-settings', async (event, data) => {
    try {
      if (data.username && data.password) {
        await syncService.saveCredentials(data.username, data.password);
      }

      if (data.period) {
        await syncService.saveSyncPeriod(data.period);
      }

      if (data.serverUrl) {
        await syncService.saveServerUrl(data.serverUrl);
      }

      mainWindow.webContents.send('settings-saved', {
        success: true
      });
    } catch (error) {
      mainWindow.webContents.send('settings-saved', {
        success: false,
        error: error.message || 'Failed to save settings'
      });
    }
  });

  ipcMain.on('get-devices', async (event) => {
    try {
      // First check if we have credentials and a token
      const authInfo = await syncService.getSavedCredentials();

      if (!authInfo || !authInfo.username || !authInfo.password) {
        // No valid credentials
        mainWindow.webContents.send('devices-result', {
          success: false,
          error: 'No valid credentials found. Please configure your settings first.'
        });
        return;
      }

      // Try to get devices with proper error handling
      const response = await apiService.getDevices();

      if (!response.success) {
        // API call failed - send the error
        mainWindow.webContents.send('devices-result', {
          success: false,
          error: response.error || 'Failed to fetch devices from the server'
        });
        return;
      }

      // We have devices data, format it
      try {
        const devices = await formatDeviceData(response);
        mainWindow.webContents.send('devices-result', {
          success: true,
          devices: devices || []
        });
      } catch (formatError) {
        console.error('[Electron] Error formatting device data:', formatError);
        mainWindow.webContents.send('devices-result', {
          success: false,
          error: 'Error processing device data: ' + formatError.message
        });
      }
    } catch (error) {
      console.error('[Electron] Error getting devices:', error);
      mainWindow.webContents.send('devices-result', {
        success: false,
        error: error.message || 'Failed to load devices'
      });
    }
  });
}