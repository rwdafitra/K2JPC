// router.js (VERSION FIXED & STABLE)

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

    navigateTo: async function(pageName, params = {}) {
        const pageKey = pageName.toLowerCase().split('?')[0];

        // FIX 1 — jangan pakai const
        let pageInfo = pages[pageKey];

        if (!pageInfo) {
            pageName = 'dashboard';
            pageInfo = pages.dashboard;
        }

        try {
            // Update URL hash tanpa infinite loop
            let newHash = '#' + pageKey;
            const urlParams = new URLSearchParams();

            for (const k in params) urlParams.set(k, params[k]);
            const paramStr = urlParams.toString();
            if (paramStr) newHash += '?' + paramStr;

            if (window.location.hash !== newHash) {
                window.history.pushState({}, '', newHash);
            }

            // Load page html
            const res = await fetch(`./pages/${pageKey}.html`);
            if (!res.ok) {
                contentContainer.innerHTML =
                    `<div class="alert alert-danger">Halaman tidak ditemukan: ${pageKey}</div>`;
                titleElement.innerText = '404 Not Found';
                subtitleElement.innerText = '';
                return;
            }

            const html = await res.text();
            contentContainer.innerHTML = html;

            // Update header
            titleElement.innerText = pageInfo.title;
            subtitleElement.innerText = pageInfo.subtitle;

            // Panggil init dari main.js
            if (window.onPageLoaded) window.onPageLoaded(pageKey);

        } catch (err) {
            contentContainer.innerHTML =
                `<div class="alert alert-danger">Gagal memuat halaman: ${err.message}</div>`;
            console.error(err);
        }
    },

    // Ambil parameter dari hash
    getCurrentParams: function() {
        const hash = window.location.hash.split('?')[1];
        if (!hash) return {};
        const p = {};
        const url = new URLSearchParams(hash);
        url.forEach((v, k) => p[k] = v);
        return p;
    }
};

// FIX 2 — load halaman pertama dari hash otomatis
window.addEventListener('load', () => {
    const hash = window.location.hash.replace('#', '') || 'dashboard';
    const page = hash.split('?')[0];
    router.navigateTo(page);
});

// FIX 3 — back/forward browser bekerja benar
window.addEventListener('popstate', () => {
    const hash = window.location.hash.replace('#', '') || 'dashboard';
    const page = hash.split('?')[0];
    router.navigateTo(page);
});
