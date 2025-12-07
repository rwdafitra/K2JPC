// public/db.js — FINAL WITH FORCE PUSH

const DB_NAME = 'minerba_k3_stable_v1'; 
const REMOTE_API = '/api'; 

// Init PouchDB
let db;
try {
    db = new PouchDB(DB_NAME);
    console.log(`✅ Database ${DB_NAME} Initialized`);
} catch(e) {
    console.error("❌ PouchDB Failed:", e);
}

// REGISTER INDEX
if (db && typeof db.createIndex === 'function') {
    db.createIndex({
        index: { fields: ['created_at'], name: 'idx_date', ddoc: 'idx_date' }
    }).catch(console.warn);
}

// public/db.js (LANJUTAN SETELAH INISIALISASI DB)

const _k3db = {
    db: db,

    // --- INSPECTIONS ---
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
        } catch(e) {}

        let res = await db.put(doc);

        if (attachments.length > 0) {
            const latest = await db.get(doc._id);
            let rev = latest._rev;
            // Simpan nama file foto agar bisa di-load via URL server nanti
            // (Opsional, tapi membantu)
            // doc.foto_list = attachments.map((_, i) => `foto_${i+1}.jpg`);
            
           // Loop File Object (Binary)
for (let i = 0; i < attachments.length; i++) {
    const file = attachments[i]; // Ini sekarang adalah File Object asli
    
    const attRes = await db.putAttachment(
        doc._id, 
        `foto_${i+1}.jpg`, // Nama file di database
        rev, 
        file,              // SIMPAN BINARY LANGSUNG (PENTING!)
        file.type          // Tipe Mime (image/jpeg)
    );
    rev = attRes.rev;
}
            res = { ...res, rev: rev };
        }
        return res;
    },

    async getInspection(id) {
        return await db.get(id, { attachments: true, binary: true });
    },

    async listInspections(limit = 1000) {
        if (!db) return [];
        try {
            const all = await db.allDocs({include_docs: true, descending: true});
            return all.rows
                .map(r => r.doc)
                .filter(d => d.type === 'inspection' && !d.deleted)
                .sort((a,b) => new Date(b.created_at) - new Date(a.created_at))
                .slice(0, limit);
        } catch(e) { return []; }
    },

    async softDelete(id) {
        const doc = await db.get(id);
        doc.deleted = true;
        doc.synced = false;
        return await db.put(doc);
    },

    // --- USERS ---
    async saveUser(user) {
        user._id = user._id || `user_${user.username}`;
        user.type = 'user';
        user.synced = false;
        try {
            const existing = await db.get(user._id);
            user._rev = existing._rev;
        } catch(e) {}
        return await db.put(user);
    },

    async listUsers() {
        const all = await db.allDocs({include_docs: true});
        return all.rows.map(r => r.doc).filter(d => d.type === 'user' && !d.deleted);
    },
    
    async deleteUser(id) {
        const doc = await db.get(id);
        doc.deleted = true; 
        return await db.put(doc);
    },
    
    async resetSyncStatus() {
        // Kode reset sync (sama seperti sebelumnya)
        const all = await db.allDocs({include_docs: true});
        let count = 0;
        for (const row of all.rows) {
            const doc = row.doc;
            if (!doc.deleted && (doc.type === 'inspection' || doc.type === 'user')) {
                doc.synced = false;
                await db.put(doc);
                count++;
            }
        }
        return count;
    },

    // --- SYNC ENGINE (UPDATED) ---
    async sync() {
        if(!navigator.onLine) throw new Error("Offline. Cek internet.");
        let stats = { pushed: 0, pulled: 0 };

        // 1. PUSH (Local -> Server)
        const allDocs = await db.allDocs({include_docs: true});
        const toPush = allDocs.rows
            .map(r => r.doc)
            .filter(d => d.synced === false && !d.deleted);

        console.log(`📤 Uploading ${toPush.length} items...`);

        for(const doc of toPush) {
            // Ambil attachment lokal sebelum push
            const fullDoc = await db.get(doc._id, {attachments: true});
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

        // 2. PULL (Server -> Local) - LOGIC FIXED
        const pull = async (url) => {
            try {
                const res = await fetch(url);
                if(res.ok) {
                    const data = await res.json();
                    for(let d of data) {
                        if(d.deleted) continue;

                        // HAPUS Attachments dari server agar DB Lokal tidak corrupt/berat
                        delete d._attachments;

                        try {
                            // Cek apakah data sudah ada di HP?
                            const local = await db.get(d._id);
                            
                            // Jika ada, UPDATE menggunakan _rev lokal
                            d._rev = local._rev; 
                            d.synced = true;
                            await db.put(d);
                        } catch(e) { 
                            // Jika data BARU (tidak ada di HP)
                            // PENTING: Hapus _rev dari server agar dianggap dokumen baru oleh PouchDB
                            delete d._rev; 
                            d.synced = true; 
                            await db.put(d); 
                        }
                        stats.pulled++;
                    }
                }
            } catch(e) { console.warn("Pull error", url); }
        };
        
        // Pull Users & Inspeksi (Limit handled by server default)
        await pull(`${REMOTE_API}/users`);
        await pull(`${REMOTE_API}/inspeksi`);

        return stats;
    }
};

window._k3db = _k3db;