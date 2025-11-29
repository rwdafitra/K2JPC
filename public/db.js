// db.js — Enterprise Grade PouchDB Wrapper

const DB_NAME = 'minerba_k3_db';
const REMOTE_API = '/api'; // Backend Express endpoints
const db = new PouchDB(DB_NAME);

// Setup Indexes untuk query cepat
db.createIndex({ index: { fields: ['type', 'created_at'] } });
db.createIndex({ index: { fields: ['type', 'deleted'] } });

const _k3db = {
    db: db,

    // --- CORE: INSPECTION ---
    async saveInspection(doc, attachments = []) {
        if (!doc._id) {
            doc._id = `insp_${new Date().getTime()}_${Math.random().toString(36).substr(2, 5)}`;
            doc.created_at = new Date().toISOString();
        }
        doc.type = 'inspection';
        doc.synced = false;
        doc.deleted = false;

        let res = await db.put(doc);

        // Handle Attachments (Foto)
        if (attachments.length > 0) {
            for (let i = 0; i < attachments.length; i++) {
                const att = attachments[i];
                // Fetch fresh rev to avoid conflict
                const latest = await db.get(doc._id);
                res = await db.putAttachment(
                    doc._id, `foto_${i+1}.jpg`, latest._rev, att.blob, att.type
                );
            }
        }
        return res;
    },

    async getInspection(id) {
        return await db.get(id, { attachments: true, binary: true });
    },

    async listInspections(limit = 1000) {
        // Query offline only, sorted by newest
        const result = await db.find({
            selector: { type: 'inspection', deleted: { $ne: true } },
            sort: [{ created_at: 'desc' }],
            limit
        });
        return result.docs;
    },

    async softDelete(id) {
        const doc = await db.get(id);
        doc.deleted = true;
        doc.synced = false;
        return await db.put(doc);
    },

    // --- CORE: USER ---
    async saveUser(user) {
        user._id = user._id || `user_${user.username}`;
        user.type = 'user';
        user.synced = false;
        try {
            const exist = await db.get(user._id);
            user._rev = exist._rev;
        } catch(e) {} // ignore 404
        return await db.put(user);
    },

    async listUsers() {
        const res = await db.find({ selector: { type: 'user', deleted: { $ne: true } } });
        return res.docs;
    },

    // --- CORE: SYNC ENGINE ---
    async sync() {
        if (!navigator.onLine) throw new Error("Tidak ada koneksi internet.");

        let stats = { pushed: 0, pulled: 0 };

        // 1. PUSH (Upload Local -> Server)
        const toPush = await db.find({ selector: { synced: false } });
        for (const doc of toPush.docs) {
            const payload = { ...doc };
            delete payload._rev; 
            delete payload._attachments; // Kirim metadata json dulu

            // Tentukan endpoint berdasarkan tipe
            const endpoint = (doc.type === 'user') ? `${REMOTE_API}/users` : `${REMOTE_API}/inspeksi/${doc._id}`;
            
            const res = await fetch(endpoint, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                // Tandai synced lokal
                doc.synced = true;
                await db.put(doc);
                stats.pushed++;
            }
        }

        // 2. PULL (Download Server -> Local)
        // Tarik User
        const resUsers = await fetch(`${REMOTE_API}/users`);
        if(resUsers.ok) {
            const users = await resUsers.json();
            for(let u of users) {
                try {
                    const local = await db.get(u._id);
                    u._rev = local._rev; // Update
                    u.synced = true;
                    await db.put(u);
                } catch(e) {
                    u.synced = true;
                    await db.put(u); // Insert new
                }
            }
        }

        // Tarik Inspeksi
        const resInsp = await fetch(`${REMOTE_API}/inspeksi`);
        if(resInsp.ok) {
            const inspections = await resInsp.json();
            for(let i of inspections) {
                if(i.deleted) continue; // Skip deleted from server
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

        return stats;
    }
};

window._k3db = _k3db;