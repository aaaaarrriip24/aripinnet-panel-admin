<script setup>
import { ref, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { api, rupiah, tanggal, relatif } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';

const route = useRoute();
const auth = useAuthStore();

const items = ref([]);
const total = ref(0);
const sum = ref(0);
const page = ref(1);
const limit = 25;
const status = ref(route.query.status || '');
const overdue = ref(route.query.overdue === 'true');
const loading = ref(false);
const error = ref('');
const notice = ref('');
const busy = ref(null);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const data = await api.get('/admin/invoices', {
      page: page.value,
      limit,
      status: overdue.value ? undefined : status.value,
      overdue: overdue.value ? 'true' : undefined,
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

watch([page, status, overdue], load);
watch([status, overdue], () => { page.value = 1; });

/** Catat pembayaran tunai — dipakai kolektor yang menagih langsung. */
async function bayarTunai(invoice) {
  if (!confirm(`Catat ${rupiah(invoice.total_idr)} tunai untuk ${invoice.customer_id?.name}?`)) return;

  busy.value = invoice._id;
  notice.value = '';
  try {
    await api.post(`/payment/invoices/${invoice._id}/cash`);
    notice.value = `Pembayaran ${invoice.number} tercatat. Kalau layanan terisolir, akan dibuka otomatis.`;
    await load();
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = null;
  }
}

async function batalkan(invoice) {
  if (!confirm(`Batalkan tagihan ${invoice.number}? Nomor tagihan tetap tercatat dan tidak bisa dipakai ulang.`)) return;

  busy.value = invoice._id;
  try {
    await api.post(`/admin/invoices/${invoice._id}/void`);
    notice.value = `Tagihan ${invoice.number} dibatalkan.`;
    await load();
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = null;
  }
}

function badge(s) {
  return { paid: 'badge-ok', unpaid: 'badge-danger', void: 'badge-muted' }[s] || 'badge-muted';
}

onMounted(load);
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1>Tagihan</h1>
        <p class="muted small">{{ total }} tagihan &middot; total {{ rupiah(sum) }}</p>
      </div>
    </div>

    <div v-if="error" class="alert alert-error">{{ error }}</div>
    <div v-if="notice" class="alert alert-ok">{{ notice }}</div>

    <div class="card" style="display: flex; gap: 12px; flex-wrap: wrap; align-items: center">
      <select v-model="status" :disabled="overdue" style="width: auto; min-width: 150px">
        <option value="">Semua status</option>
        <option value="unpaid">Belum lunas</option>
        <option value="paid">Lunas</option>
        <option value="void">Dibatalkan</option>
      </select>

      <label style="display: flex; align-items: center; gap: 7px; margin: 0; font-weight: 400">
        <input type="checkbox" v-model="overdue" style="width: auto">
        Hanya yang lewat jatuh tempo
      </label>
    </div>

    <div class="card card-tight">
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Pelanggan</th>
              <th>Periode</th>
              <th class="num">Jumlah</th>
              <th>Jatuh tempo</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="i in items" :key="i._id">
              <td>
                <RouterLink
                  v-if="i.customer_id"
                  :to="{ name: 'customer-detail', params: { id: i.customer_id._id } }"
                >{{ i.customer_id.name }}</RouterLink>
                <div class="muted small">{{ i.number }}</div>
              </td>
              <td>{{ i.period }}</td>
              <td class="num">
                {{ rupiah(i.total_idr) }}
                <div v-if="i.unique_code" class="muted small">kode {{ i.unique_code }}</div>
              </td>
              <td>
                {{ tanggal(i.due_date) }}
                <div
                  v-if="i.status === 'unpaid'"
                  class="small"
                  :style="new Date(i.due_date) < new Date() ? 'color: var(--danger)' : 'color: var(--text-muted)'"
                >{{ relatif(i.due_date) }}</div>
              </td>
              <td><span class="badge" :class="badge(i.status)">{{ i.status }}</span></td>
              <td>
                <div class="actions" v-if="i.status === 'unpaid'">
                  <button class="ghost sm" :disabled="busy === i._id" @click="bayarTunai(i)">
                    Tunai
                  </button>
                  <button
                    v-if="auth.canVoidInvoice"
                    class="ghost sm"
                    :disabled="busy === i._id"
                    @click="batalkan(i)"
                  >Batalkan</button>
                </div>
              </td>
            </tr>

            <tr v-if="!items.length && !loading">
              <td colspan="6" class="empty">Tidak ada tagihan</td>
            </tr>
            <tr v-if="loading">
              <td colspan="6" class="empty"><span class="spinner"></span> Memuat...</td>
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
  </div>
</template>
