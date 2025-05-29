const cors = require('cors');
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const apiRoutes = require('./src/routes/api.js');

// Get directory name equivalent to __dirname in CommonJS
// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

// Initialize express app
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Make io globally available for services
global.io = io;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Make io accessible to routes
app.set('io', io);

// API routes
app.use('/api', apiRoutes);

// Socket.io connection
io.on('connection', (socket) => {
  // Removed console.log('New client connected');

  socket.on('disconnect', () => {
    // Removed console.log('Client disconnected');
  });
});

// Start server
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  // Removed console.log(`Server running on port ${PORT}`);
});