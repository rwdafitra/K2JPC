// db.js - initialize local PouchDB and export helpers (VERSI FINAL TERLENGKAP)
const DB_NAME = 'inspeksi_k3'; 
const db = new PouchDB(DB_NAME);

// API URL untuk PUSH/PULL data melalui server Express
const API_URL = '/api/inspeksi'; 
const API_USER_URL = '/api/users'; // URL API baru untuk User

// Inisialisasi DB (Pastikan index ada untuk pencarian cepat)
db.createIndex({ index: { fields: ['type', 'created_at'] } });
db.createIndex({ index: { fields: ['type', 'deleted'] } }); // Untuk user dan soft delete

// Export konfigurasi
window._k3db = { db, API_URL, API_USER_URL };

/**
 * Save inspection document (with optional attachments)
 * @param {object} doc - inspection doc
 * @param {array} attachments - [{type: 'image/jpeg', blob: Blob}]
 */
async function saveInspection(doc, attachments = []) {
  // Jika dokumen baru, tambahkan _id, created_at, dan is_draft
  if (!doc._id) {
    doc._id = 'ins_' + Date.now();
    doc.created_at = new Date().toISOString();
  }
  doc.type = 'inspection';
  doc.synced = false; 
  doc.deleted = doc.deleted || false; // Pastikan flag delete ada

  try {
    const res = await db.put(doc);
    
    // add attachments (logic for attachments remains here)
    for (let i = 0; i < attachments.length; i++) {
      const att = attachments[i];
      await db.putAttachment(doc._id, `photo_${i}`, res.rev, att.type, att.blob).catch(async (e) => {
        const latest = await db.get(doc._id);
        await db.putAttachment(doc._id, `photo_${i}`, latest._rev, att.type, att.blob);
      });
    }
    return res;
  } catch (e) {
    throw e;
  }
}

/**
 * Get single inspection document by ID
 */
async function getInspection(id) {
    return db.get(id, { attachments: true });
}

/**
 * List inspection documents (menggunakan pouchdb-find dan filter soft-delete)
 */
async function listInspections(limit = 100) {
  try {
    const found = await db.find({ 
        selector: { type: 'inspection', deleted: false }, 
        sort: [{ created_at: 'desc' }], 
        limit 
    });
    return found.docs;
  } catch (e) {
    // Fallback jika index gagal
    const all = await db.allDocs({ include_docs: true, descending: true });
    return all.rows
        .map(r => r.doc)
        .filter(d => d.type === 'inspection' && !d.deleted)
        .sort((a,b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, limit);
  }
}

/**
 * Soft delete inspection (tandai sebagai deleted: true)
 */
async function softDeleteInspection(id) {
    const doc = await db.get(id);
    doc.deleted = true;
    doc.synced = false;
    return db.put(doc);
}


// --- USER MANAGEMENT (BARU) ---

/**
 * Save or update user document
 * @param {object} userDoc - { username, name, role, status }
 */
async function saveUser(userDoc) {
    if (!userDoc._id) {
        userDoc._id = 'user_' + userDoc.username;
        userDoc.created_at = new Date().toISOString();
    }
    userDoc.type = 'user';
    userDoc.synced = false; 
    userDoc.deleted = userDoc.deleted || false;
    
    try {
        const existing = await db.get(userDoc._id).catch(() => null);
        if (existing) userDoc._rev = existing._rev;
        
        const res = await db.put(userDoc);
        return res;
    } catch (e) {
        throw e;
    }
}

/**
 * List all active users
 */
async function listUsers() {
    const found = await db.find({ 
        selector: { type: 'user', deleted: false }, 
        sort: [{ name: 'asc' }]
    });
    return found.docs;
}

// Export semua fungsi yang diperlukan
window._k3db = {
  db, API_URL, API_USER_URL,
  saveInspection, getInspection, listInspections, softDeleteInspection,
  saveUser, listUsers
};