// Use path module
const path = require('path');
const fs = require('fs');

// Define the file path for our database
// Check if we're in Electron environment
let dbFilePath;
if (process.type === 'renderer' || process.versions.electron) {
  // We're in Electron - use userData directory
  const { app } = require('electron');
  const userDataPath = app ? app.getPath('userData') : null;

  if (userDataPath) {
    dbFilePath = path.join(userDataPath, 'db.json');
  } else {
    // Fallback if app is not available
    dbFilePath = path.join(__dirname, '../../db.json');
  }
} else {
  // We're in Node.js (non-Electron)
  dbFilePath = path.join(__dirname, '../../db.json');
}

// Define data structure - removing syncHistory
const defaultData = {
  auth: {
    username: '',
    password: '',
    token: null,
    tokenGeneratedAt: null, // Add timestamp when token was generated
    lastLogin: null
  },
  config: {
    syncPeriod: '5', // Default to 5 minutes
    serverUrl: null,
    lastSyncTime: null,
    isRunning: false
  },
  devices: [] // Store devices and their company IDs
};

// Declare variables that will be initialized in the init method
let db;
let adapter;

class DbService {
  constructor () {
    this.initialized = false;
    this.initPromise = null;
  }

  async init() {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = new Promise(async (resolve) => {
      if (!this.initialized) {
        try {
          // Use dynamic import for lowdb
          const lowdbModule = await import('lowdb');
          const { Low } = lowdbModule;

          const JSONFileModule = await import('lowdb/node');
          const { JSONFile } = JSONFileModule;

          // Create adapter and db instance
          adapter = new JSONFile(dbFilePath);
          db = new Low(adapter, defaultData);

          // Make sure directory exists
          const dbDir = path.dirname(dbFilePath);
          if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
          }

          // If db.json doesn't exist, write the default data
          try {
            await db.read();
            // Check if data structure is valid
            if (!db.data || typeof db.data !== 'object') {
              db.data = { ...defaultData };
              await db.write();
            }
          } catch (readError) {
            db.data = { ...defaultData };
            await db.write();
          }

          // Validate and correct invalid dates
          if (db.data.auth.tokenGeneratedAt && isNaN(Date.parse(db.data.auth.tokenGeneratedAt))) {
            console.warn('[dbService] Invalid tokenGeneratedAt, resetting to null');
            db.data.auth.tokenGeneratedAt = null;
          }
          if (db.data.auth.lastLogin && isNaN(Date.parse(db.data.auth.lastLogin))) {
            console.warn('[dbService] Invalid lastLogin, resetting to null');
            db.data.auth.lastLogin = null;
          }
          if (db.data.config.lastSyncTime && isNaN(Date.parse(db.data.config.lastSyncTime))) {
            console.warn('[dbService] Invalid lastSyncTime, resetting to null');
            db.data.config.lastSyncTime = null;
          }

          await db.write();
          this.initialized = true;
        } catch (error) {
          console.error('Error initializing database:', error);
        }
      }
      resolve(db ? db.data : defaultData);
    });

    return this.initPromise;
  }

  async getData() {
    await this.init();
    return db.data;
  }

  async saveData() {
    if (db) {
      await db.write();
    }
  }

  // Authentication Methods
  async getAuthInfo() {
    await this.init();
    return db.data.auth;
  }

  async saveAuthInfo(username, password, token) {
    await this.init();
    const now = new Date();
    db.data.auth.username = username;
    db.data.auth.password = password;
    db.data.auth.token = token;
    db.data.auth.tokenGeneratedAt = now.toISOString();
    db.data.auth.lastLogin = now.toISOString();
    await this.saveData();
    return db.data.auth;
  }

  async updateToken(token) {
    await this.init();
    db.data.auth.token = token;
    try {
      const now = new Date();
      db.data.auth.tokenGeneratedAt = now.toISOString();
    } catch (err) {
      console.error('Error setting date in updateToken:', err);
      db.data.auth.tokenGeneratedAt = new Date(Date.now()).toISOString();
    }
    await this.saveData();
  }

  async clearToken() {
    await this.init();
    db.data.auth.token = null;
    await this.saveData();
  }

  // Configuration Methods
  async getConfig() {
    await this.init();
    // Ensure lastSyncTime is a valid ISO string
    if (!db.data.config.lastSyncTime || isNaN(Date.parse(db.data.config.lastSyncTime))) {
      db.data.config.lastSyncTime = new Date().toISOString();
      await this.saveData();
    }
    return db.data
  }

  async getServerUrl() {
    await this.init();
    return db.data.config.serverUrl;
  }

  async saveServerUrl(url) {
    await this.init();
    db.data.config.serverUrl = url;
    await this.saveData();
    return url;
  }

  async saveSyncPeriod(period) {
    await this.init();
    db.data.config.syncPeriod = period;
    await this.saveData();
    return db.data.config;
  }

  async updateSyncStatus(isRunning) {
    await this.init();
    db.data.config.isRunning = isRunning;
    if (isRunning) {
      db.data.config.lastSyncTime = new Date().toISOString();
    }
    await this.saveData();
    return db.data.config;
  }

  // Device Management Methods
  async getDevices() {
    await this.init();
    return db.data.devices || [];
  }

  async saveDevices(devices) {
    await this.init();

    // Get existing devices
    const existingDevices = db.data.devices || [];

    // Create a map of existing devices by IP for quick lookup
    const existingDevicesByIp = new Map();
    existingDevices.forEach(device => {
      if (device.ip) {
        existingDevicesByIp.set(device.ip, device);
      }
    });

    // Add only new devices that don't exist based on IP
    devices.forEach(newDevice => {
      if (newDevice.ip && !existingDevicesByIp.has(newDevice.ip)) {
        existingDevices.push(newDevice);
      }
    });

    db.data.devices = existingDevices;
    await this.saveData();
    return existingDevices;
  }

  async updateDeviceCompanyId(deviceId, companyId) {
    await this.init();

    // Convert deviceId to string to ensure consistent comparison
    const deviceIdStr = String(deviceId);

    // Find device by string comparison
    const deviceIndex = db.data.devices.findIndex(d => String(d.id) == deviceIdStr);

    if (deviceIndex >= 0) {
      // Update existing device
      db.data.devices[ deviceIndex ].companyId = companyId;
    } else {
      // Add new device with company ID (store ID as string for consistency)
      db.data.devices.push({
        id: deviceIdStr,
        companyId: companyId
      });
    }

    await this.saveData();
    return db.data.devices;
  }

  async getDeviceCompanyId(deviceId) {
    await this.init();
    // Convert to string for consistent comparison
    const deviceIdStr = String(deviceId);
    const device = db.data.devices.find(d => String(d.id) === deviceIdStr);
    return device ? device.companyId : null;
  }
}

const dbService = new DbService();
module.exports = dbService;