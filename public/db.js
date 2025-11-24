// db.js - initialize local PouchDB and export helpers (VERSI AMAN FINAL)
const DB_NAME = 'k3_inspeksi';
const db = new PouchDB(DB_NAME);

// FUNGSI configureRemote dan startLiveSync HARUS DIHAPUS

async function saveInspection(doc, attachments = []) {
  if (!doc._id) {
    doc._id = 'ins_' + Date.now();
    doc.created_at = new Date().toISOString();
  }
  doc.type = 'inspection';
  doc.synced = false; // <<< PENTING: Dokumen baru ditandai belum sync

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

async function listInspections(limit = 100) {
  try {
    const found = await db.find({ selector: { type: 'inspection' }, sort: [{ created_at: 'desc' }], limit });
    return found.docs;
  } catch (e) {
    const all = await db.allDocs({ include_docs: true, descending: true });
    return all.rows.map(r => r.doc).filter(d => d.type === 'inspection');
  }
}

// Export objek global baru (tidak lagi ada remoteDB atau sync)
window._k3db = { 
  db, 
  saveInspection, 
  listInspections,
  API_URL: '/api/inspeksi' // Endpoint API ke Express Server
};
