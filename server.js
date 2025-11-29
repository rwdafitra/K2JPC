const express = require("express");
const path = require("path");
const PouchDB = require("pouchdb");
const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json({ limit: '50mb' })); // Support foto besar
app.use(express.static(path.join(__dirname, 'public')));

// Database Setup
PouchDB.plugin(require("pouchdb-find"));
const DB_URL = process.env.DATABASE_URL || process.env.COUCHDB_URL || 'http://localhost:5984/minerba_k3_db';
const db = new PouchDB(DB_URL);

console.log(`🔌 Connecting to DB: ${DB_URL.replace(/:[^:]*@/, ':****@')}`); // Hide pass in log

// --- API ROUTES ---

// 1. INSPEKSI (CRUD)
app.put("/api/inspeksi/:id", async (req, res) => {
    try {
        const doc = req.body;
        doc._id = req.params.id;
        
        // Cek existing untuk update _rev
        try {
            const exist = await db.get(doc._id);
            doc._rev = exist._rev;
        } catch(e) {} // New doc

        const response = await db.put(doc);
        res.json(response);
    } catch (err) {
        console.error("PUT Inspeksi Error:", err);
        res.status(500).json({ error: err.message });
    }
});

app.get("/api/inspeksi", async (req, res) => {
    try {
        const result = await db.find({
            selector: { type: 'inspection', deleted: { $ne: true } },
            limit: 2000
        });
        res.json(result.docs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. USERS (CRUD)
app.put("/api/users", async (req, res) => {
    try {
        const user = req.body;
        // Gunakan ID unik
        user._id = user._id || `user_${user.username}`;
        try {
            const exist = await db.get(user._id);
            user._rev = exist._rev;
        } catch(e) {}
        
        const response = await db.put(user);
        res.json(response);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get("/api/users", async (req, res) => {
    try {
        const result = await db.find({ selector: { type: 'user' } });
        res.json(result.docs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Fallback PWA
app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`🚀 MinerbaSafe Server running on port ${PORT}`));