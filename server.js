const express = require("express");
const path = require("path");
const PouchDB = require("pouchdb");
const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Database Setup
PouchDB.plugin(require("pouchdb-find"));

// Gunakan URL CouchDB publik/lokal, atau fallback ke memory/folder level server jika tidak ada couchdb external
// Ganti 'http://admin:password@localhost:5984/minerba_db' dengan kredensial CouchDB asli Anda
const COUCH_URL = process.env.COUCHDB_URL || process.env.DATABASE_URL || "inspeksi_level_db"; 

console.log(`🔌 Server DB Target: ${COUCH_URL}`);
const db = new PouchDB(COUCH_URL);

// --- API ROUTES ---

// Put Inspeksi (Sync Push)
app.put("/api/inspeksi/:id", async (req, res) => {
    try {
        const doc = req.body;
        doc._id = req.params.id;
        
        // Cek konflik
        try {
            const exist = await db.get(doc._id);
            doc._rev = exist._rev;
        } catch(e) {} 
        
        const response = await db.put(doc);
        res.json(response);
    } catch (err) {
        console.error("Save Error:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// Get Inspeksi (Sync Pull)
app.get("/api/inspeksi", async (req, res) => {
    try {
        // Ambil semua data inspeksi
        const result = await db.find({
            selector: { type: 'inspection' },
            limit: 2000
        });
        
        // Jika find gagal (misal di leveldb biasa), fallback allDocs
        if(!result.docs) {
             const all = await db.allDocs({include_docs: true});
             const filtered = all.rows.map(r=>r.doc).filter(d=>d.type==='inspection');
             return res.json(filtered);
        }
        
        res.json(result.docs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Users Route (Optional)
app.get("/api/users", async(req,res) => res.json([])); 

// SPA Fallback
app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`🚀 Server berjalan di http://localhost:${PORT}`);
});