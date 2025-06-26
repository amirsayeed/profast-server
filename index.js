// index.js
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Default route
app.get('/', (req, res) => {
  res.send('Parcel Server is running!');
});

// Start server
app.listen(port, () => {
  console.log(`Server is listening on port ${port}`);
});
