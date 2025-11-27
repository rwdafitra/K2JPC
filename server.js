// server.js - Backend Express untuk melayani PWA dan API data
const express = require("express");
const path = require("path");
const PouchDB = require("pouchdb");
const app = express();
const PORT = process.env.PORT || 8080;

// --- KONFIGURASI MIDDLEWARE ---
app.use(express.json()); 
// FIX KRITIS: Melayani semua file PWA dari folder 'public'
app.use(express.static(path.join(__dirname, 'public'))); 

// --- KONFIGURASI DATABASE COUCHDB ---
PouchDB.plugin(require("pouchdb-find"));

const ENV_VARS = ['COUCHDB_URL', 'DATABASE_URL', 'INSPEKSI_K3', 'inspeksi_k3', 'DB_URL'];
let COUCHDB_URL_BASE;

for (const envName of ENV_VARS) {
    if (process.env[envName]) {
        COUCHDB_URL_BASE = process.env[envName];
        console.log(`✅ Menggunakan variabel lingkungan: ${envName}`);
        break;
    }
}

const DB_NAME = "inspeksi_k3"; 
if (!COUCHDB_URL_BASE) {
    console.error("FATAL: Variabel lingkungan CouchDB tidak ditemukan!");
    throw new Error("Koneksi CouchDB gagal.");
}

let connectionUrl = COUCHDB_URL_BASE.replace(/\/$/, ''); 
if (!connectionUrl.endsWith('/' + DB_NAME)) {
    connectionUrl = connectionUrl + '/' + DB_NAME;
}

const db = new PouchDB(connectionUrl);
db.createIndex({ index: { fields: ['type', 'created_at'] } }).catch(err => console.error("Gagal membuat index CouchDB:", err));
db.info().then(info => console.log(`✅ Terhubung ke DB: ${info.db_name}. Dokumen: ${info.doc_count}`)).catch(err => console.error("🚨 GAGAL TERHUBUNG KE COUCHDB:", err.message));


// --- API ENDPOINTS ---

app.post("/api/inspeksi", async (req, res) => {
  let doc = { ...req.body };
  delete doc._rev; 
  if (!doc._id) doc._id = "ins_" + Date.now();
  
  try {
    const response = await db.put(doc);
    res.json({ success: true, id: response.id, rev: response.rev });
  } catch (err) {
    res.status(500).json({ error: "Gagal menyimpan data ke CouchDB.", details: err.message });
  }
});

app.get("/api/inspeksi", async (req, res) => {
  try {
    const result = await db.allDocs({ include_docs: true, descending: true });
    const inspectionDocs = result.rows
      .map(row => row.doc)
      .filter(doc => doc && doc.type === 'inspection');
    res.json(inspectionDocs);
  } catch (err) {
    res.status(500).json({ error: "Gagal mengambil data dari CouchDB.", details: err.message });
  }
});

app.get("/api/inspeksi/:id", async (req, res) => {
    try {
        const doc = await db.get(req.params.id);
        res.json(doc);
    } catch (err) {
        res.status(404).json({ error: "Inspeksi tidak ditemukan." });
    }
});

app.put("/api/inspeksi/:id", async (req, res) => {
    try {
        const localDoc = await db.get(req.params.id);
        const updatedDoc = {
            ...localDoc, 
            ...req.body,
            _rev: localDoc._rev 
        };

        const response = await db.put(updatedDoc);
        res.json({ success: true, id: response.id, rev: response.rev });

    } catch (err) {
        res.status(500).json({ error: "Gagal update dokumen di CouchDB.", details: err.message });
    }
});

const MOCK_USERS = [
    { id: 'usr_1', name: 'RW. Dafitra', role: 'Inspector', status: 'Active' },
    { id: 'usr_2', name: 'Bpk. Supervisor', role: 'Supervisor', status: 'Active' },
    { id: 'usr_3', name: 'Manager Tambang', role: 'Manager', status: 'Inactive' },
];
app.get("/api/users", (req, res) => {
    res.json(MOCK_USERS);
});

// GET: Route fallback untuk melayani index.html
app.get("*", (req, res) => {
  if (req.path.includes('.')) {
    return res.status(404).send('Not Found');
  }
  // FIX KRITIS: Mengarahkan ke index.html di dalam folder 'public'
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- START SERVER ---
app.listen(PORT, () => {
  console.log(`🚀 Server Express berjalan di port ${PORT}`);
});