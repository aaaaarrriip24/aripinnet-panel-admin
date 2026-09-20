<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { api, rupiah, tanggal, relatif } from '@/lib/api';

const route = useRoute();
const id = route.params.id;

const customer = ref(null);
const services = ref([]);
const invoices = ref([]);
const loading = ref(true);
const error = ref('');
const notice = ref('');

const busyService = ref(null); // id layanan yang sedang diproses
const events = ref([]);
const eventsFor = ref(null);

// Form tambah layanan
const showForm = ref(false);
const plans = ref([]);
const routers = ref([]);
const form = ref({ plan_id: '', router_id: '', type: 'pppoe', username: '', due_day: 5, static_ip: '' });
const saving = ref(false);
const formError = ref('');
const newSecret = ref('');

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const data = await api.get(`/admin/customers/${id}`);
    customer.value = data.customer;
    services.value = data.services;
    invoices.value = data.invoices;
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

/**
 * Isolir/buka isolir manual.
 *
 * Konfirmasi wajib: ini memutus internet orang sungguhan. Salah klik di
 * HP sambil jalan bukan hal yang mustahil.
 */
async function toggleIsolir(service) {
  const isIsolated = service.status === 'isolated';
  const action = isIsolated ? 'restore' : 'isolate';

  const msg = isIsolated
    ? `Aktifkan kembali layanan ${service.username}?`
    : `Putuskan internet ${service.username} sekarang?`;
  if (!confirm(msg)) return;

  busyService.value = service._id;
  notice.value = '';
  try {
    const res = await api.post(`/admin/services/${service._id}/${action}`);
    notice.value = res.message;
    await load();
  } catch (e) {
    // Kegagalan di sini hampir selalu berarti router tidak terjangkau
    error.value = `Gagal: ${e.message}. Cek koneksi VPN ke router.`;
  } finally {
    busyService.value = null;
  }
}

async function showEvents(service) {
  if (eventsFor.value === service._id) {
    eventsFor.value = null;
    return;
  }
  eventsFor.value = service._id;
  events.value = [];
  try {
    const data = await api.get(`/admin/services/${service._id}/events`);
    events.value = data.events;
  } catch (e) {
    error.value = e.message;
  }
}

/**
 * Hanya tawarkan paket yang sudah dipetakan ke router yang dipilih.
 *
 * Paket yang belum dipetakan akan membuat PPP secret gagal dibuat, dan
 * lebih buruk lagi, layanannya tidak akan bisa dibuka isolirnya nanti.
 * Lebih baik tidak muncul di pilihan sama sekali.
 */
const availablePlans = computed(() => {
  if (!form.value.router_id) return [];
  return plans.value.filter(
    (p) => p.is_active && (p.routers || []).some(
      (r) => String(r.router_id) === String(form.value.router_id) && r.mapped
    )
  );
});

const unmappedCount = computed(() => {
  if (!form.value.router_id) return 0;
  return plans.value.filter((p) => p.is_active).length - availablePlans.value.length;
});

// Kalau router diganti, paket yang dipilih bisa jadi tidak tersedia di sana
function onRouterChange() {
  if (!availablePlans.value.some((p) => p._id === form.value.plan_id)) {
    form.value.plan_id = availablePlans.value[0]?._id || '';
  }
}

async function openForm() {
  showForm.value = true;
  formError.value = '';
  try {
    const [p, r] = await Promise.all([api.get('/admin/plans'), api.get('/admin/routers')]);
    plans.value = p.plans;
    routers.value = r.routers;
    if (routers.value.length) form.value.router_id = routers.value[0]._id;
    onRouterChange();
  } catch (e) {
    formError.value = e.message;
  }
}

async function submitForm() {
  saving.value = true;
  formError.value = '';
  try {
    const data = await api.post('/admin/services', { ...form.value, customer_id: id });
    newSecret.value = data.secret;
    showForm.value = false;

    notice.value = data.provision.success
      ? 'Layanan dibuat dan PPP secret terpasang di router.'
      : `Layanan tercatat, tapi gagal dipasang di router: ${data.provision.message}. Pasang manual lewat Winbox, atau perbaiki koneksi lalu buat ulang.`;

    await load();
  } catch (e) {
    formError.value = e.message;
  } finally {
    saving.value = false;
  }
}

function statusBadge(s) {
  return { active: 'badge-ok', isolated: 'badge-warning' }[s] || 'badge-muted';
}

function invoiceBadge(s) {
  return { paid: 'badge-ok', unpaid: 'badge-danger', void: 'badge-muted' }[s] || 'badge-muted';
}

onMounted(load);
</script>

<template>
  <div class="page">
    <p class="small" style="margin-bottom: 10px">
      <RouterLink :to="{ name: 'customers' }">&larr; Semua pelanggan</RouterLink>
    </p>

    <div v-if="error" class="alert alert-error">{{ error }}</div>
    <div v-if="notice" class="alert alert-ok">{{ notice }}</div>
    <div v-if="newSecret" class="alert alert-warning">
      Password PPPoE: <strong>{{ newSecret }}</strong> — catat sekarang, tidak ditampilkan lagi.
    </div>

    <div v-if="loading" class="card empty"><span class="spinner"></span> Memuat...</div>

    <template v-else-if="customer">
      <div class="page-head">
        <div>
          <h1>{{ customer.name }}</h1>
          <p class="muted small">
            {{ customer.code }} &middot; {{ customer.phone }}
            <template v-if="customer.address"> &middot; {{ customer.address }}</template>
          </p>
        </div>
        <button class="sm" @click="openForm">Tambah layanan</button>
      </div>

      <!-- Layanan -->
      <h2>Layanan</h2>
      <div v-for="s in services" :key="s._id" class="card">
        <div style="display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap">
          <div>
            <strong>{{ s.username }}</strong>
            <span class="badge" :class="statusBadge(s.status)" style="margin-left: 6px">
              {{ s.status === 'isolated' ? 'Terisolir' : s.status }}
            </span>
            <div class="muted small" style="margin-top: 3px">
              {{ s.plan_id?.name }} ({{ s.plan_id?.rate_limit }}) &middot;
              {{ s.router_id?.name }} &middot;
              {{ s.type }}
              <template v-if="s.static_ip"> &middot; {{ s.static_ip }}</template>
            </div>
            <div class="muted small">
              Jatuh tempo berikutnya: {{ tanggal(s.next_due_date) }} ({{ relatif(s.next_due_date) }})
            </div>
          </div>

          <div class="actions">
            <button class="ghost sm" @click="showEvents(s)">
              {{ eventsFor === s._id ? 'Tutup riwayat' : 'Riwayat' }}
            </button>
            <button
              class="sm"
              :class="s.status === 'isolated' ? '' : 'danger'"
              :disabled="busyService === s._id"
              @click="toggleIsolir(s)"
            >
              <span v-if="busyService === s._id" class="spinner"></span>
              {{ s.status === 'isolated' ? 'Buka isolir' : 'Isolir' }}
            </button>
          </div>
        </div>

        <!-- Riwayat aksi — yang dibuka saat pelanggan komplain -->
        <div v-if="eventsFor === s._id" style="margin-top: 14px; border-top: 1px solid var(--border); padding-top: 12px">
          <div v-if="!events.length" class="muted small">Belum ada riwayat.</div>
          <div
            v-for="e in events"
            :key="e._id"
            class="small"
            style="display: flex; gap: 10px; padding: 5px 0; border-bottom: 1px solid var(--border)"
          >
            <span class="muted" style="min-width: 130px">{{ tanggal(e.created_at, true) }}</span>
            <span style="flex: 1">
              {{ e.action }}
              <span class="badge" :class="e.success ? 'badge-ok' : 'badge-danger'">
                {{ e.success ? 'ok' : 'gagal' }}
              </span>
              <span class="muted"> &middot; {{ e.trigger }}</span>
              <span v-if="e.admin_id" class="muted"> oleh {{ e.admin_id.name }}</span>
              <div v-if="!e.success" class="muted" style="word-break: break-word">
                {{ e.router_response }}
              </div>
            </span>
          </div>
        </div>
      </div>

      <div v-if="!services.length" class="card empty">
        Belum ada layanan. Tambahkan satu agar tagihan bisa terbit otomatis.
      </div>

      <!-- Tagihan -->
      <h2 style="margin-top: 22px">Tagihan terakhir</h2>
      <div class="card card-tight">
        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Periode</th>
                <th>Nomor</th>
                <th class="num">Jumlah</th>
                <th>Jatuh tempo</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="i in invoices" :key="i._id">
                <td>{{ i.period }}</td>
                <td class="muted small">{{ i.number }}</td>
                <td class="num">{{ rupiah(i.total_idr) }}</td>
                <td>
                  {{ tanggal(i.due_date) }}
                  <div v-if="i.status === 'unpaid'" class="muted small">{{ relatif(i.due_date) }}</div>
                </td>
                <td><span class="badge" :class="invoiceBadge(i.status)">{{ i.status }}</span></td>
              </tr>
              <tr v-if="!invoices.length">
                <td colspan="5" class="empty">Belum ada tagihan</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <!-- Form tambah layanan -->
    <div v-if="showForm" class="modal-bg" @click.self="showForm = false">
      <form class="modal" @submit.prevent="submitForm">
        <h2>Tambah layanan</h2>

        <div v-if="formError" class="alert alert-error">{{ formError }}</div>

        <div class="field">
          <label for="s-type">Tipe</label>
          <select id="s-type" v-model="form.type">
            <option value="pppoe">PPPoE</option>
            <option value="static">Static IP</option>
          </select>
        </div>

        <div class="field">
          <label for="s-user">Username</label>
          <input id="s-user" v-model="form.username" required placeholder="mis. budi-veteran3">
          <div class="muted small" style="margin-top: 4px">
            Ini nama PPP secret di router. Harus unik per router.
          </div>
        </div>

        <div v-if="form.type === 'static'" class="field">
          <label for="s-ip">IP statis</label>
          <input id="s-ip" v-model="form.static_ip" placeholder="192.168.10.25" required>
        </div>

        <div class="field">
          <label for="s-router">Router</label>
          <select id="s-router" v-model="form.router_id" required @change="onRouterChange">
            <option v-for="r in routers" :key="r._id" :value="r._id">
              {{ r.name }} <template v-if="r.status !== 'online'">(offline)</template>
            </option>
          </select>
        </div>

        <div class="field">
          <label for="s-plan">Paket</label>
          <select id="s-plan" v-model="form.plan_id" required :disabled="!availablePlans.length">
            <option v-for="p in availablePlans" :key="p._id" :value="p._id">
              {{ p.name }} — {{ rupiah(p.price_idr) }} ({{ p.rate_limit }})
            </option>
          </select>

          <div v-if="!availablePlans.length" class="alert alert-warning small" style="margin-top: 8px">
            Belum ada paket yang dipetakan ke router ini.
            <RouterLink :to="{ name: 'plans' }">Petakan paket dulu</RouterLink>
            agar layanan bisa dibuat dan isolirnya bisa dibuka nanti.
          </div>
          <div v-else-if="unmappedCount" class="muted small" style="margin-top: 4px">
            {{ unmappedCount }} paket lain belum dipetakan ke router ini, jadi tidak ditampilkan.
          </div>
        </div>

        <div class="field">
          <label for="s-due">Tanggal tagihan tiap bulan</label>
          <input id="s-due" v-model.number="form.due_day" type="number" min="1" max="28">
          <div class="muted small" style="margin-top: 4px">
            Maksimal 28 agar tidak bermasalah di bulan Februari.
          </div>
        </div>

        <div class="actions" style="margin-top: 16px">
          <button type="submit" :disabled="saving">{{ saving ? 'Menyimpan...' : 'Simpan' }}</button>
          <button type="button" class="ghost" @click="showForm = false">Batal</button>
        </div>
      </form>
    </div>
  </div>
</template>
