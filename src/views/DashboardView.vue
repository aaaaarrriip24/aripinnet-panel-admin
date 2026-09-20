<script setup>
import { ref, onMounted } from 'vue';
import { api, rupiah, tanggal } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();

const data = ref(null);
const loading = ref(true);
const error = ref('');
const generating = ref(false);
const genResult = ref('');

async function load() {
  loading.value = true;
  error.value = '';
  try {
    data.value = await api.get('/admin/dashboard');
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

/**
 * Jalankan generator invoice manual. Aman ditekan berkali-kali —
 * unique index (service_id, period) mencegah tagihan dobel.
 */
async function generateInvoices() {
  if (!confirm('Terbitkan tagihan untuk semua layanan yang jatuh tempo?')) return;

  generating.value = true;
  genResult.value = '';
  try {
    const { result } = await api.post('/admin/jobs/generate-invoices');
    genResult.value = `${result.issued} tagihan terbit, ${result.skipped} dilewati` +
                      (result.failed ? `, ${result.failed} gagal` : '');
    await load();
  } catch (e) {
    genResult.value = 'Gagal: ' + e.message;
  } finally {
    generating.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1>Beranda</h1>
        <p class="muted small">Ringkasan hari ini</p>
      </div>
      <div class="actions">
        <button class="ghost sm" @click="load" :disabled="loading">Muat ulang</button>
        <button
          v-if="auth.canVoidInvoice"
          class="sm"
          @click="generateInvoices"
          :disabled="generating"
        >{{ generating ? 'Memproses...' : 'Terbitkan tagihan' }}</button>
      </div>
    </div>

    <div v-if="error" class="alert alert-error">{{ error }}</div>
    <div v-if="genResult" class="alert alert-ok">{{ genResult }}</div>

    <div v-if="loading && !data" class="card empty"><span class="spinner"></span> Memuat...</div>

    <template v-else-if="data">
      <!-- Peringatan WhatsApp: gejala nomor kena banned -->
      <div v-if="data.alert_wa" class="alert alert-warning">{{ data.alert_wa }}</div>

      <div class="grid grid-3" style="margin-bottom: 14px">
        <div class="card" style="margin: 0">
          <div class="stat-label">Masuk hari ini</div>
          <div class="stat-value">{{ rupiah(data.hari_ini.total) }}</div>
          <div class="stat-sub">{{ data.hari_ini.count }} transaksi</div>
        </div>

        <div class="card" style="margin: 0">
          <div class="stat-label">Masuk bulan ini</div>
          <div class="stat-value">{{ rupiah(data.bulan_ini.total) }}</div>
          <div class="stat-sub">{{ data.bulan_ini.count }} transaksi</div>
        </div>

        <div class="card" style="margin: 0">
          <div class="stat-label">Piutang</div>
          <div class="stat-value" :style="data.piutang.total ? 'color: var(--danger)' : ''">
            {{ rupiah(data.piutang.total) }}
          </div>
          <div class="stat-sub">
            <RouterLink :to="{ name: 'invoices', query: { status: 'unpaid' } }">
              {{ data.piutang.count }} tagihan belum lunas
            </RouterLink>
          </div>
        </div>
      </div>

      <div class="grid grid-2" style="margin-bottom: 14px">
        <div class="card" style="margin: 0">
          <div class="stat-label">Layanan aktif</div>
          <div class="stat-value">{{ data.services.active }}</div>
          <div class="stat-sub">{{ data.customers.active }} pelanggan</div>
        </div>

        <div class="card" style="margin: 0">
          <div class="stat-label">Terisolir</div>
          <div class="stat-value" :style="data.services.isolated ? 'color: var(--warning)' : ''">
            {{ data.services.isolated }}
          </div>
          <div class="stat-sub">
            <RouterLink :to="{ name: 'invoices', query: { overdue: 'true' } }">
              lihat yang menunggak
            </RouterLink>
          </div>
        </div>
      </div>

      <div class="card card-tight">
        <div style="padding: 14px 16px 0"><h2>Status router</h2></div>
        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Router</th>
                <th>Lokasi</th>
                <th>Status</th>
                <th>Terakhir terlihat</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in data.routers" :key="r.id">
                <td><strong>{{ r.name }}</strong></td>
                <td class="muted">{{ r.site || '-' }}</td>
                <td>
                  <span class="badge" :class="r.status === 'online' ? 'badge-ok' : 'badge-danger'">
                    {{ r.status === 'online' ? 'Online' : 'Offline' }}
                  </span>
                </td>
                <td class="muted small">{{ tanggal(r.last_seen_at, true) }}</td>
              </tr>
              <tr v-if="!data.routers.length">
                <td colspan="4" class="empty">Belum ada router terdaftar</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>
</template>
