// public/db.js — FINAL FIXED & COMPLETE

const DB_NAME = 'minerba_k3_stable_v1'; 
const REMOTE_API = '/api'; 

// --- 1. Init PouchDB ---
let db;
try {
    // Pastikan PouchDB sudah diload di index.html
    db = new PouchDB(DB_NAME);
    console.log(`✅ Database ${DB_NAME} Initialized`);
} catch(e) {
    console.error("❌ PouchDB Failed:", e);
}

// --- 2. Register Index (Opsional tapi bagus untuk performa) ---
if (db && typeof db.createIndex === 'function') {
    db.createIndex({
        index: { fields: ['created_at'], name: 'idx_date', ddoc: 'idx_date' }
    }).catch(console.warn);
}

// --- 3. Definisi API Database (_k3db) ---
const _k3db = {
    db: db,

    /**
     * FUNGSI UTAMA YANG HILANG SEBELUMNYA
     * Mengambil daftar semua inspeksi untuk ditampilkan di Dashboard/List
     */
    async listInspections() {
        if (!db) return [];
        try {
            // Ambil semua dokumen
            const result = await db.allDocs({
                include_docs: true,
                descending: true // Urutkan dari ID terbaru (biasanya)
            });

            // Filter hanya data inspeksi yang belum dihapus
            const inspections = result.rows
                .map(row => row.doc)
                .filter(doc => doc.type === 'inspection' && !doc.deleted);
            
            // Sorting manual berdasarkan created_at (terbaru di atas)
            return inspections.sort((a, b) => {
                return new Date(b.created_at) - new Date(a.created_at);
            });

        } catch (error) {
            console.error("Error listing inspections:", error);
            return [];
        }
    },

    /**
     * Mengambil 1 data detail inspeksi berdasarkan ID
     */
    async getInspection(id) {
        try {
            return await db.get(id);
        } catch (error) {
            console.error("Gagal mengambil detail:", error);
            return null;
        }
    },

    /**
     * Menghapus inspeksi (Soft Delete)
     */
    async deleteInspection(id) {
        try {
            const doc = await db.get(id);
            doc.deleted = true;      // Tandai terhapus
            doc.synced = false;      // Tandai perlu sync ke server (untuk menghapus di server juga)
            return await db.put(doc);
        } catch (error) {
            console.error("Gagal menghapus:", error);
            throw error;
        }
    },

    /* =========================================
       LOGIC SAVE (Dari kode Anda)
       ========================================= */
    async saveInspection(doc, attachments = []) {
        if(!db) throw new Error("Database error");
        
        // 1. Setup ID & Timestamp
        if (!doc._id) {
            // Buat ID unik
            doc._id = `insp_${Date.now()}_${Math.floor(Math.random()*1000)}`;
            doc.created_at = new Date().toISOString();
        }
        doc.type = 'inspection';
        doc.synced = false; 
        doc.deleted = false;

        // 2. Cek Revisi (Jika edit data lama agar tidak konflik)
        try {
            const existing = await db.get(doc._id);
            doc._rev = existing._rev;
            // Pertahankan created_at asli jika edit
            if(existing.created_at) doc.created_at = existing.created_at;
        } catch(e) {}

        // 3. Simpan Dokumen Utama (Metadata)
        let res = await db.put(doc);
        console.log("📝 Metadata tersimpan:", res.id);

        // 4. Simpan Attachments (Looping Aman)
        if (attachments.length > 0) {
            for (let i = 0; i < attachments.length; i++) {
                const file = attachments[i];
                
                // PENTING: Ambil dokumen terbaru dulu untuk mendapatkan _rev paling update
                try {
                    const currentDoc = await db.get(doc._id);
                    console.log(`🖼️ Uploading foto ${i+1}/${attachments.length}...`);
                    
                    await db.putAttachment(
                        doc._id, 
                        `foto_${i+1}.jpg`, // Nama file di DB
                        currentDoc._rev,   // Gunakan _rev TERBARU
                        file,              // File Object (Binary)
                        file.type || 'image/jpeg' // Fallback type
                    );
                } catch (err) {
                    console.error("Gagal simpan foto:", err);
                }
            }
        }
        
        // Tandai agar sync engine tahu ada perubahan (trigger revisi baru setelah attachment masuk)
        try {
            const finalDoc = await db.get(doc._id);
            finalDoc.synced = false;
            await db.put(finalDoc);
        } catch(e) {}

        return res;
    },

    // --- SYNC ENGINE (Logic dari kode Anda) ---
    async sync() {
        if(!navigator.onLine) throw new Error("Offline. Cek internet.");
        let stats = { pushed: 0, pulled: 0 };

        // 1. PUSH (Local -> Server)
        try {
            const allDocs = await db.allDocs({include_docs: true});
            const toPush = allDocs.rows
                .map(r => r.doc)
                .filter(d => d.synced === false && !d.deleted); // Hanya yang belum sync

            console.log(`📤 Uploading ${toPush.length} items...`);

            for(const doc of toPush) {
                // Ambil attachment lokal sebelum push
                const fullDoc = await db.get(doc._id, {attachments: true});
                const payload = {...fullDoc};
                delete payload._rev; // Jangan kirim _rev lokal ke server
                
                const endpoint = (doc.type === 'user') ? `${REMOTE_API}/users` : `${REMOTE_API}/inspeksi/${doc._id}`;
                
                const res = await fetch(endpoint, {
                    method: 'PUT', headers: {'Content-Type':'application/json'},
                    body: JSON.stringify(payload)
                });
                
                if(res.ok) {
                    const currentLocal = await db.get(doc._id);
                    currentLocal.synced = true;
                    await db.put(currentLocal);
                    stats.pushed++;
                }
            }
        } catch (e) {
            console.error("Push Error:", e);
        }

        // 2. PULL (Server -> Local)
        const pull = async (url) => {
            try {
                const res = await fetch(url);
                if(res.ok) {
                    const data = await res.json();
                    for(let d of data) {
                        if(d.deleted) continue;

                        // Hapus Attachments dari server agar DB HP tidak berat
                        delete d._attachments;

                        try {
                            // Cek apakah data sudah ada di HP?
                            const local = await db.get(d._id);
                            
                            // Jika ada, UPDATE menggunakan _rev lokal agar tidak konflik
                            d._rev = local._rev; 
                            d.synced = true; // Tandai sudah sync
                            await db.put(d);
                        } catch(e) { 
                            // Jika data BARU (tidak ada di HP)
                            delete d._rev; // Hapus rev server agar dianggap baru oleh PouchDB
                            d.synced = true; 
                            await db.put(d); 
                        }
                        stats.pulled++;
                    }
                }
            } catch(e) { console.warn("Pull error", url); }
        };
        
        // Pull Users & Inspeksi
        await pull(`${REMOTE_API}/users`);
        await pull(`${REMOTE_API}/inspeksi`);

        return stats;
    }
};

// Expose ke Window agar bisa dipanggil main.js
window._k3db = _k3db;