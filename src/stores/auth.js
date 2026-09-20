import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api, setUnauthorizedHandler } from '@/lib/api';
import router from '@/router';

export const useAuthStore = defineStore('auth', () => {
  const admin   = ref(null);
  const token   = ref(localStorage.getItem('admin_token') || '');
  const loading = ref(false);

  const isLoggedIn = computed(() => !!token.value);

  // Role-based UI. Ini hanya untuk menyembunyikan tombol — otorisasi
  // sesungguhnya tetap di server (requireRole di routes/admin.js).
  const canManageRouters = computed(() => admin.value?.role === 'owner');
  const canVoidInvoice   = computed(() => ['owner', 'admin'].includes(admin.value?.role));

  async function login(email, password) {
    loading.value = true;
    try {
      const data = await api.post('/auth/admin/login', { email, password });
      token.value = data.token;
      admin.value = data.admin;
      localStorage.setItem('admin_token', data.token);
      return data.admin;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Dipanggil saat app dimuat. Token di localStorage bisa saja sudah
   * kedaluwarsa atau akunnya dinonaktifkan — verifikasi ke server dulu
   * sebelum menampilkan panel.
   */
  async function restore() {
    if (!token.value) return false;
    try {
      const data = await api.get('/auth/admin/me');
      admin.value = data.admin;
      return true;
    } catch {
      logout(false);
      return false;
    }
  }

  function logout(redirect = true) {
    token.value = '';
    admin.value = null;
    localStorage.removeItem('admin_token');
    if (redirect) router.push({ name: 'login' });
  }

  // Satu titik penanganan 401 untuk seluruh aplikasi
  setUnauthorizedHandler(() => logout());

  return { admin, token, loading, isLoggedIn, canManageRouters, canVoidInvoice, login, restore, logout };
});
