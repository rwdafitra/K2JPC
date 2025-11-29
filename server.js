// server.js — FINAL STABLE & LIGHTWEIGHT
const express = require("express");
const path = require("path");
const PouchDB = require("pouchdb");
const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// CORS
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, PUT, POST, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    next();
});

PouchDB.plugin(require("pouchdb-find"));

// Database Connection
const TARGET_URL = process.env.COUCHDB_URL || process.env.DATABASE_URL || "inspeksi_k3_local_fallback";
const db = new PouchDB(TARGET_URL);

// Cek status awal
db.info().then(info => {
    console.log(`✅ TERHUBUNG KE DB: ${info.db_name}`);
    console.log(`📊 TOTAL DOKUMEN: ${info.doc_count}`);
}).catch(e => console.error("❌ GAGAL KONEKSI:", e.message));

// --- API ROUTES ---

// 1. INSPEKSI (PUSH) - Simpan data dari HP
app.put("/api/inspeksi/:id", async (req, res) => {
    try {
        console.log(`📥 [PUSH] Terima data: ${req.params.id}`);
        const doc = req.body;
        doc._id = req.params.id;
        
        // Cek revisi jika ada
        try {
            const exist = await db.get(doc._id);
            doc._rev = exist._rev;
        } catch(e) {}
        
        const response = await db.put(doc);
        res.json(response);
    } catch (err) {
        console.error(`❌ [ERROR] Gagal simpan: ${err.message}`);
        res.status(500).json({ error: err.message });
    }
});

// 2. INSPEKSI (PULL) - VERSI RINGAN (NO ATTACHMENTS)
app.get("/api/inspeksi", async (req, res) => {
    try {
        // Default ambil 50 data terbaru agar sync cepat
        const limit = parseInt(req.query.limit) || 50; 
        
        // JANGAN gunakan attachments: true di sini
        const result = await db.allDocs({ 
            include_docs: true, 
            descending: true,
            limit: limit 
        });
        
        const docs = result.rows
            .map(row => row.doc)
            .filter(d => d.type === 'inspection' && !d.deleted);

        // Hapus properti _attachments dari JSON agar payload kecil
        docs.forEach(d => delete d._attachments);

        console.log(`📤 [PULL] Mengirim ${docs.length} dokumen (Metadata Only)`);
        res.json(docs);
    } catch (err) {
        console.error("Pull Error:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// 3. AKSES GAMBAR LANGSUNG (ON-DEMAND)
// Endpoint ini dipanggil saat user buka halaman Detail
app.get("/api/inspeksi/:id/:attachment", async (req, res) => {
    try {
        const { id, attachment } = req.params;
        const blob = await db.getAttachment(id, attachment);
        res.type('image/jpeg'); // Sesuaikan jika ada png
        res.send(blob);
    } catch (e) {
        res.status(404).send("Image not found");
    }
});

// 4. USERS (PUSH & PULL)
app.put("/api/users", async (req, res) => {
    try {
        const user = req.body;
        user._id = user._id || `user_${user.username}`;
        try {
            const exist = await db.get(user._id);
            user._rev = exist._rev;
        } catch(e) {}
        const response = await db.put(user);
        res.json(response);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/users", async (req, res) => {
    try {
        const result = await db.allDocs({ include_docs: true });
        const users = result.rows.map(r => r.doc).filter(d => d.type === 'user');
        res.json(users);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 5. GLOBAL SEARCH (Optional - Cari data lama di server)
app.get("/api/search", async (req, res) => {
    const q = (req.query.q || '').toLowerCase();
    try {
        const result = await db.allDocs({ include_docs: true, descending: true });
        const docs = result.rows
            .map(r => r.doc)
            .filter(d => d.type === 'inspection' && !d.deleted)
            .filter(d => JSON.stringify(d).toLowerCase().includes(q));
        
        docs.forEach(d => delete d._attachments);
        res.json(docs);
    } catch(e) { res.status(500).json([]); }
});

app.get("*", (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));