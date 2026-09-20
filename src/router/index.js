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

export default router;
