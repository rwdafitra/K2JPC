// public/db.js — FINAL VERSION (Fixed Users & Images)

const DB_NAME = 'minerba_k3_stable_v1'; 
const REMOTE_API = '/api'; 

// --- 1. Init PouchDB ---
let db;
try {
    db = new PouchDB(DB_NAME);
    console.log(`✅ Database ${DB_NAME} Initialized`);
} catch(e) {
    console.error("❌ PouchDB Failed:", e);
}

// --- 2. Register Index ---
if (db && typeof db.createIndex === 'function') {
    db.createIndex({
        index: { fields: ['created_at'], name: 'idx_date', ddoc: 'idx_date' }
    }).catch(console.warn);
}

// --- 3. Definisi API Database (_k3db) ---
const _k3db = {
    db: db,

    /**
     * [FIX 1] FUNGSI LIST USERS
     * Agar halaman Management User bisa menampilkan data
     */
    async listUsers() {
        if (!db) return [];
        try {
            const result = await db.allDocs({ include_docs: true });
            
            // Filter hanya dokumen dengan type 'user'
            return result.rows
                .map(row => row.doc)
                .filter(doc => doc.type === 'user' && !doc.deleted);

        } catch (error) {
            console.error("Error listing users:", error);
            return [];
        }
    },

    /**
     * FUNGSI LIST INSPECTIONS
     */
    async listInspections() {
        if (!db) return [];
        try {
            const result = await db.allDocs({
                include_docs: true,
                descending: true 
            });

            return result.rows
                .map(row => row.doc)
                .filter(doc => doc.type === 'inspection' && !doc.deleted)
                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        } catch (error) {
            console.error("Error listing inspections:", error);
            return [];
        }
    },

    /**
     * [FIX 2] GET DETAIL + GAMBAR
     * Kita wajib request attachments: true agar gambar muncul
     */
    async getInspection(id) {
        try {
            // binary: true agar formatnya Blob (bisa dibaca img src)
            return await db.get(id, { attachments: true, binary: true });
        } catch (error) {
            console.error("Gagal mengambil detail:", error);
            return null;
        }
    },

    /**
     * Helper khusus untuk mengambil URL gambar dari Blob lokal
     * Gunakan ini di file main.js Anda saat render HTML
     */
    getBlobURL(blob) {
        return URL.createObjectURL(blob);
    },

    async deleteInspection(id) {
        try {
            const doc = await db.get(id);
            doc.deleted = true;      
            doc.synced = false;      
            return await db.put(doc);
        } catch (error) {
            console.error("Gagal menghapus:", error);
            throw error;
        }
    },

    /* =========================================
       LOGIC SAVE (Tidak Berubah)
       ========================================= */
    async saveInspection(doc, attachments = []) {
        if(!db) throw new Error("Database error");
        
        if (!doc._id) {
            doc._id = `insp_${Date.now()}_${Math.floor(Math.random()*1000)}`;
            doc.created_at = new Date().toISOString();
        }
        doc.type = 'inspection';
        doc.synced = false; 
        doc.deleted = false;

        try {
            const existing = await db.get(doc._id);
            doc._rev = existing._rev;
            if(existing.created_at) doc.created_at = existing.created_at;
        } catch(e) {}

        let res = await db.put(doc);
        console.log("📝 Metadata tersimpan:", res.id);

        if (attachments.length > 0) {
            for (let i = 0; i < attachments.length; i++) {
                const file = attachments[i];
                try {
                    const currentDoc = await db.get(doc._id);
                    await db.putAttachment(
                        doc._id, 
                        `foto_${i+1}.jpg`, 
                        currentDoc._rev,   
                        file,              
                        file.type || 'image/jpeg' 
                    );
                } catch (err) {
                    console.error("Gagal simpan foto:", err);
                }
            }
        }
        
        // Trigger sync flag update
        try {
            const finalDoc = await db.get(doc._id);
            finalDoc.synced = false;
            await db.put(finalDoc);
        } catch(e) {}

        return res;
    },

    // --- SYNC ENGINE ---
    async sync() {
        if(!navigator.onLine) throw new Error("Offline.");
        let stats = { pushed: 0, pulled: 0 };

        // 1. PUSH
        try {
            const allDocs = await db.allDocs({include_docs: true});
            const toPush = allDocs.rows
                .map(r => r.doc)
                .filter(d => d.synced === false && !d.deleted);

            console.log(`📤 Uploading ${toPush.length} items...`);

            for(const doc of toPush) {
                const fullDoc = await db.get(doc._id, {attachments: true}); // Ambil attachment lokal
                const payload = {...fullDoc};
                delete payload._rev; 
                
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
        } catch (e) { console.error("Push Error:", e); }

        // 2. PULL
        const pull = async (url) => {
            try {
                const res = await fetch(url);
                if(res.ok) {
                    const data = await res.json();
                    for(let d of data) {
                        if(d.deleted) continue;
                        
                        // NOTE: Attachments dihapus dari sync server agar HP tidak berat
                        // Gambar akan diload dari URL server jika online
                        delete d._attachments; 

                        try {
                            const local = await db.get(d._id);
                            d._rev = local._rev; 
                            d.synced = true; 
                            await db.put(d);
                        } catch(e) { 
                            delete d._rev; 
                            d.synced = true; 
                            await db.put(d); 
                        }
                        stats.pulled++;
                    }
                }
            } catch(e) {}
        };
        
        await pull(`${REMOTE_API}/users`);
        await pull(`${REMOTE_API}/inspeksi`);
        return stats;
    }
};

window._k3db = _k3db;