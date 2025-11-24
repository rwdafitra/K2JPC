// server.js - Backend Express untuk melayani PWA dan API data
const express = require("express");
const path = require("path");
const PouchDB = require("pouchdb");
const app = express();

// --- KONFIGURASI MIDDLEWARE ---
app.use(express.json()); // Middleware untuk parsing body JSON
app.use(express.static(path.join(__dirname, 'public'))); // PWA assets ada di root

// --- KONFIGURASI DATABASE COUCHDB (DI SISI SERVER YANG AMAN) ---

PouchDB.plugin(require("pouchdb-find"));

// Ambil URL CouchDB dari variabel lingkungan Railway
const COUCHDB_URL_BASE = process.env.COUCHDB_URL || process.env.DATABASE_URL;
const DB_NAME = "k3-inspeksi";

if (!COUCHDB_URL_BASE) {
  console.error("FATAL: Variabel lingkungan CouchDB (COUCHDB_URL/DATABASE_URL) tidak ditemukan!");
  // Set default (hanya untuk lokal testing jika tidak ada env, JANGAN digunakan di Railway)
  // const db = new PouchDB('http://localhost:5984/' + DB_NAME);
  throw new Error("Koneksi CouchDB gagal.");
}

// Inisialisasi PouchDB server-side untuk koneksi ke CouchDB permanen
const db = new PouchDB(COUCHDB_URL_BASE + DB_NAME);

// Pastikan index untuk 'type' tersedia di CouchDB (sangat penting untuk listInspections)
db.createIndex({ index: { fields: ['type', 'created_at'] } }).catch(err => console.error("Gagal membuat index CouchDB:", err));

// --- API ENDPOINTS ---

// POST: Menerima data inspeksi dari klien dan menyimpannya di CouchDB
app.post("/api/inspeksi", async (req, res) => {
  let doc = { ...req.body };
  
  // Doc dari klien (PouchDB lokal) sudah memiliki _id, type, dan created_at.
  // Pastikan kita menghapus _rev dari klien agar tidak ada konflik saat PUT/POST pertama kali ke CouchDB
  delete doc._rev; 
  
  // Karena klien sudah membuat doc._id (misal: 'ins_17000000000'), kita tinggal PUT/POST
  // Jika ini adalah doc baru (tidak ada _id), CouchDB akan membuatkannya, tapi kita harapkan _id dari klien.
  
  try {
    const response = await db.put(doc);
    // Jika PouchDB/CouchDB berhasil, response.id dan response.rev akan ada
    res.json({ success: true, id: response.id, rev: response.rev });
  } catch (err) {
    console.error("Error POST /api/inspeksi:", err);
    // Kirim error 500 jika ada masalah di database
    res.status(500).json({ error: "Gagal menyimpan data ke CouchDB.", details: err.message });
  }
});

// GET: Mengambil semua data inspeksi dari CouchDB untuk dikirim ke klien (Pull)
app.get("/api/inspeksi", async (req, res) => {
  try {
    // Menggunakan pouchdb-find untuk query yang lebih baik dan hanya mengambil 'inspection'
    const result = await db.find({ 
        selector: { type: 'inspection' }, 
        sort: [{ created_at: 'desc' }],
        limit: 9999 // Ambil semua data
    });
    // result.docs sudah berisi dokumen-dokumen yang valid (dengan _id dan _rev)
    res.json(result.docs);
  } catch (err) {
    console.error("Error GET /api/inspeksi:", err);
    res.status(500).json({ error: "Gagal mengambil data dari CouchDB.", details: err.message });
  }
});

// GET: Route fallback untuk melayani index.html pada semua request
app.get("/*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// --- SERVER LISTENER ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server Express berjalan di port ${PORT}`);
});
