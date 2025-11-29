// public/db.js — FINAL FIXED VERSION
const DB_NAME = 'minerba_k3_v3'; // Versi baru untuk reset struktur
const REMOTE_API = '/api'; 

// Init DB
let db;
try {
    db = new PouchDB(DB_NAME);
    console.log("✅ PouchDB Initialized:", DB_NAME);
} catch(e) {
    console.error("❌ PouchDB Init Failed:", e);
    alert("Gagal memuat database lokal. Pastikan tidak dalam Mode Incognito/Private yang ketat.");
}

// Create Indexes
if(db) {
    db.createIndex({ index: { fields: ['type', 'created_at'] } }).catch(console.warn);
    db.createIndex({ index: { fields: ['type', 'deleted'] } }).catch(console.warn);
}

const _k3db = {
    db: db,

    // --- INSPECTIONS ---
    async saveInspection(doc, attachments = []) {
        if(!db) throw new Error("Database belum siap");
        
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

        // Save Photos
        if (attachments.length > 0) {
            const latest = await db.get(doc._id);
            let rev = latest._rev;
            for (let i = 0; i < attachments.length; i++) {
                const att = attachments[i];
                const attRes = await db.putAttachment(
                    doc._id, `foto_${i+1}.jpg`, rev, att.blob, att.type
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
        try {
            const res = await db.find({
                selector: { type: 'inspection', deleted: { $ne: true } },
                sort: [{ created_at: 'desc' }],
                limit
            });
            return res.docs;
        } catch(e) {
            // Fallback manual jika index belum siap
            const all = await db.allDocs({include_docs: true, descending: true});
            return all.rows
                .map(r => r.doc)
                .filter(d => d.type === 'inspection' && !d.deleted)
                .slice(0, limit);
        }
    },

    // --- USERS (INI YANG SEBELUMNYA HILANG) ---
    async saveUser(user) {
        if(!db) throw new Error("Database belum siap");
        // Gunakan format ID khusus user
        user._id = user._id || `user_${user.username}`;
        user.type = 'user';
        user.synced = false;
        user.deleted = false;
        
        try {
            const existing = await db.get(user._id);
            user._rev = existing._rev;
        } catch(e) {}
        
        return await db.put(user);
    },

    async listUsers() {
        try {
            const res = await db.find({
                selector: { type: 'user', deleted: { $ne: true } }
            });
            return res.docs;
        } catch(e) {
            const all = await db.allDocs({include_docs: true});
            return all.rows.map(r => r.doc).filter(d => d.type === 'user' && !d.deleted);
        }
    },

    async deleteUser(id) {
        const doc = await db.get(id);
        doc.deleted = true;
        doc.synced = false;
        return await db.put(doc);
    },

    // --- SYNC ENGINE ---
    async sync() {
        if(!navigator.onLine) throw new Error("Tidak ada koneksi internet.");
        let stats = { pushed: 0, pulled: 0 };

        // 1. PUSH (Local -> Server)
        const toPush = await db.find({ selector: { synced: false } });
        for(const doc of toPush.docs) {
            const payload = {...doc};
            delete payload._rev; 
            delete payload._attachments; 
            
            // Endpoint beda untuk user & inspeksi
            const endpoint = (doc.type === 'user') ? `${REMOTE_API}/users` : `${REMOTE_API}/inspeksi/${doc._id}`;
            
            const res = await fetch(endpoint, {
                method: 'PUT',
                headers: {'Content-Type':'application/json'},
                body: JSON.stringify(payload)
            });
            
            if(res.ok) {
                doc.synced = true;
                await db.put(doc);
                stats.pushed++;
            }
        }

        // 2. PULL (Server -> Local)
        // Pull Users
        try {
            const resUsers = await fetch(`${REMOTE_API}/users`);
            if(resUsers.ok) {
                const users = await resUsers.json();
                for(let u of users) {
                    if(u.deleted) continue;
                    try {
                        const local = await db.get(u._id);
                        u._rev = local._rev;
                        u.synced = true;
                        await db.put(u);
                    } catch(e) {
                        u.synced = true;
                        await db.put(u);
                    }
                }
            }
        } catch(e) { console.warn("Pull Users Failed", e); }

        // Pull Inspections
        try {
            const resInsp = await fetch(`${REMOTE_API}/inspeksi`);
            if(resInsp.ok) {
                const inspections = await resInsp.json();
                for(let i of inspections) {
                    if(i.deleted) continue;
                    try {
                        const local = await db.get(i._id);
                        i._rev = local._rev;
                        i.synced = true;
                        await db.put(i);
                    } catch(e) {
                        i.synced = true;
                        await db.put(i);
                    }
                    stats.pulled++;
                }
            }
        } catch(e) { console.warn("Pull Inspections Failed", e); }

        return stats;
    }
};

window._k3db = _k3db;