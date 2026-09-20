<script setup>
import { ref, onMounted } from 'vue';
import { api, tanggal } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();

const routers = ref([]);
const loading = ref(true);
const error = ref('');
const notice = ref('');

const activeFor = ref(null);
const activeList = ref([]);
const loadingActive = ref(false);

const showForm = ref(false);
const form = ref({ name: '', host: '', username: '', password: '', api_port: 8728, use_tls: false, site: '' });
const saving = ref(false);
const formError = ref('');

async function load() {
  loading.value = true;
  try {
    const data = await api.get('/admin/routers');
    routers.value = data.routers;
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

/** Lihat sesi PPPoE yang sedang aktif — untuk memastikan router benar hidup. */
async function showActive(r) {
  if (activeFor.value === r._id) {
    activeFor.value = null;
    return;
  }

  activeFor.value = r._id;
  activeList.value = [];
  loadingActive.value = true;
  error.value = '';
  try {
    const data = await api.get(`/admin/routers/${r._id}/active`);
    activeList.value = data.active;
  } catch (e) {
    error.value = `${r.name}: ${e.message}`;
    activeFor.value = null;
  } finally {
    loadingActive.value = false;
  }
}

async function submitForm() {
  saving.value = true;
  formError.value = '';
  try {
    const data = await api.post('/admin/routers', form.value);

    notice.value = data.test.success
      ? `Router ${data.router.name} tersambung${data.test.identity ? ` (identity: ${data.test.identity})` : ''}.`
      : `Router tersimpan tapi TIDAK bisa dihubungi: ${data.test.message}. Isolir otomatis tidak akan jalan sampai ini diperbaiki.`;

    showForm.value = false;
    form.value = { name: '', host: '', username: '', password: '', api_port: 8728, use_tls: false, site: '' };
    await load();
  } catch (e) {
    formError.value = e.message;
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1>Router</h1>
        <p class="muted small">{{ routers.length }} terdaftar</p>
      </div>
      <button v-if="auth.canManageRouters" class="sm" @click="showForm = true">Tambah router</button>
    </div>

    <div v-if="error" class="alert alert-error">{{ error }}</div>
    <div v-if="notice" class="alert" :class="notice.includes('TIDAK') ? 'alert-warning' : 'alert-ok'">
      {{ notice }}
    </div>

    <div v-if="loading" class="card empty"><span class="spinner"></span> Memuat...</div>

    <div v-for="r in routers" :key="r._id" class="card">
      <div style="display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap">
        <div>
          <strong>{{ r.name }}</strong>
          <span class="badge" :class="r.status === 'online' ? 'badge-ok' : 'badge-danger'" style="margin-left: 6px">
            {{ r.status === 'online' ? 'Online' : 'Offline' }}
          </span>
          <div class="muted small" style="margin-top: 3px">
            {{ r.host }}:{{ r.api_port }}
            <template v-if="r.use_tls"> &middot; TLS</template>
            <template v-if="r.site"> &middot; {{ r.site }}</template>
          </div>
          <div class="muted small">Terakhir terlihat: {{ tanggal(r.last_seen_at, true) }}</div>
        </div>

        <button class="ghost sm" @click="showActive(r)">
          {{ activeFor === r._id ? 'Tutup' : 'Sesi aktif' }}
        </button>
      </div>

      <div v-if="activeFor === r._id" style="margin-top: 14px; border-top: 1px solid var(--border); padding-top: 12px">
        <div v-if="loadingActive" class="muted small"><span class="spinner"></span> Membaca router...</div>
        <template v-else>
          <div class="muted small" style="margin-bottom: 8px">{{ activeList.length }} sesi aktif</div>
          <div class="table-scroll">
            <table>
              <thead>
                <tr><th>Username</th><th>IP</th><th>Uptime</th></tr>
              </thead>
              <tbody>
                <tr v-for="a in activeList" :key="a.name">
                  <td>{{ a.name }}</td>
                  <td class="muted">{{ a.address }}</td>
                  <td class="muted">{{ a.uptime }}</td>
                </tr>
                <tr v-if="!activeList.length">
                  <td colspan="3" class="empty">Tidak ada sesi aktif</td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>
      </div>
    </div>

    <div v-if="!loading && !routers.length" class="card empty">
      Belum ada router. Tambahkan satu sebelum membuat layanan pelanggan.
    </div>

    <!-- Form -->
    <div v-if="showForm" class="modal-bg" @click.self="showForm = false">
      <form class="modal" @submit.prevent="submitForm">
        <h2>Tambah router</h2>
        <p class="muted small" style="margin-bottom: 14px">
          Gunakan user API khusus, bukan <code>admin</code>, dan batasi
          <code>address=</code> di RouterOS ke IP server ini.
        </p>

        <div v-if="formError" class="alert alert-error">{{ formError }}</div>

        <div class="field">
          <label for="r-name">Nama</label>
          <input id="r-name" v-model="form.name" required placeholder="veteran3">
        </div>

        <div class="field">
          <label for="r-host">Host / IP</label>
          <input id="r-host" v-model="form.host" required placeholder="10.8.0.2">
          <div class="muted small" style="margin-top: 4px">
            Pakai IP VPN (WireGuard/ZeroTier), bukan IP publik dinamis.
          </div>
        </div>

        <div class="field">
          <label for="r-user">Username API</label>
          <input id="r-user" v-model="form.username" required placeholder="billing">
        </div>

        <div class="field">
          <label for="r-pass">Password</label>
          <input id="r-pass" v-model="form.password" type="password" required autocomplete="new-password">
          <div class="muted small" style="margin-top: 4px">
            Disimpan terenkripsi dan tidak pernah ditampilkan lagi.
          </div>
        </div>

        <div class="field">
          <label for="r-port">Port API</label>
          <input id="r-port" v-model.number="form.api_port" type="number">
        </div>

        <div class="field">
          <label style="display: flex; align-items: center; gap: 7px; font-weight: 400">
            <input type="checkbox" v-model="form.use_tls" style="width: auto">
            Pakai api-ssl (port 8729)
          </label>
        </div>

        <div class="field">
          <label for="r-site">Lokasi</label>
          <input id="r-site" v-model="form.site" placeholder="opsional">
        </div>

        <div class="actions" style="margin-top: 16px">
          <button type="submit" :disabled="saving">
            {{ saving ? 'Menguji koneksi...' : 'Simpan & tes koneksi' }}
          </button>
          <button type="button" class="ghost" @click="showForm = false">Batal</button>
        </div>
      </form>
    </div>
  </div>
</template>
