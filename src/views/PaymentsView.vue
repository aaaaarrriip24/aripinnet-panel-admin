<script setup>
import { ref, onMounted, watch } from 'vue';
import { api, rupiah, tanggal } from '@/lib/api';

const items = ref([]);
const total = ref(0);
const sum = ref(0);
const page = ref(1);
const limit = 25;
const loading = ref(false);
const error = ref('');

// Default: bulan berjalan. Ini yang paling sering dilihat.
const today = new Date();
const from = ref(new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10));
const to = ref(today.toISOString().slice(0, 10));

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const data = await api.get('/admin/payments', {
      page: page.value, limit, from: from.value, to: to.value,
    });
    items.value = data.items;
    total.value = data.total;
    sum.value = data.sum;
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

watch([page], load);
watch([from, to], () => { page.value = 1; load(); });

const metodeLabel = {
  qris: 'QRIS', va: 'Virtual Account', retail: 'Minimarket',
  ewallet: 'E-wallet', transfer: 'Transfer', cash: 'Tunai',
};

/**
 * Ekspor CSV dibuat di browser, bukan di server.
 * Datanya sudah ada di halaman ini, dan laporan kas RT/RW net tidak
 * pernah sebesar itu. Endpoint ekspor di server jadi tidak perlu.
 */
function exportCsv() {
  const rows = [['Tanggal', 'Nomor tagihan', 'Pelanggan', 'Metode', 'Jumlah']];
  for (const p of items.value) {
    rows.push([
      tanggal(p.settled_at, true),
      p.invoice_id?.number || '',
      p.invoice_id?.customer_id?.name || '',
      metodeLabel[p.method] || p.method,
      p.amount_idr,
    ]);
  }

  const csv = rows
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  // BOM supaya Excel membaca UTF-8 dengan benar
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `kas-${from.value}-sd-${to.value}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1>Kas masuk</h1>
        <p class="muted small">{{ total }} transaksi &middot; total {{ rupiah(sum) }}</p>
      </div>
      <button class="ghost sm" @click="exportCsv" :disabled="!items.length">Unduh CSV</button>
    </div>

    <div v-if="error" class="alert alert-error">{{ error }}</div>

    <div class="card" style="display: flex; gap: 12px; flex-wrap: wrap; align-items: flex-end">
      <div style="flex: 1; min-width: 140px">
        <label for="from">Dari</label>
        <input id="from" v-model="from" type="date">
      </div>
      <div style="flex: 1; min-width: 140px">
        <label for="to">Sampai</label>
        <input id="to" v-model="to" type="date">
      </div>
    </div>

    <div class="card card-tight">
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Waktu</th>
              <th>Pelanggan</th>
              <th>Metode</th>
              <th class="num">Jumlah</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in items" :key="p._id">
              <td class="muted small">{{ tanggal(p.settled_at, true) }}</td>
              <td>
                {{ p.invoice_id?.customer_id?.name || '-' }}
                <div class="muted small">{{ p.invoice_id?.number }}</div>
              </td>
              <td>
                {{ metodeLabel[p.method] || p.method }}
                <div v-if="p.received_by" class="muted small">diterima {{ p.received_by.name }}</div>
                <div v-else-if="p.channel" class="muted small">{{ p.channel }}</div>
              </td>
              <td class="num">{{ rupiah(p.amount_idr) }}</td>
            </tr>

            <tr v-if="!items.length && !loading">
              <td colspan="4" class="empty">Belum ada pembayaran di rentang ini</td>
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

    <p class="muted small">
      CSV berisi transaksi di halaman yang sedang ditampilkan. Untuk rentang panjang,
      perbesar rentang tanggal lalu unduh per halaman.
    </p>
  </div>
</template>
