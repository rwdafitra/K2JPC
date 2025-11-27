// server.js - Backend Express untuk melayani PWA dan API data
const express = require("express");
const path = require("path");
const PouchDB = require("pouchdb");
const app = express();
const PORT = process.env.PORT || 8080;

// --- KONFIGURASI MIDDLEWARE ---
app.use(express.json()); 
app.use(express.static(path.join(__dirname))); // Melayani semua file PWA dari root

// --- KONFIGURASI DATABASE COUCHDB ---
PouchDB.plugin(require("pouchdb-find"));

// Ambil URL CouchDB dari Environment Variables
const COUCHDB_URL_BASE = process.env.COUCHDB_URL || process.env.DATABASE_URL || process.env.INSPEKSI_K3;
const DB_NAME = "inspeksi_k3"; 
if (!COUCHDB_URL_BASE) {
    console.error("FATAL: Variabel lingkungan CouchDB tidak ditemukan!");
    throw new Error("Koneksi CouchDB gagal.");
}
const couchdbUrl = COUCHDB_URL_BASE.endsWith('/') 
    ? COUCHDB_URL_BASE + DB_NAME 
    : COUCHDB_URL_BASE + '/' + DB_NAME;

const db = new PouchDB(couchdbUrl);
db.createIndex({ index: { fields: ['type', 'created_at'] } }).catch(err => console.error("Gagal membuat index CouchDB:", err));
db.info().then(info => console.log(`✅ Terhubung ke DB: ${info.db_name}.`)).catch(err => console.error("🚨 GAGAL TERHUBUNG KE COUCHDB:", err.message));


// --- API ENDPOINTS ---

// POST: Menerima data inspeksi baru (PUSH)
app.post("/api/inspeksi", async (req, res) => {
  let doc = { ...req.body };
  delete doc._rev; // Penting untuk dokumen baru
  if (!doc._id) doc._id = "ins_" + Date.now();
  
  try {
    const response = await db.put(doc);
    res.json({ success: true, id: response.id, rev: response.rev });
  } catch (err) {
    res.status(500).json({ error: "Gagal menyimpan data ke CouchDB.", details: err.message });
  }
});

// GET: Mengambil semua data inspeksi (PULL)
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

// GET: Mengambil data inspeksi berdasarkan ID (untuk detail page)
app.get("/api/inspeksi/:id", async (req, res) => {
    try {
        const doc = await db.get(req.params.id);
        res.json(doc);
    } catch (err) {
        res.status(404).json({ error: "Inspeksi tidak ditemukan." });
    }
});

// PUT: Mengupdate status atau menambahkan komentar (Tindak Lanjut)
app.put("/api/inspeksi/:id", async (req, res) => {
    try {
        const localDoc = await db.get(req.params.id);
        
        // Gabungkan dokumen lama dengan perubahan baru
        const updatedDoc = {
            ...localDoc, 
            ...req.body,
            _rev: localDoc._rev // Pastikan menggunakan _rev terbaru
        };

        const response = await db.put(updatedDoc);
        res.json({ success: true, id: response.id, rev: response.rev });

    } catch (err) {
        res.status(500).json({ error: "Gagal update dokumen di CouchDB.", details: err.message });
    }
});

// GET: Endpoint MOCK untuk Daftar User
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
  res.sendFile(path.join(__dirname, 'index.html'));
});

// --- START SERVER ---
app.listen(PORT, () => {
  console.log(`🚀 Server Express berjalan di port ${PORT}`);
});