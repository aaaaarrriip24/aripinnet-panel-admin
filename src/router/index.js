import { createRouter, createWebHistory } from 'vue-router';

/**
 * Semua view di-lazy load kecuali Login — panel ini dipakai dari HP
 * di lapangan, jadi bundle awal harus kecil.
 */
const routes = [
  { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue'), meta: { public: true } },
  { path: '/', name: 'dashboard', component: () => import('@/views/DashboardView.vue') },
  { path: '/pelanggan', name: 'customers', component: () => import('@/views/CustomersView.vue') },
  { path: '/pelanggan/:id', name: 'customer-detail', component: () => import('@/views/CustomerDetailView.vue') },
  { path: '/tagihan', name: 'invoices', component: () => import('@/views/InvoicesView.vue') },
  { path: '/pembayaran', name: 'payments', component: () => import('@/views/PaymentsView.vue') },
  { path: '/laporan', name: 'reports', component: () => import('@/views/ReportsView.vue') },
  { path: '/paket', name: 'plans', component: () => import('@/views/PlansView.vue') },
  { path: '/router', name: 'routers', component: () => import('@/views/RoutersView.vue') },
  { path: '/sistem', name: 'system', component: () => import('@/views/SystemView.vue') },
  { path: '/:pathMatch(.*)*', redirect: '/' },
];

const router = createRouter({
  history: createWebHistory('/'),
  routes,
});

/**
 * Guard. Import store di dalam fungsi, bukan di atas file — Pinia belum
 * terpasang saat modul router dievaluasi.
 */
router.beforeEach(async (to) => {
  const { useAuthStore } = await import('@/stores/auth');
  const auth = useAuthStore();

  if (to.meta.public) {
    return auth.isLoggedIn ? { name: 'dashboard' } : true;
  }

  if (!auth.isLoggedIn) {
    return { name: 'login', query: { next: to.fullPath } };
  }

  // Verifikasi token sekali per sesi browser
  if (!auth.admin) {
    const ok = await auth.restore();
    if (!ok) return { name: 'login' };
  }

  return true;
});

/**
 * Pulihkan diri saat chunk lama sudah tidak ada di server.
 *
 * Setelah deploy, nama file chunk berubah karena memuat hash isi. Tab yang
 * sudah terbuka sejak sebelum deploy masih memegang nama lama. Server
 * statis dengan fallback SPA membalas file yang hilang dengan index.html
 * berstatus 200, bukan 404 — browser menolak menjalankan HTML sebagai
 * modul, navigasi dibatalkan diam-diam, dan halaman terlihat macet tanpa
 * pesan error.
 *
 * Panel sering dibuka berjam-jam di tab yang sama, jadi ini bukan kasus
 * langka. Muat ulang sekali menyelesaikannya.
 */
router.onError((err) => {
  const gagalMuatModul = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i
    .test(err?.message || '');

  if (!gagalMuatModul) return;

  try {
    if (sessionStorage.getItem('reload-chunk')) return;
    sessionStorage.setItem('reload-chunk', '1');
  } catch (_) { /* mode privat — biarkan reload sekali */ }

  window.location.reload();
});

router.afterEach(() => {
  try { sessionStorage.removeItem('reload-chunk'); } catch (_) { /* abaikan */ }
});

export default router;
