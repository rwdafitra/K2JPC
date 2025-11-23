const express = require("express");
const PouchDB = require("pouchdb");
const app = express();
const port = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("K3 JPC App Running 🚧");
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
