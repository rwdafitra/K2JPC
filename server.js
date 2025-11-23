const express = require("express");
const path = require("path");

const app = express();

// Serve static files from public folder
app.use(express.static(path.join(__dirname, "public")));

// Fallback to index.html for SPA routing
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));
