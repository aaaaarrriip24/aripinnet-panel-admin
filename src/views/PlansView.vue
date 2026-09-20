<script setup>
/**
 * Kelola paket dan pemetaannya ke tiap MikroTik.
 *
 * Bentuk tampilannya matriks: baris = paket, kolom = router. Ini dipilih
 * karena pertanyaan yang paling sering muncul bukan "apa saja paketnya",
 * melainkan "paket ini sudah siap dipakai di router mana saja".
 */
import { ref, onMounted } from 'vue';
import { api, rupiah, tanggal } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();

const plans = ref([]);
const routers = ref([]);
const loading = ref(true);
const error = ref('');
const notice = ref('');
const busy = ref(null);

// Form paket
const showPlanForm = ref(false);
const editing = ref(null);
const form = ref({ name: '', price_idr: null, rate_limit: '', cycle_days: 30, tax_percent: 0 });
const saving = ref(false);
const formError = ref('');

// Dialog pemetaan
const mapDialog = ref(null);   // { plan, router, ppp_profile, existing[] }
const mapping = ref(false);
const mapError = ref('');
const conflict = ref(null);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const data = await api.get('/admin/plans');
    plans.value = data.plans;
    routers.value = data.routers;
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

/* ---------- CRUD paket ---------- */

function openPlanForm(plan = null) {
  editing.value = plan;
  formError.value = '';
  form.value = plan
    ? {
        name: plan.name, price_idr: plan.price_idr, rate_limit: plan.rate_limit,
        cycle_days: plan.cycle_days, tax_percent: plan.tax_percent,
      }
    : { name: '', price_idr: null, rate_limit: '', cycle_days: 30, tax_percent: 0 };
  showPlanForm.value = true;
}

async function submitPlan() {
  saving.value = true;
  formError.value = '';
  try {
    const res = editing.value
      ? await api.patch(`/admin/plans/${editing.value._id}`, form.value)
      : await api.post('/admin/plans', form.value);

    notice.value = res.warning || res.next || 'Paket disimpan.';
    showPlanForm.value = false;
    await load();
  } catch (e) {
    formError.value = e.message;
  } finally {
    saving.value = false;
  }
}

async function toggleActive(plan) {
  busy.value = plan._id;
  try {
    await api.patch(`/admin/plans/${plan._id}`, { is_active: !plan.is_active });
    await load();
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = null;
  }
}

async function hapusPaket(plan) {
  if (!confirm(`Hapus paket "${plan.name}"?`)) return;

  busy.value = plan._id;
  try {
    await api.del(`/admin/plans/${plan._id}`);
    notice.value = 'Paket dihapus.';
    await load();
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = null;
  }
}

/* ---------- Pemetaan ke router ---------- */

async function openMap(plan, routerCell) {
  conflict.value = null;
  mapError.value = '';

  mapDialog.value = {
    plan,
    router: routerCell,
    ppp_profile: routerCell.ppp_profile || slug(plan.name),
    existing: [],
    loadingProfiles: true,
  };

  // Tawarkan profile yang sudah ada di router — kebanyakan jaringan
  // yang sudah berjalan punya profile lama yang ingin dipakai ulang.
  try {
    const data = await api.get(`/admin/plans/routers/${routerCell.router_id}/profiles`);
    mapDialog.value.existing = data.profiles;
  } catch (e) {
    mapDialog.value.profileError = e.message;
  } finally {
    mapDialog.value.loadingProfiles = false;
  }
}

async function submitMap(force = false) {
  mapping.value = true;
  mapError.value = '';
  conflict.value = null;

  const { plan, router, ppp_profile } = mapDialog.value;

  try {
    const res = await api.put(`/admin/plans/${plan._id}/routers/${router.router_id}`, {
      ppp_profile, sync: true, force,
    });
    notice.value = res.message;
    mapDialog.value = null;
    await load();
  } catch (e) {
    // 409 = profile sudah ada dengan rate-limit berbeda
    if (e.status === 409 && e.data?.conflict) {
      conflict.value = { message: e.message, ...e.data };
    } else {
      mapError.value = e.message;
    }
  } finally {
    mapping.value = false;
  }
}

async function lepasMap(plan, routerCell) {
  if (!confirm(`Lepas pemetaan "${plan.name}" dari ${routerCell.router_name}? Profile di router tidak dihapus.`)) return;

  busy.value = plan._id;
  try {
    const res = await api.del(`/admin/plans/${plan._id}/routers/${routerCell.router_id}`);
    notice.value = res.message;
    await load();
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = null;
  }
}

async function periksaSemua() {
  busy.value = 'verify';
  notice.value = '';
  try {
    const r = await api.post('/admin/plans/verify');
    notice.value = `Diperiksa ${r.checked} pemetaan: ${r.in_sync} cocok, ` +
                   `${r.out_of_sync} beda rate-limit, ${r.missing} profile hilang` +
                   (r.unreachable ? `, ${r.unreachable} router tak terjangkau` : '');
    await load();
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = null;
  }
}

function slug(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
}

function cellClass(cell) {
  if (!cell.mapped) return 'cell-none';
  if (cell.last_error) return 'cell-error';
  return cell.in_sync ? 'cell-ok' : 'cell-warn';
}

function cellLabel(cell) {
  if (!cell.mapped) return 'Belum dipetakan';
  if (cell.last_error) return 'Bermasalah';
  return cell.in_sync ? 'Sinkron' : 'Perlu sinkron';
}

onMounted(load);
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1>Paket</h1>
        <p class="muted small">
          Satu paket bisa memakai nama PPP profile berbeda di tiap router.
        </p>
      </div>
      <div class="actions">
        <button class="ghost sm" :disabled="busy === 'verify'" @click="periksaSemua">
          <span v-if="busy === 'verify'" class="spinner"></span>
          Periksa semua
        </button>
        <button v-if="auth.canVoidInvoice" class="sm" @click="openPlanForm()">Tambah paket</button>
      </div>
    </div>

    <div v-if="error" class="alert alert-error">{{ error }}</div>
    <div v-if="notice" class="alert alert-ok">{{ notice }}</div>

    <div v-if="loading" class="card empty"><span class="spinner"></span> Memuat...</div>

    <div v-else-if="!routers.length" class="card empty">
      Belum ada router. Tambahkan router lebih dulu sebelum memetakan paket.
    </div>

    <template v-else>
      <div v-for="plan in plans" :key="plan._id" class="card">
        <div class="row-head">
          <div>
            <strong>{{ plan.name }}</strong>
            <span v-if="!plan.is_active" class="badge badge-muted" style="margin-left: 6px">Nonaktif</span>
            <div class="muted small">
              {{ rupiah(plan.price_idr) }} / {{ plan.cycle_days }} hari &middot;
              <code>{{ plan.rate_limit }}</code> &middot;
              {{ plan.total_services }} layanan
            </div>
          </div>
          <div class="actions" v-if="auth.canVoidInvoice">
            <button class="ghost sm" @click="openPlanForm(plan)">Ubah</button>
            <button class="ghost sm" :disabled="busy === plan._id" @click="toggleActive(plan)">
              {{ plan.is_active ? 'Nonaktifkan' : 'Aktifkan' }}
            </button>
            <button
              v-if="auth.canManageRouters && plan.total_services === 0"
              class="ghost sm"
              :disabled="busy === plan._id"
              @click="hapusPaket(plan)"
            >Hapus</button>
          </div>
        </div>

        <!-- Peringatan paling penting di halaman ini: paket yang belum
             dipetakan tidak bisa dipakai, dan restore-nya akan gagal -->
        <div v-if="plan.unmapped_count === routers.length" class="alert alert-warning small" style="margin-top: 12px">
          Paket ini belum dipetakan ke router mana pun, jadi belum bisa dipakai untuk layanan baru.
        </div>

        <div class="routers">
          <div
            v-for="cell in plan.routers"
            :key="cell.router_id"
            class="router-cell"
            :class="cellClass(cell)"
          >
            <div class="cell-top">
              <strong>{{ cell.router_name }}</strong>
              <span class="cell-tag">{{ cellLabel(cell) }}</span>
            </div>

            <div v-if="cell.mapped" class="muted small">
              <code>{{ cell.ppp_profile }}</code>
              <template v-if="cell.services"> &middot; {{ cell.services }} layanan</template>
            </div>
            <div v-else class="muted small">—</div>

            <div v-if="cell.last_error" class="small err-text">{{ cell.last_error }}</div>
            <div v-else-if="cell.mapped && !cell.in_sync" class="small err-text">
              Rate-limit di router belum tentu {{ plan.rate_limit }}
            </div>
            <div v-else-if="cell.synced_at" class="muted small">
              Sinkron {{ tanggal(cell.synced_at, true) }}
            </div>

            <div class="actions" style="margin-top: 8px" v-if="auth.canVoidInvoice">
              <button class="ghost sm" @click="openMap(plan, cell)">
                {{ cell.mapped ? 'Sinkronkan' : 'Petakan' }}
              </button>
              <button
                v-if="cell.mapped && !cell.services"
                class="ghost sm"
                :disabled="busy === plan._id"
                @click="lepasMap(plan, cell)"
              >Lepas</button>
            </div>
          </div>
        </div>
      </div>

      <div v-if="!plans.length" class="card empty">
        Belum ada paket. Tambahkan satu untuk mulai menagih.
      </div>
    </template>

    <!-- Form paket -->
    <div v-if="showPlanForm" class="modal-bg" @click.self="showPlanForm = false">
      <form class="modal" @submit.prevent="submitPlan">
        <h2>{{ editing ? 'Ubah paket' : 'Tambah paket' }}</h2>

        <div v-if="formError" class="alert alert-error">{{ formError }}</div>

        <div class="field">
          <label for="p-name">Nama paket</label>
          <input id="p-name" v-model="form.name" required placeholder="Home 10 Mbps">
        </div>

        <div class="field">
          <label for="p-price">Harga per bulan (Rp)</label>
          <input id="p-price" v-model.number="form.price_idr" type="number" min="0" required>
        </div>

        <div class="field">
          <label for="p-rate">Rate limit</label>
          <input id="p-rate" v-model="form.rate_limit" required placeholder="10M/10M">
          <div class="muted small" style="margin-top: 4px">
            Format RouterOS: upload/download. Contoh: <code>10M/10M</code>, <code>512k/2M</code>.
          </div>
        </div>

        <div class="field">
          <label for="p-cycle">Siklus tagihan (hari)</label>
          <input id="p-cycle" v-model.number="form.cycle_days" type="number" min="1">
          <div class="muted small" style="margin-top: 4px">30 = bulanan mengikuti tanggal kalender.</div>
        </div>

        <div v-if="editing" class="alert alert-warning small">
          Mengubah rate limit tidak langsung mengubah router. Setelah disimpan,
          sinkronkan ulang ke setiap router agar kecepatan pelanggan ikut berubah.
        </div>

        <div class="actions" style="margin-top: 16px">
          <button type="submit" :disabled="saving">{{ saving ? 'Menyimpan...' : 'Simpan' }}</button>
          <button type="button" class="ghost" @click="showPlanForm = false">Batal</button>
        </div>
      </form>
    </div>

    <!-- Dialog pemetaan -->
    <div v-if="mapDialog" class="modal-bg" @click.self="mapDialog = null">
      <div class="modal">
        <h2>{{ mapDialog.plan.name }} &rarr; {{ mapDialog.router.router_name }}</h2>
        <p class="muted small" style="margin-bottom: 14px">
          Profile akan dibuat di router dengan rate-limit <code>{{ mapDialog.plan.rate_limit }}</code>,
          atau dipakai apa adanya kalau sudah ada.
        </p>

        <div v-if="mapError" class="alert alert-error">{{ mapError }}</div>

        <!-- Konflik: profile ada tapi rate-limit beda -->
        <div v-if="conflict" class="alert alert-warning">
          <strong>{{ conflict.message }}</strong>
          <p style="margin: 8px 0 0">{{ conflict.hint }}</p>
        </div>

        <div class="field">
          <label for="m-profile">Nama PPP profile di router ini</label>
          <input id="m-profile" v-model="mapDialog.ppp_profile" required>
        </div>

        <div v-if="mapDialog.loadingProfiles" class="muted small">
          <span class="spinner"></span> Membaca profile di router...
        </div>

        <div v-else-if="mapDialog.profileError" class="alert alert-error small">
          Tidak bisa membaca profile: {{ mapDialog.profileError }}
        </div>

        <div v-else-if="mapDialog.existing.length">
          <label>Profile yang sudah ada di router</label>
          <div class="profile-list">
            <button
              v-for="p in mapDialog.existing"
              :key="p.id"
              type="button"
              class="ghost sm"
              @click="mapDialog.ppp_profile = p.name"
            >
              {{ p.name }}
              <span class="muted">{{ p.rate_limit || 'tanpa limit' }}</span>
            </button>
          </div>
        </div>

        <div class="actions" style="margin-top: 16px">
          <button v-if="!conflict" :disabled="mapping" @click="submitMap(false)">
            <span v-if="mapping" class="spinner"></span>
            {{ mapping ? 'Menyinkronkan...' : 'Simpan & sinkronkan' }}
          </button>
          <button v-else class="danger" :disabled="mapping" @click="submitMap(true)">
            Timpa rate-limit di router
          </button>
          <button class="ghost" @click="mapDialog = null">Batal</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.row-head {
  display: flex; justify-content: space-between; gap: 12px;
  flex-wrap: wrap; align-items: flex-start;
}

.routers {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 10px;
  margin-top: 14px;
}

.router-cell {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 10px 12px;
  background: var(--surface-2);
}
.cell-top { display: flex; justify-content: space-between; gap: 8px; align-items: center; }
.cell-tag { font-size: 11px; font-weight: 500; white-space: nowrap; }

.cell-ok    { border-color: var(--border); }
.cell-ok    .cell-tag { color: var(--success); }
.cell-warn  { border-color: var(--border-warning, var(--border-strong)); background: var(--warning-bg); }
.cell-warn  .cell-tag { color: var(--warning); }
.cell-error { background: var(--danger-bg); }
.cell-error .cell-tag { color: var(--danger); }
.cell-none  .cell-tag { color: var(--text-muted); }

.err-text { color: var(--danger); margin-top: 4px; word-break: break-word; }

.profile-list { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
.profile-list button { font-size: 12px; padding: 4px 9px; }
.profile-list .muted { margin-left: 5px; font-size: 11px; }

code {
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
  font-size: .92em;
  background: var(--surface-2);
  padding: 1px 5px;
  border-radius: 4px;
}
</style>
