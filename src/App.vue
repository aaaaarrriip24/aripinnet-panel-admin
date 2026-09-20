<script setup>
import { computed, ref, onMounted, onUnmounted } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { api } from '@/lib/api';

const route = useRoute();
const auth = useAuthStore();

const showNav = computed(() => !route.meta.public && auth.isLoggedIn);

const nav = [
  { name: 'dashboard', label: 'Beranda' },
  { name: 'customers', label: 'Pelanggan' },
  { name: 'invoices',  label: 'Tagihan' },
  { name: 'payments',  label: 'Kas' },
  { name: 'reports',   label: 'Laporan' },
  { name: 'plans',     label: 'Paket' },
  { name: 'routers',   label: 'Router' },
  { name: 'system',    label: 'Sistem' },
];

/**
 * Titik merah di menu Sistem saat WhatsApp bermasalah.
 *
 * Tanpa penanda ini, halaman Sistem hanya dibuka kalau admin kebetulan
 * curiga — padahal justru masalah di sana yang tidak menimbulkan gejala
 * lain yang terlihat.
 */
const systemAlert = ref(false);
let pollTimer = null;

async function checkSystem() {
  if (!auth.isLoggedIn) return;
  try {
    const w = await api.get('/admin/system/whatsapp');
    systemAlert.value = w.health === 'critical' || w.health === 'warning';
  } catch {
    // Diam saja — ini indikator tambahan, bukan fungsi utama
  }
}

onMounted(() => {
  checkSystem();
  pollTimer = setInterval(checkSystem, 60_000);
});

onUnmounted(() => clearInterval(pollTimer));
</script>

<template>
  <div>
    <header v-if="showNav" class="topbar">
      <div class="topbar-inner">
        <nav class="nav">
          <RouterLink
            v-for="item in nav"
            :key="item.name"
            :to="{ name: item.name }"
            class="nav-link"
            active-class="active"
          >
            {{ item.label }}
            <span v-if="item.name === 'system' && systemAlert" class="dot" aria-label="ada masalah"></span>
          </RouterLink>
        </nav>

        <div class="user">
          <span class="small muted">{{ auth.admin?.name }}</span>
          <button class="ghost sm" @click="auth.logout()">Keluar</button>
        </div>
      </div>
    </header>

    <RouterView />
  </div>
</template>

<style scoped>
.topbar {
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  z-index: 20;
}
.topbar-inner {
  max-width: 1100px;
  margin: 0 auto;
  padding: 0 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

/* Nav bisa di-scroll horizontal di HP, tanpa membungkus ke baris kedua */
.nav {
  display: flex;
  gap: 2px;
  overflow-x: auto;
  scrollbar-width: none;
}
.nav::-webkit-scrollbar { display: none; }

.nav-link {
  position: relative;
  padding: 14px 12px;
  color: var(--text-muted);
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  border-bottom: 2px solid transparent;
}
.nav-link:hover { text-decoration: none; color: var(--text); }
.nav-link.active { color: var(--accent); border-bottom-color: var(--accent); }

.dot {
  display: inline-block;
  width: 7px; height: 7px;
  border-radius: 50%;
  background: var(--danger);
  vertical-align: 5px;
  margin-left: 3px;
}

.user { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
.user .small { display: none; }
@media (min-width: 640px) { .user .small { display: inline; } }
</style>
