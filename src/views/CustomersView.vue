<script setup>
import { ref, onMounted, watch } from 'vue';
import { api } from '@/lib/api';

const items = ref([]);
const total = ref(0);
const page = ref(1);
const limit = 25;
const q = ref('');
const status = ref('');
const loading = ref(false);
const error = ref('');

const showForm = ref(false);
const form = ref({ name: '', phone: '', address: '', note: '' });
const saving = ref(false);
const formError = ref('');
const created = ref(null);

let searchTimer = null;

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const data = await api.get('/admin/customers', {
      page: page.value, limit, q: q.value, status: status.value,
    });
    items.value = data.items;
    total.value = data.total;
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

// Debounce pencarian — tanpa ini setiap ketikan jadi satu query ke server
watch(q, () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { page.value = 1; load(); }, 350);
});

watch([page, status], load);

async function submitForm() {
  saving.value = true;
  formError.value = '';
  try {
    const data = await api.post('/admin/customers', form.value);
    created.value = data.customer;
    showForm.value = false;
    form.value = { name: '', phone: '', address: '', note: '' };
    page.value = 1;
    await load();
  } catch (e) {
    formError.value = e.message;
  } finally {
    saving.value = false;
  }
}

function serviceBadge(s) {
  if (s.status === 'active')   return 'badge-ok';
  if (s.status === 'isolated') return 'badge-warning';
  return 'badge-muted';
}

onMounted(load);
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1>Pelanggan</h1>
        <p class="muted small">{{ total }} terdaftar</p>
      </div>
      <button class="sm" @click="showForm = true">Tambah pelanggan</button>
    </div>

    <div v-if="error" class="alert alert-error">{{ error }}</div>
    <div v-if="created" class="alert alert-ok">
      {{ created.name }} ditambahkan dengan kode <strong>{{ created.code }}</strong>.
      <RouterLink :to="{ name: 'customer-detail', params: { id: created.id } }">
        Tambahkan layanan sekarang
      </RouterLink>
    </div>

    <div class="card" style="display: flex; gap: 10px; flex-wrap: wrap">
      <input
        v-model="q"
        type="search"
        placeholder="Cari nama, kode, atau nomor HP"
        style="flex: 1; min-width: 180px"
      >
      <select v-model="status" style="width: auto; min-width: 130px">
        <option value="">Semua status</option>
        <option value="active">Aktif</option>
        <option value="inactive">Nonaktif</option>
        <option value="blacklist">Blacklist</option>
      </select>
    </div>

    <div class="card card-tight">
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Kode</th>
              <th>Nama</th>
              <th>Nomor HP</th>
              <th>Layanan</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in items" :key="c.id">
              <td>
                <RouterLink :to="{ name: 'customer-detail', params: { id: c.id } }">
                  {{ c.code }}
                </RouterLink>
              </td>
              <td>
                {{ c.name }}
                <span v-if="c.status !== 'active'" class="badge badge-muted">{{ c.status }}</span>
                <div v-if="c.address" class="muted small">{{ c.address }}</div>
              </td>
              <td class="muted">{{ c.phone }}</td>
              <td>
                <span
                  v-for="s in c.services"
                  :key="s.id"
                  class="badge"
                  :class="serviceBadge(s)"
                  style="margin-right: 4px"
                >{{ s.username }}</span>
                <span v-if="!c.services.length" class="muted small">belum ada</span>
              </td>
            </tr>

            <tr v-if="!items.length && !loading">
              <td colspan="4" class="empty">Tidak ada pelanggan yang cocok</td>
            </tr>
            <tr v-if="loading">
              <td colspan="4" class="empty"><span class="spinner"></span> Memuat...</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="pager" v-if="total > limit">
        <button class="ghost sm" :disabled="page === 1" @click="page--">Sebelumnya</button>
        <span class="muted small">Halaman {{ page }} dari {{ Math.ceil(total / limit) }}</span>
        <button class="ghost sm" :disabled="page * limit >= total" @click="page++">Berikutnya</button>
      </div>
    </div>

    <!-- Form tambah -->
    <div v-if="showForm" class="modal-bg" @click.self="showForm = false">
      <form class="modal" @submit.prevent="submitForm">
        <h2>Tambah pelanggan</h2>
        <p class="muted small" style="margin-bottom: 14px">
          Kode pelanggan dibuat otomatis. Layanan (PPPoE) ditambahkan setelah ini.
        </p>

        <div v-if="formError" class="alert alert-error">{{ formError }}</div>

        <div class="field">
          <label for="f-name">Nama</label>
          <input id="f-name" v-model="form.name" required autofocus>
        </div>

        <div class="field">
          <label for="f-phone">Nomor HP (WhatsApp)</label>
          <input id="f-phone" v-model="form.phone" inputmode="tel" placeholder="08123456789" required>
          <div class="muted small" style="margin-top: 4px">
            Dipakai untuk notifikasi tagihan dan login aplikasi pelanggan.
          </div>
        </div>

        <div class="field">
          <label for="f-address">Alamat</label>
          <input id="f-address" v-model="form.address">
        </div>

        <div class="field">
          <label for="f-note">Catatan</label>
          <input id="f-note" v-model="form.note" placeholder="opsional">
        </div>

        <div class="actions" style="margin-top: 16px">
          <button type="submit" :disabled="saving">{{ saving ? 'Menyimpan...' : 'Simpan' }}</button>
          <button type="button" class="ghost" @click="showForm = false">Batal</button>
        </div>
      </form>
    </div>
  </div>
</template>
