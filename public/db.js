// db.js - initialize local PouchDB and export helpers (VERSI FINAL)
const DB_NAME = 'inspeksi_k3'; 
const db = new PouchDB(DB_NAME);

const API_URL = '/api/inspeksi'; 

/**
 * Save inspection document (with attachments)
 */
async function saveInspection(doc, files = []) {
  if (!doc._id) {
    doc._id = 'ins_' + Date.now();
    doc.created_at = new Date().toISOString();
  }
  doc.type = 'inspection';
  doc.synced = false; 
  // Pastikan field untuk komentar sudah ada (walaupun kosong)
  doc.actions = doc.actions || []; 
  
  const attachments = {};

  // Convert files to PouchDB attachment format (base64)
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const base64Data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result.split(',')[1]); 
        reader.onerror = error => reject(error);
        reader.readAsDataURL(file);
    });

    attachments[`photo_${i}_${file.name.substring(0, 10)}`] = {
        content_type: file.type,
        data: base64Data
    };
  }

  doc._attachments = attachments;

  try {
    const res = await db.put(doc);
    return res;
  } catch (e) {
    throw e;
  }
}

/**
 * Update existing inspection document (untuk komentar/status)
 */
async function updateInspection(docId, updateData) {
    const doc = await db.get(docId);
    
    // Gabungkan data yang diupdate dengan dokumen lama
    const updatedDoc = {
        ...doc,
        ...updateData,
        _rev: doc._rev,
        synced: false // Tandai sebagai belum sync setelah diupdate
    };
    
    return db.put(updatedDoc);
}

/**
 * Get single inspection document
 */
async function getInspection(docId) {
    return db.get(docId);
}

/**
 * List inspection documents (menggunakan pouchdb-find)
 */
async function listInspections(limit = 100) {
  try {
    const found = await db.find({ selector: { type: 'inspection' }, sort: [{ created_at: 'desc' }], limit });
    return found.docs;
  } catch (e) {
    // Fallback jika index gagal
    const all = await db.allDocs({ include_docs: true, descending: true });
    return all.rows.map(r => r.doc).filter(d => d.type === 'inspection').sort((a,b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, limit);
  }
}

// Export fungsi dan variabel yang dibutuhkan
window._k3db = {
  db,
  saveInspection,
  getInspection,
  updateInspection, // <-- FUNGSI BARU
  listInspections,
  API_URL
};