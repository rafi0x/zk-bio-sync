import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import path from 'path';
import { fileURLToPath } from 'url';
import dbService from '../services/dbService.js';

// Get current file's directory (equivalent to __dirname in CommonJS)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define the file path for our database
const dbFilePath = path.join(__dirname, '../../db.json');

// Create adapter and db instance
const adapter = new JSONFile(dbFilePath);
const db = new Low(adapter);

async function cleanupDb() {
  console.log('Starting database cleanup...');

  try {
    // Read existing data
    await db.read();

    // Extract essential data and remove syncHistory
    const { auth, config, devices = [] } = db.data;

    // Add tokenGeneratedAt if it doesn't exist (for token renewal feature)
    if (!auth.tokenGeneratedAt && auth.token) {
      auth.tokenGeneratedAt = auth.lastLogin || new Date().toISOString();
    }

    // Create new structure without syncHistory
    db.data = {
      auth,
      config,
      devices
    };

    // Write back to file
    await db.write();

    console.log('Database cleanup completed successfully');
    console.log('- Removed syncHistory from database');
    console.log('- Sync logs will now be stored in memory only');
  } catch (error) {
    console.error('Error cleaning up database:', error);
  }
}

// Utility to clean up duplicate device records in the database
async function cleanupDeviceRecords() {
  console.log('Starting database cleanup for device records...');

  try {
    // Get all devices from the database
    const devices = await dbService.getDevices();
    console.log(`Found ${devices.length} device records`);

    // Create a map to store unique devices by ID
    const deviceMap = new Map();

    // First pass: build a map of devices with their properties
    for (const device of devices) {
      const deviceId = String(device.id);

      if (!deviceMap.has(deviceId)) {
        deviceMap.set(deviceId, { ...device });
      } else {
        // If we already have this device ID, merge properties
        const existingDevice = deviceMap.get(deviceId);

        // Merge properties, prioritizing non-null values
        Object.keys(device).forEach(key => {
          if (device[ key ] !== null && device[ key ] !== undefined) {
            existingDevice[ key ] = device[ key ];
          }
        });
      }
    }

    // Convert map back to array
    const mergedDevices = Array.from(deviceMap.values());
    console.log(`After merging, ${mergedDevices.length} unique devices remain`);

    // Save the cleaned-up devices back to the database
    await dbService.saveDevices(mergedDevices);
    console.log('Device records cleanup completed successfully');

    return {
      success: true,
      originalCount: devices.length,
      mergedCount: mergedDevices.length,
      devices: mergedDevices
    };
  } catch (error) {
    console.error('Error during device records cleanup:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Execute if run directly
if (process.argv[ 1 ] === fileURLToPath(import.meta.url)) {
  cleanupDeviceRecords()
    .then(result => {
      console.log('Cleanup result:', result);
      process.exit(0);
    })
    .catch(error => {
      console.error('Cleanup failed:', error);
      process.exit(1);
    });
}

// Run the cleanup
cleanupDb();

export default cleanupDeviceRecords;