const apiService = require('./apiService.js');
const dbService = require('./dbService.js');

class SyncService {
  constructor () {
    this.intervalId = null;
    this.syncPeriods = {
      '5': 5 * 60 * 1000,     // 5 minutes
      '10': 10 * 60 * 1000,   // 10 minutes
      '30': 30 * 60 * 1000,   // 30 minutes
    };
    this.initializeFromDb();
  }

  async initializeFromDb() {
    try {
      // Load configuration from database
      const config = await dbService.getConfig();

      // If sync was running before app shutdown, restore it
      if (config.isRunning) {
        const authInfo = await dbService.getAuthInfo();

        if (authInfo && authInfo.username && authInfo.password) {
          // We need to defer this to make sure everything is ready
          setTimeout(() => {
            if (global.io) { // Make sure socket.io is available
              this.startSync(
                config.syncPeriod,
                { username: authInfo.username, password: authInfo.password },
                global.io
              );
            } else {
              dbService.updateSyncStatus(false);
            }
          }, 2000);
        } else {
          await dbService.updateSyncStatus(false);
        }
      } else {
      }
    } catch (error) {
      console.error('Error initializing sync service:', error);
      await dbService.updateSyncStatus(false);
    }
  }

  async startSync(period, credentials, io) {
    // Clear any existing interval
    this.stopSync();

    // Save the sync period to database
    await dbService.saveSyncPeriod(period);

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

    // Update sync status in database
    await dbService.updateSyncStatus(true);

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

  // Add the missing getConfig method
  async getConfig() {
    return await dbService.getConfig();
  }

  // Add getServerUrl method
  async getServerUrl() {
    return await dbService.getServerUrl();
  }

  // Add saveCredentials method
  async saveCredentials(username, password) {
    return await dbService.saveAuthInfo(username, password, null);
  }

  // Add saveServerUrl method
  async saveServerUrl(url) {
    return await dbService.saveServerUrl(url);
  }
}

const syncService = new SyncService();
module.exports = syncService;