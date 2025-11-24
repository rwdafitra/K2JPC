// server.js - Backend Express untuk melayani PWA dan API data
const express = require("express");
const path = require("path");
const PouchDB = require("pouchdb");
const app = express();

// --- KONFIGURASI MIDDLEWARE ---
app.use(express.json()); // Middleware untuk parsing body JSON

// Melayani semua file PWA dari folder 'public'
app.use(express.static(path.join(__dirname, 'public'))); 

// --- KONFIGURASI DATABASE COUCHDB (DI SISI SERVER YANG AMAN) ---

PouchDB.plugin(require("pouchdb-find"));

// Daftar variabel lingkungan yang mungkin mengandung URL CouchDB (termasuk 'inspeksi_k3')
const ENV_VARS = ['COUCHDB_URL', 'DATABASE_URL', 'INSPEKSI_K3', 'inspeksi_k3'];
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
  throw new Error("Koneksi CouchDB gagal. Cek variabel lingkungan di Railway.");
}

// PERBAIKAN URL KONKARENASI: Pastikan ada '/' di antara base URL dan DB Name
const db = new PouchDB(COUCHDB_URL_BASE + '/' + DB_NAME); 

// Pastikan index untuk 'type' tersedia di CouchDB
db.createIndex({ index: { fields: ['type', 'created_at'] } }).catch(err => console.error("Gagal membuat index CouchDB:", err));
db.info().then(info => console.log(`✅ Terhubung ke DB: ${info.db_name}. Dokumen: ${info.doc_count}`)).catch(err => console.error("🚨 GAGAL TERHUBUNG KE COUCHDB:", err.message));


// --- API ENDPOINTS (PUSH & PULL) ---

// POST: Menerima data inspeksi dari klien (PUSH)
app.post("/api/inspeksi", async (req, res) => {
  let doc = { ...req.body };
  delete doc._rev;
  
  try {
    const response = await db.put(doc);
    res.json({ success: true, id: response.id, rev: response.rev });
  } catch (err) {
    console.error("Error POST /api/inspeksi:", err);
    res.status(500).json({ error: "Gagal menyimpan data ke CouchDB.", details: err.message });
  }
});

// GET: Mengambil semua data inspeksi dari CouchDB (PULL)
app.get("/api/inspeksi", async (req, res) => {
  try {
    const result = await db.find({ 
        selector: { type: 'inspection' }, 
        sort: [{ created_at: 'desc' }],
        limit: 9999 
    });
    res.json(result.docs);
  } catch (err) {
    console.error("Error GET /api/inspeksi:", err);
    res.status(500).json({ error: "Gagal mengambil data dari CouchDB.", details: err.message });
  }
});

// GET: Route fallback untuk melayani index.html
app.get("/*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// --- SERVER LISTENER ---
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`🚀 Server Express berjalan di port ${PORT}`);
});