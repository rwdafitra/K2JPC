const express = require("express");
const path = require("path");
const PouchDB = require("pouchdb");
const app = express();

PouchDB.plugin(require("pouchdb-find"));

const PORT = process.env.PORT || 8080;
const db = new PouchDB("k3-inspeksi");

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.post("/api/inspeksi", async (req, res) => {
  const doc = {
    _id: "ins_" + Date.now(),
    ...req.body,
    created_at: new Date().toISOString()
  };

  try {
    await db.put(doc);
    res.json({ success: true, doc });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/inspeksi", async (req, res) => {
  const result = await db.allDocs({ include_docs: true });
  res.json(result.rows.map(r => r.doc));
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
