// server.js - Backend Express untuk melayani PWA dan API data
const express = require("express");
const path = require("path");
const PouchDB = require("pouchdb");
const app = express();

// --- KONFIGURASI DATABASE ---

// PouchDB digunakan di sisi server untuk terhubung ke CouchDB via HTTP adapter
// Ini akan memastikan data Anda permanen (tidak hilang saat deploy)
PouchDB.plugin(require("pouchdb-find"));

// Railway menyuntikkan variabel koneksi ke CouchDB (misal: COUCHDB_URL atau DATABASE_URL)
const COUCHDB_URL_BASE = process.env.COUCHDB_URL || process.env.DATABASE_URL;
const DB_NAME = "k3-inspeksi";

if (!COUCHDB_URL_BASE) {
  // Peringatan ini penting jika koneksi database gagal
  console.error("FATAL: Variabel lingkungan CouchDB (COUCHDB_URL/DATABASE_URL) tidak ditemukan!");
  // Server akan tetap berjalan, tetapi API data akan gagal atau crash saat inisialisasi.
  // Dalam kasus ini, kita paksa error jika variabel utama hilang, tetapi coba terus.
}

// Inisialisasi PouchDB dengan URL CouchDB permanen
// PouchDB akan menggunakan HTTP adapter karena diberi URL lengkap (http/https)
// Pastikan nama database '/k3-inspeksi' ditambahkan di akhir URL base
const db = new PouchDB((COUCHDB_URL_BASE || 'http://localhost:5984/') + '/' + DB_NAME);

// Pastikan koneksi ke DB berhasil diawal (opsional, tapi bagus untuk logging)
db.info().then(info => {
    console.log(`✅ Terhubung ke CouchDB: ${info.db_name}. Dokumen: ${info.doc_count}`);
}).catch(err => {
    console.error("🚨 GAGAL TERHUBUNG KE COUCHDB. Cek variabel lingkungan.", err.message);
    // Server tetap berjalan untuk melayani file statis meskipun API gagal.
});

// --- KONFIGURASI SERVER ---

const PORT = process.env.PORT || 8080;

app.use(express.json()); // Middleware untuk parsing body JSON
app.use(express.static(path.join(__dirname, "public"))); // Serving file statis dari folder /public

// --- API ROUTES ---

// POST: Menyimpan data inspeksi baru
app.post("/api/inspeksi", async (req, res) => {
  const doc = {
    _id: "ins_" + Date.now(),
    ...req.body,
    type: 'inspection', // Tambahkan type untuk memudahkan query dengan pouchdb-find
    created_at: new Date().toISOString()
  };

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

// GET: Mengambil semua data inspeksi
app.get("/api/inspeksi", async (req, res) => {
  try {
    // Menggunakan allDocs untuk mendapatkan semua dokumen (lebih sederhana)
    const result = await db.allDocs({ include_docs: true, descending: true });
    res.json(result.rows.map(r => r.doc));
  } catch (err) {
    console.error("Error GET /api/inspeksi:", err);
    res.status(500).json({ error: "Gagal mengambil data dari CouchDB.", details: err.message });
  }
});

// GET: Route fallback untuk melayani index.html pada semua request (penting untuk PWA router)
app.get("*", (req, res) => {
  // Jika URL tidak cocok dengan file statis atau API, kirimkan index.html (untuk routing frontend)
  res.sendFile(path.join(__dirname, "public/index.html"));
});

// --- START SERVER ---

app.listen(PORT, () => console.log(`🚀 Server running successfully on port ${PORT}`));
