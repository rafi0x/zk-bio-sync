const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('Starting build process for HrmX Sync...');

// Ensure public directory exists with required files
const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir);
  console.log('Created public directory');
}

// Check for icon files
const pngIconPath = path.join(publicDir, 'icon.png');
const icoIconPath = path.join(publicDir, 'icon.ico');

if (!fs.existsSync(pngIconPath)) {
  console.log('No icon.png found, generating one...');
  require('./create-icon.js');
}

if (!fs.existsSync(icoIconPath)) {
  console.log('No icon.ico found, creating a placeholder...');
  fs.writeFileSync(icoIconPath, '// Placeholder ICO file');
  console.log('⚠️  Warning: Using placeholder icon.ico. For production, convert icon.png to icon.ico.');
}

// Run the electron-builder
console.log('Packaging application with electron-builder...');
exec('npx electron-builder --win', (error, stdout, stderr) => {
  if (error) {
    console.error(`Error during build: ${error.message}`);
    return;
  }

  if (stderr) {
    console.error(`Build stderr: ${stderr}`);
  }

  console.log(`Build stdout: ${stdout}`);
  console.log('Build completed successfully!');
  console.log('You can find the packaged application in the dist/ directory');
});