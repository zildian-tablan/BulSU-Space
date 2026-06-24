// Combined server startup for production
const { spawn } = require('child_process');

console.log('Starting BulSU Space API server...');

// Start the main API server
const apiServer = spawn('node', ['server.js'], {
  stdio: 'inherit',
  env: { ...process.env, PORT: process.env.PORT || 5000 }
});

// Handle process termination
process.on('SIGTERM', () => {
  console.log('Terminating API server...');
  apiServer.kill('SIGTERM');
});

process.on('SIGINT', () => {
  console.log('Terminating API server...');
  apiServer.kill('SIGINT');
});

apiServer.on('exit', (code) => {
  console.log(`API server exited with code ${code}`);
});
