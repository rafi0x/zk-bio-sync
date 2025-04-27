const apiService = require('./apiService.js');
const dbService = require('./dbService.js');

class SyncService {
  constructor () {
    this.intervalId = null;
    this.syncPeriods = {
      '5': 5 * 60 * 1000,     // 5 minutes
      '10': 10 * 60 * 1000,   // 10 minutes
      '30': 30 * 1000,   // 30 minutes
    };
    this.initializeFromDb();
  }

  async initializeFromDb() {
    try {
      console.log('[SyncService] Initializing from database...');
      // Load configuration from database
      const config = await dbService.getConfig();
      console.log('[SyncService] Config:', config);

      // Always start the sync process during initialization
      const authInfo = await dbService.getAuthInfo();
      console.log('[SyncService] Auth Info:', authInfo);

      if (authInfo && authInfo.username && authInfo.password) {
        // Start sync immediately
        await this.startSync(
          config.syncPeriod,
          { username: authInfo.username, password: authInfo.password },
          null // No socket.io in this context
        );
      } else {
        console.warn('[SyncService] Credentials are missing or invalid. Sync cannot be started.');
        await dbService.updateSyncStatus(false);
      }
    } catch (error) {
      console.error('[SyncService] Error initializing from database:', error);
      await dbService.updateSyncStatus(false);
    }
  }

  async startSync(period, credentials, io) {
    // Clear any existing interval
    this.stopSync();

    // Save the sync period and status to the database
    await dbService.saveSyncPeriod(period);
    await dbService.updateSyncStatus(true);

    // Initial login
    const loginResult = await apiService.login(credentials.username, credentials.password);

    if (!loginResult.success) {
      if (io) {
        io.emit('log', {
          timestamp: new Date().toISOString(),
          api: 'Login',
          success: false,
          error: loginResult.error,
        });
      }
      return { success: false, error: 'Login failed' };
    }

    // Emit the login success message
    if (io) {
      io.emit('log', {
        timestamp: new Date().toISOString(),
        api: 'Login',
        success: true,
        message: 'Authentication successful',
      });
    }

    // Run initial sync
    const initialResults = await apiService.runSyncSequence();
    initialResults.forEach(result => {
      if (io) {
        io.emit('log', result);
      }
    });

    // Schedule recurring sync
    const intervalTime = this.syncPeriods[ period ] || this.syncPeriods[ '5' ];
    this.intervalId = setInterval(async () => {
      const results = await apiService.runSyncSequence();
      results.forEach(result => {
        if (io) {
          io.emit('log', result);
        }
      });
    }, intervalTime);

    return { success: true };
  }

  async stopSync() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;

      // Update sync status in database
      await dbService.updateSyncStatus(false);

      return { success: true, message: 'Sync stopped' };
    }
    return { success: false, message: 'No active sync to stop' };
  }

  async isRunning() {
    // Get both memory and database states
    const memoryRunning = this.intervalId !== null;
    const dbRunning = (await dbService.getConfig()).isRunning;

    // If there's a mismatch, update the database to match the actual state
    if (dbRunning !== memoryRunning) {
      await dbService.updateSyncStatus(memoryRunning);
    }

    return memoryRunning;
  }

  async getSavedCredentials() {
    return dbService.getAuthInfo();
  }

  async getSavedSyncPeriod() {
    const config = await dbService.getConfig();
    return config.syncPeriod || '5';
  }

  /**
   * Get server URL from the database
   * @returns {Promise<string>} The server URL
   */
  async getServerUrl() {
    return await dbService.getServerUrl();
  }

  /**
   * Save server URL to the database
   * @param {string} url - The server URL to save
   * @returns {Promise<void>}
   */
  async saveServerUrl(url) {
    return await dbService.saveServerUrl(url);
  }

  /**
   * Save credentials directly (for Electron IPC)
   * @param {string} username - Username to save
   * @param {string} password - Password to save
   * @returns {Promise<void>}
   */
  async saveCredentials(username, password) {
    // Get current auth info to preserve the token if it exists
    const authInfo = await dbService.getAuthInfo();
    const token = authInfo ? authInfo.token : null;
    return await dbService.saveAuthInfo(username, password, token);
  }

  /**
   * Get configuration info including sync status
   * @returns {Promise<Object>} Configuration object
   */
  async getConfig() {
    const config = await dbService.getConfig();
    const isRunning = await this.isRunning();
    return {
      ...config,
      isRunning
    };
  }
}

const syncService = new SyncService();
module.exports = syncService;