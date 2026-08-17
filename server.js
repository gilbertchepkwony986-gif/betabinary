const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static assets with cache control
app.use(express.static(path.join(__dirname), {
  maxAge: '1h'
}));

// Fallback to index.html for single-page application routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`BetaBinary server running on port ${PORT}`);
});
