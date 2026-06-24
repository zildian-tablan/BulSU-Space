const express = require('express');
const path = require('path');
const cors = require('cors');

// Create a new Express app for serving the React build
const app = express();

// Enable CORS
app.use(cors());

// Serve static files from the React build
app.use(express.static(path.join(__dirname, '../')));

// Always return the main index.html for any route (for client-side routing)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../index.html'));
});

// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Production server running on port ${PORT}`);
});
