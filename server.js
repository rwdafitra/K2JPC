const express = require("express");
const path = require("path");
const app = express();

const PORT = process.env.PORT || 8080;

// Serving Frontend Folder
app.use(express.static(path.join(__dirname, "public")));

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
