const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// Ensure public directory exists with required files
const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir);
}

// Check for icon files
const pngIconPath = path.join(publicDir, 'icon.png');
const icoIconPath = path.join(publicDir, 'icon.ico');

if (!fs.existsSync(pngIconPath)) {
  require('./create-icon.js');
}

if (!fs.existsSync(icoIconPath)) {
  fs.writeFileSync(icoIconPath, '// Placeholder ICO file');
}

// Run the electron-builder
exec('npx electron-builder --win', (error, stdout, stderr) => {
  if (error) {
    console.error(`Error during build: ${error.message}`);
    return;
  }

  if (stderr) {
    console.error(`Build stderr: ${stderr}`);
  }

  console.log('Build completed successfully!');
  console.log('You can find the packaged application in the dist/ directory');
});