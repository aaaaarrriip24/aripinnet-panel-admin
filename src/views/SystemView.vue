<script setup>
/**
 * Status sistem: kesehatan WhatsApp dan riwayat alert.
 *
 * Halaman ini ada karena satu alasan: matinya jalur WhatsApp tidak
 * menimbulkan gejala yang terlihat. Tagihan tetap terbit, isolir tetap
 * jalan, panel tetap normal — yang hilang hanya pemberitahuan ke
 * pelanggan, dan itu baru ketahuan saat mereka marah.
 */
import { ref, onMounted, onUnmounted } from 'vue';
import { api, tanggal } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();

const wa = ref(null);
const alerts = ref([]);
const loading = ref(true);
const error = ref('');
const notice = ref('');
const busy = ref(null);

let refreshTimer = null;

async function load() {
  error.value = '';
  try {
    const [w, a] = await Promise.all([
      api.get('/admin/system/whatsapp'),
      api.get('/admin/system/alerts', { limit: 25 }),
    ]);
    wa.value = w;
    alerts.value = a.items;
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

async function tesAlert() {
  busy.value = 'test';
  notice.value = '';
  try {
    const r = await api.post('/admin/system/alerts/test');
    notice.value = r.message;
    await load();
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = null;
  }
}

async function resetBanned() {
  if (!confirm('Sudah mengganti nomor dan menghapus folder .wa-session? Reset hanya berguna setelah itu.')) return;

  busy.value = 'reset';
  try {
    const r = await api.post('/admin/system/whatsapp/reset-banned');
    notice.value = r.message;
    await load();
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = null;
  }
}

async function kirimUlangGagal() {
  busy.value = 'retry';
  try {
    const r = await api.post('/admin/system/whatsapp/retry-failed', { hours: 24 });
    notice.value = r.message;
    await load();
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = null;
  }
}

async function periksaSekarang() {
  busy.value = 'check';
  try {
    const r = await api.post('/admin/system/healthcheck');
    notice.value = r.whatsapp.healthy
      ? 'WhatsApp sehat.' + (r.offline_routers.length ? ` Router offline: ${r.offline_routers.join(', ')}` : '')
      : `Masalah: ${r.whatsapp.alerts.join(', ')}`;
    await load();
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = null;
  }
}

const healthStyle = {
  ok:       { cls: 'badge-ok',      text: 'Normal' },
  warning:  { cls: 'badge-warning', text: 'Perlu diperhatikan' },
  critical: { cls: 'badge-danger',  text: 'Bermasalah' },
  unknown:  { cls: 'badge-muted',   text: 'Belum diketahui' },
};

function levelClass(l) {
  return { critical: 'badge-danger', warning: 'badge-warning', info: 'badge-ok' }[l] || 'badge-muted';
}

/**
 * Jadwal muat ulang menyesuaikan keadaan.
 *
 * QR WhatsApp berganti tiap ~20 detik. Dengan interval 30 detik, QR yang
 * tampil di layar hampir selalu sudah mati sebelum sempat dipindai —
 * admin akan mengira sistemnya rusak. Jadi selama QR tampil, muat ulang
 * tiap 5 detik; di luar itu kembali ke 30 detik supaya tidak membebani
 * server tanpa alasan.
 */
function jadwalkan() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(async () => {
    await load();
    jadwalkan();
  }, wa.value?.qr ? 5_000 : 30_000);
}

onMounted(async () => {
  // Halaman ini biasanya dibuka justru saat sedang ada masalah —
  // perbarui sendiri supaya admin tidak menekan refresh terus.
  await load();
  jadwalkan();
});

onUnmounted(() => clearTimeout(refreshTimer));
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1>Sistem</h1>
        <p class="muted small">Kesehatan WhatsApp dan riwayat peringatan</p>
      </div>
      <div class="actions">
        <button class="ghost sm" :disabled="busy === 'check'" @click="periksaSekarang">
          <span v-if="busy === 'check'" class="spinner"></span>
          Periksa sekarang
        </button>
      </div>
    </div>

    <div v-if="error" class="alert alert-error">{{ error }}</div>
    <div v-if="notice" class="alert alert-ok">{{ notice }}</div>

    <div v-if="loading" class="card empty"><span class="spinner"></span> Memuat...</div>

    <template v-else-if="wa">
      <!-- Status WhatsApp -->
      <div class="card">
        <div class="row-head">
          <div>
            <h2 style="margin: 0">WhatsApp</h2>
            <p class="muted small" style="margin: 2px 0 0">
              Jalur notifikasi tagihan, pengingat, isolir, dan kode login pelanggan.
            </p>
          </div>
          <span class="badge" :class="healthStyle[wa.health].cls">
            {{ healthStyle[wa.health].text }}
          </span>
        </div>

        <div v-if="wa.reason" class="alert" :class="wa.health === 'critical' ? 'alert-error' : 'alert-warning'" style="margin-top: 12px">
          {{ wa.reason }}
        </div>

        <!-- QR pairing. Hanya muncul saat worker sedang menunggu dipindai;
             hilang sendiri begitu tersambung. -->
        <div v-if="wa.qr" class="qr-box">
          <img :src="wa.qr.png" alt="QR pairing WhatsApp" width="260" height="260" />
          <div class="qr-help">
            <h3>Tautkan nomor WhatsApp</h3>
            <ol>
              <li>Buka WhatsApp di HP nomor billing</li>
              <li>Setelan → <strong>Perangkat tertaut</strong> → Tautkan perangkat</li>
              <li>Pindai kode di samping</li>
            </ol>
            <p class="muted small">
              Kode berganti tiap ±20 detik dan halaman ini memperbaruinya
              sendiri. Kalau gagal, tunggu kode berikutnya muncul.
            </p>
            <p class="warn small">
              Gunakan nomor khusus, bukan nomor pribadi. Nomor yang memindai
              inilah yang mengirim seluruh notifikasi dan kode login
              pelanggan — kalau diblokir WhatsApp, pelanggan tidak bisa masuk
              ke aplikasi sama sekali.
            </p>
          </div>
        </div>

        <!-- Instruksi pemulihan langsung di tempat masalahnya terlihat.
             Saat nomor kena banned, yang dibutuhkan bukan diagnosis lagi
             tapi langkah konkret. -->
        <div v-if="wa.status?.banned" class="recovery">
          <h3>Langkah pemulihan</h3>
          <ol>
            <li>Siapkan nomor WhatsApp baru — jangan nomor pribadi.</li>
            <li>Di server: <code>pm2 stop billing-wa</code></li>
            <li>Hapus folder session: <code>rm -rf .wa-session</code></li>
            <li>Tekan tombol "Reset status" di bawah.</li>
            <li><code>pm2 restart billing-wa</code> lalu scan QR dari <code>pm2 logs billing-wa</code></li>
            <li>Perbarui <code>CS_PHONE</code> di <code>.env</code> kalau nomornya berubah.</li>
          </ol>
          <button
            v-if="auth.canVoidInvoice"
            class="sm"
            :disabled="busy === 'reset'"
            @click="resetBanned"
          >Reset status</button>
        </div>

        <div class="info-grid">
          <div>
            <div class="stat-label">Tersambung</div>
            <div>{{ wa.status?.connected ? 'Ya' : 'Tidak' }}</div>
          </div>
          <div>
            <div class="stat-label">Nomor</div>
            <div class="small">{{ wa.status?.jid?.split(':')[0] || '-' }}</div>
          </div>
          <div>
            <div class="stat-label">Kabar terakhir worker</div>
            <div class="small">
              {{ wa.heartbeat_age_min == null ? '-' : `${wa.heartbeat_age_min} menit lalu` }}
            </div>
          </div>
          <div>
            <div class="stat-label">Terkirim 1 jam</div>
            <div>{{ wa.antrian.sent_1h }}</div>
          </div>
          <div>
            <div class="stat-label">Gagal 1 jam</div>
            <div :style="wa.antrian.failed_1h ? 'color: var(--danger)' : ''">
              {{ wa.antrian.failed_1h }}
            </div>
          </div>
          <div>
            <div class="stat-label">Mengantre</div>
            <div>{{ wa.antrian.queued }}</div>
          </div>
        </div>

        <div v-if="wa.status?.last_error" class="muted small" style="margin-top: 10px; word-break: break-word">
          Error terakhir: {{ wa.status.last_error }}
        </div>

        <div class="actions" style="margin-top: 14px" v-if="auth.canVoidInvoice">
          <button
            class="ghost sm"
            :disabled="busy === 'retry' || !wa.antrian.failed_1h"
            @click="kirimUlangGagal"
          >Kirim ulang yang gagal (24 jam)</button>
        </div>
      </div>

      <!-- Kanal alert -->
      <div class="card">
        <div class="row-head">
          <div>
            <h2 style="margin: 0">Kanal peringatan</h2>
            <p class="muted small" style="margin: 2px 0 0">
              Alert sengaja tidak lewat WhatsApp — yang paling sering perlu
              dilaporkan justru matinya WhatsApp itu sendiri.
            </p>
          </div>
          <button
            v-if="auth.canVoidInvoice"
            class="ghost sm"
            :disabled="busy === 'test'"
            @click="tesAlert"
          >
            <span v-if="busy === 'test'" class="spinner"></span>
            Kirim pesan uji
          </button>
        </div>

        <div v-if="!wa.alert_channels.any" class="alert alert-warning" style="margin-top: 12px">
          <strong>Belum ada kanal peringatan aktif.</strong>
          Masalah hanya tercatat di log server dan tidak akan sampai ke Anda.
          Isi <code>TELEGRAM_BOT_TOKEN</code> dan <code>TELEGRAM_CHAT_ID</code>
          di <code>.env</code>, lalu restart API server.
        </div>

        <div v-else class="channels">
          <span class="badge" :class="wa.alert_channels.telegram ? 'badge-ok' : 'badge-muted'">
            Telegram {{ wa.alert_channels.telegram ? 'aktif' : 'nonaktif' }}
          </span>
          <span class="badge" :class="wa.alert_channels.webhook ? 'badge-ok' : 'badge-muted'">
            Webhook {{ wa.alert_channels.webhook ? 'aktif' : 'nonaktif' }}
          </span>
        </div>
      </div>

      <!-- Riwayat alert -->
      <div class="card card-tight">
        <div style="padding: 14px 16px 0"><h2>Riwayat peringatan</h2></div>
        <div class="table-scroll">
          <table>
            <thead>
              <tr><th>Waktu</th><th>Jenis</th><th>Pesan</th><th>Terkirim</th></tr>
            </thead>
            <tbody>
              <tr v-for="a in alerts" :key="a._id">
                <td class="muted small" style="white-space: nowrap">{{ tanggal(a.createdAt, true) }}</td>
                <td>
                  <span class="badge" :class="levelClass(a.level)">{{ a.level }}</span>
                  <div class="muted small">{{ a.key }}</div>
                </td>
                <td class="small" style="white-space: pre-line">{{ a.message.split('\n')[0] }}</td>
                <td class="muted small">{{ a.channels.join(', ') || 'log saja' }}</td>
              </tr>
              <tr v-if="!alerts.length">
                <td colspan="4" class="empty">Belum ada peringatan. Itu kabar baik.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.row-head {
  display: flex; justify-content: space-between; gap: 12px;
  flex-wrap: wrap; align-items: flex-start;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 12px;
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--border);
}

.recovery {
  background: var(--danger-bg);
  border-radius: var(--radius);
  padding: 14px 16px;
  margin-top: 12px;
}
.recovery h3 { margin: 0 0 8px; }
.recovery ol { margin: 0 0 12px; padding-left: 18px; font-size: 13px; line-height: 1.9; }

.channels { display: flex; gap: 8px; margin-top: 12px; }

.qr-box {
  display: flex;
  gap: 20px;
  align-items: flex-start;
  flex-wrap: wrap;
  margin-top: 14px;
  padding: 16px;
  background: var(--surface-2);
  border-radius: var(--radius);
}
/* Latar putih tetap dipertahankan di mode gelap — pemindai QR membaca
   kontras gelap-di-atas-terang, dan membalik warnanya membuat sebagian
   HP gagal mengenali kode. */
.qr-box img {
  background: #fff;
  padding: 8px;
  border-radius: 8px;
  flex-shrink: 0;
}
.qr-help { flex: 1; min-width: 240px; }
.qr-help h3 { margin: 0 0 8px; }
.qr-help ol { margin: 0 0 10px; padding-left: 18px; font-size: 13px; line-height: 1.9; }
.qr-help p { margin: 6px 0 0; }
.warn { color: var(--danger); }

code {
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
  font-size: .9em;
  background: var(--surface-2);
  padding: 1px 5px;
  border-radius: 4px;
}
</style>
