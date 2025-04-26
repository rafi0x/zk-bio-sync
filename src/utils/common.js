const dbService = require("../services/dbService");

async function formatDeviceData(payload) {
  if (!payload.success) {
    return res.status(400).json({
      success: false,
      error: payload.error || 'Failed to fetch devices from API'
    });
  }

  // Get stored device settings
  const storedDevices = await dbService.getDevices();
  const storedDevicesMap = new Map();

  // Create a map for easy lookup
  storedDevices.forEach(device => {
    storedDevicesMap.set(device.id.toString(), device);
  });

  // Merge API device data with stored company IDs
  const devices = payload.data.data.map(device => {
    const storedDevice = storedDevicesMap.get(device.id.toString());
    return {
      id: storedDevice.id,
      sn: device.sn,
      alias: device.alias,
      ip: device.ip_address,
      lastActivity: device.last_activity,
      companyId: storedDevice.companyId,
      status: device.status
    };
  });

  return devices;
}

module.exports = {
  formatDeviceData
};