<script setup>
/**
 * Laporan bulanan.
 *
 * Angka yang paling penting di halaman ini adalah collection rate, bukan
 * total pemasukan. Pemasukan bisa terlihat bagus di bulan pelanggan
 * membayar tunggakan lama, sementara penagihan bulan berjalan justru
 * memburuk. Karena itu tunggakan lama ditampilkan terpisah.
 */
import { ref, onMounted, watch, computed } from 'vue';
import { api, rupiah, tanggal } from '@/lib/api';

const period = ref('');
const periods = ref([]);
const data = ref(null);
const trend = ref([]);
const loading = ref(false);
const error = ref('');
const exporting = ref(false);

const metodeLabel = {
  qris: 'QRIS', va: 'Virtual Account', retail: 'Minimarket',
  ewallet: 'E-wallet', transfer: 'Transfer bank', cash: 'Tunai',
};

/** Tinggi batang grafik tren, relatif terhadap nilai tertinggi. */
const trendMax = computed(() =>
  Math.max(1, ...trend.value.map((t) => t.ditagih))
);

async function loadPeriods() {
  try {
    const d = await api.get('/admin/reports/periods');
    periods.value = d.periods;
    if (!period.value) {
      period.value = d.periods[0] || new Date().toISOString().slice(0, 7);
    }
  } catch (e) {
    error.value = e.message;
  }
}

async function load() {
  if (!period.value) return;
  loading.value = true;
  error.value = '';
  try {
    const [monthly, tr] = await Promise.all([
      api.get('/admin/reports/monthly', { period: period.value }),
      api.get('/admin/reports/trend', { months: 6 }),
    ]);
    data.value = monthly;
    trend.value = tr.trend;
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

watch(period, load);

/**
 * Ekspor CSV. Dibuat di browser dari data mentah yang dikirim server —
 * tidak perlu endpoint khusus, dan laporan RT/RW net tidak pernah besar.
 */
async function exportCsv(type) {
  exporting.value = true;
  try {
    const d = await api.get('/admin/reports/monthly/detail', { period: period.value, type });

    const header = type === 'tagihan'
      ? ['Nomor', 'Kode', 'Pelanggan', 'Layanan', 'Router', 'Jumlah', 'Jatuh tempo', 'Status', 'Dibayar']
      : ['Waktu', 'Nomor tagihan', 'Kode', 'Pelanggan', 'Metode', 'Channel', 'Diterima oleh', 'Jumlah'];

    const rows = d.rows.map((r) => type === 'tagihan'
      ? [r.nomor, r.kode, r.pelanggan, r.layanan, r.router, r.jumlah, tanggal(r.jatuh_tempo), r.status, r.dibayar ? tanggal(r.dibayar) : '']
      : [tanggal(r.waktu, true), r.nomor, r.kode, r.pelanggan, metodeLabel[r.metode] || r.metode, r.channel, r.diterima_oleh, r.jumlah]
    );

    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');

    // BOM supaya Excel membaca UTF-8 dengan benar
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${type}-${period.value}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    error.value = e.message;
  } finally {
    exporting.value = false;
  }
}

function rateColor(rate) {
  if (rate >= 90) return 'var(--success)';
  if (rate >= 70) return 'var(--warning)';
  return 'var(--danger)';
}

onMounted(async () => {
  await loadPeriods();
  await load();
});
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1>Laporan</h1>
        <p class="muted small">{{ data?.label || 'Pilih periode' }}</p>
      </div>
      <div class="actions">
        <select v-model="period" style="width: auto; min-width: 130px">
          <option v-for="p in periods" :key="p" :value="p">{{ p }}</option>
        </select>
        <button class="ghost sm" :disabled="exporting" @click="exportCsv('tagihan')">
          CSV tagihan
        </button>
        <button class="ghost sm" :disabled="exporting" @click="exportCsv('kas')">
          CSV kas
        </button>
      </div>
    </div>

    <div v-if="error" class="alert alert-error">{{ error }}</div>
    <div v-if="loading && !data" class="card empty"><span class="spinner"></span> Menyusun laporan...</div>

    <template v-else-if="data">
      <!-- Ringkasan -->
      <div class="grid grid-3" style="margin-bottom: 14px">
        <div class="card" style="margin: 0">
          <div class="stat-label">Ditagih periode ini</div>
          <div class="stat-value">{{ rupiah(data.tagihan.terbit_total) }}</div>
          <div class="stat-sub">{{ data.tagihan.terbit_count }} tagihan</div>
        </div>

        <div class="card" style="margin: 0">
          <div class="stat-label">Sudah lunas</div>
          <div class="stat-value" style="color: var(--success)">{{ rupiah(data.tagihan.lunas_total) }}</div>
          <div class="stat-sub">{{ data.tagihan.lunas_count }} tagihan</div>
        </div>

        <div class="card" style="margin: 0">
          <div class="stat-label">Tingkat penagihan</div>
          <div class="stat-value" :style="{ color: rateColor(data.tagihan.collection_rate) }">
            {{ data.tagihan.collection_rate }}%
          </div>
          <div class="stat-sub">dari tagihan periode ini</div>
        </div>
      </div>

      <!-- Tunggakan lama: sering terlupakan karena tidak muncul di
           laporan bulan berjalan -->
      <div v-if="data.tunggakan_lama.count" class="alert alert-warning">
        <strong>{{ rupiah(data.tunggakan_lama.total) }}</strong> tunggakan dari periode sebelumnya
        ({{ data.tunggakan_lama.count }} tagihan) masih belum terbayar.
        <RouterLink :to="{ name: 'invoices', query: { overdue: 'true' } }">Lihat daftarnya</RouterLink>
      </div>

      <!-- Kas masuk -->
      <div class="card">
        <div class="row" style="display: flex; justify-content: space-between; align-items: baseline">
          <h2 style="margin: 0">Uang masuk bulan ini</h2>
          <strong>{{ rupiah(data.kas.total) }}</strong>
        </div>
        <p class="muted small" style="margin-top: 4px">
          Termasuk pembayaran tunggakan periode sebelumnya, jadi angkanya bisa
          berbeda dari "sudah lunas" di atas.
        </p>

        <div class="table-scroll" style="margin-top: 10px">
          <table>
            <thead>
              <tr><th>Metode</th><th class="num">Transaksi</th><th class="num">Jumlah</th><th class="num">Porsi</th></tr>
            </thead>
            <tbody>
              <tr v-for="m in data.kas.per_metode" :key="m.metode">
                <td>{{ metodeLabel[m.metode] || m.metode }}</td>
                <td class="num">{{ m.count }}</td>
                <td class="num">{{ rupiah(m.total) }}</td>
                <td class="num">{{ m.persen }}%</td>
              </tr>
              <tr v-if="!data.kas.per_metode.length">
                <td colspan="4" class="empty">Belum ada pembayaran di periode ini</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Per router -->
      <div class="card card-tight">
        <div style="padding: 14px 16px 0">
          <h2>Per router</h2>
          <p class="muted small">
            Tingkat penagihan yang timpang antar lokasi biasanya soal penagih,
            bukan soal pelanggan.
          </p>
        </div>
        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Router</th>
                <th class="num">Ditagih</th>
                <th class="num">Lunas</th>
                <th class="num">Tingkat</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in data.per_router" :key="r.router_id">
                <td>
                  <strong>{{ r.router }}</strong>
                  <div v-if="r.site" class="muted small">{{ r.site }}</div>
                </td>
                <td class="num">
                  {{ rupiah(r.ditagih_total) }}
                  <div class="muted small">{{ r.ditagih_count }} tagihan</div>
                </td>
                <td class="num">
                  {{ rupiah(r.lunas_total) }}
                  <div class="muted small">{{ r.lunas_count }} tagihan</div>
                </td>
                <td class="num" :style="{ color: rateColor(r.collection_rate) }">
                  {{ r.collection_rate }}%
                </td>
              </tr>
              <tr v-if="!data.per_router.length">
                <td colspan="4" class="empty">Belum ada tagihan di periode ini</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Tren -->
      <div class="card">
        <h2>Enam bulan terakhir</h2>
        <div class="chart">
          <div v-for="t in trend" :key="t.period" class="bar-col">
            <div class="bars">
              <div
                class="bar bar-billed"
                :style="{ height: (t.ditagih / trendMax * 100) + '%' }"
                :title="`Ditagih ${rupiah(t.ditagih)}`"
              ></div>
              <div
                class="bar bar-paid"
                :style="{ height: (t.lunas / trendMax * 100) + '%' }"
                :title="`Lunas ${rupiah(t.lunas)}`"
              ></div>
            </div>
            <div class="bar-label">{{ t.label }}</div>
            <div class="bar-rate" :style="{ color: rateColor(t.collection_rate) }">
              {{ t.collection_rate }}%
            </div>
          </div>
        </div>
        <div class="legend">
          <span><i class="sw sw-billed"></i> Ditagih</span>
          <span><i class="sw sw-paid"></i> Lunas</span>
        </div>
      </div>

      <!-- Pelanggan -->
      <div class="grid grid-3">
        <div class="card" style="margin: 0">
          <div class="stat-label">Pelanggan baru</div>
          <div class="stat-value">{{ data.pelanggan.baru }}</div>
          <div class="stat-sub">bergabung bulan ini</div>
        </div>
        <div class="card" style="margin: 0">
          <div class="stat-label">Layanan aktif</div>
          <div class="stat-value">{{ data.pelanggan.layanan_aktif }}</div>
          <div class="stat-sub">saat ini</div>
        </div>
        <div class="card" style="margin: 0">
          <div class="stat-label">Terisolir</div>
          <div class="stat-value" :style="data.pelanggan.layanan_isolir ? 'color: var(--warning)' : ''">
            {{ data.pelanggan.layanan_isolir }}
          </div>
          <div class="stat-sub">saat ini</div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* Grafik batang sederhana dengan CSS — tidak perlu library chart untuk
   enam batang, dan bundle-nya tetap kecil untuk dibuka dari HP. */
.chart {
  display: flex;
  gap: 10px;
  align-items: flex-end;
  height: 160px;
  margin: 14px 0 8px;
}
.bar-col { flex: 1; display: flex; flex-direction: column; align-items: center; height: 100%; }
.bars {
  flex: 1;
  width: 100%;
  display: flex;
  gap: 3px;
  align-items: flex-end;
  justify-content: center;
}
.bar { width: 45%; min-height: 2px; border-radius: 3px 3px 0 0; }
.bar-billed { background: var(--border-strong); }
.bar-paid { background: var(--accent); }
.bar-label { font-size: 11px; color: var(--text-muted); margin-top: 6px; white-space: nowrap; }
.bar-rate { font-size: 11px; font-weight: 500; }

.legend { display: flex; gap: 14px; font-size: 12px; color: var(--text-muted); }
.sw { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 4px; }
.sw-billed { background: var(--border-strong); }
.sw-paid { background: var(--accent); }
</style>
