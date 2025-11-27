// router.js
const pages = {
    dashboard: { title: 'Dashboard', subtitle: 'Ringkasan Statistik Inspeksi' },
    input: { title: 'Input Inspeksi', subtitle: 'Form Inspeksi Baru' },
    rekap: { title: 'Rekap Data', subtitle: 'Daftar Semua Inspeksi' },
    detail: { title: 'Detail Inspeksi', subtitle: 'Detail Temuan dan Tindak Lanjut' },
    grafik: { title: 'Grafik & Trend', subtitle: 'Visualisasi Data Risiko' },
    users: { title: 'Manajemen User', subtitle: 'Tambah dan Edit Akun' },
    settings: { title: 'Settings', subtitle: 'Pengaturan Sinkronisasi' }
};

const contentContainer = document.getElementById('content');
const titleElement = document.getElementById('pageTitle');
const subtitleElement = document.getElementById('pageSubtitle');

window.router = {
    /**
     * Navigasi ke halaman tertentu dan muat kontennya.
     * @param {string} pageName - Nama halaman (e.g., 'dashboard', 'input').
     * @param {Object} [params] - Parameter URL opsional ({id: '123'}).
     */
    navigateTo: async function(pageName, params = {}) {
        const pageKey = pageName.toLowerCase().split('?')[0]; // Ambil key tanpa params
        const pageInfo = pages[pageKey];

        if (!pageInfo) {
            pageName = 'dashboard'; // Fallback
            pageInfo = pages.dashboard;
        }

        try {
            // 1. Update URL Hash dengan parameter jika ada
            let hash = `#${pageKey}`;
            const urlParams = new URLSearchParams(window.location.hash.split('?')[1]);
            
            // Tambahkan params baru ke hash
            for (const key in params) {
                if (params.hasOwnProperty(key)) {
                    urlParams.set(key, params[key]);
                }
            }
            if (urlParams.toString()) {
                hash += `?${urlParams.toString()}`;
            }
            // Mencegah pushState jika hash sudah sama (penting untuk menghindari loop)
            if (window.location.hash !== hash) {
                window.history.pushState(null, null, hash);
            }

            // 2. Load Content
            const res = await fetch(`./pages/${pageKey}.html`);
            if (!res.ok) {
                contentContainer.innerHTML = `<div class="alert alert-danger">Halaman **${pageKey}** tidak ditemukan (404).</div>`;
                titleElement.innerText = 'Error 404';
                subtitleElement.innerText = '';
                return;
            }
            
            const html = await res.text();
            
            // 3. Update UI
            contentContainer.innerHTML = html;
            titleElement.innerText = pageInfo.title;
            subtitleElement.innerText = pageInfo.subtitle;

            // 4. Panggil inisialisasi dari main.js
            if (window.onPageLoaded) {
                window.onPageLoaded(pageKey);
            }
            
        } catch (error) {
            console.error('Error loading page:', error);
            contentContainer.innerHTML = `<div class="alert alert-danger">Gagal memuat halaman: ${error.message}</div>`;
        }
    },
    
    /**
     * Mendapatkan parameter dari URL Hash saat ini.
     */
    getCurrentParams: function() {
        const hash = window.location.hash.split('?')[1];
        if (!hash) return {};
        const params = {};
        const urlParams = new URLSearchParams(hash);
        for (const [key, value] of urlParams.entries()) {
            params[key] = value;
        }
        return params;
    }
};