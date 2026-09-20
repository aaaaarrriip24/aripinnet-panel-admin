# Panel Admin — Billing RT/RW Net

Panel operator berbasis Vue 3. Dipakai untuk mengelola pelanggan,
tagihan, paket, dan router.

## Kebutuhan

Backend sudah berjalan. Lihat repo `backend`.

## Menjalankan saat pengembangan

```bash
npm install
npm run dev
```

Berjalan di `http://localhost:5173`. Permintaan `/api` sudah di-proxy ke
`http://localhost:3000` lewat `vite.config.js`, jadi tidak ada urusan
CORS saat pengembangan.

## Build untuk produksi

```bash
cp .env.example .env     # sesuaikan kalau API beda domain
npm run build
```

Hasilnya di `dist/`. Dua cara menyajikannya:

**Dilayani Nginx** (disarankan):

```nginx
location /admin/ {
    alias /var/www/billing-panel/dist/;
    try_files $uri $uri/ /admin/index.html;
}
```

**Dilayani Express**: salin `dist/` ke `backend/admin/dist`, lalu set
`SERVE_ADMIN=true` di `.env` backend.

Base path sudah diset `/admin/` di `vite.config.js`. Kalau ingin
menyajikannya di root domain, ubah `base` dan argumen
`createWebHistory()` di `src/router/index.js` menjadi `/`.

## Halaman

| Halaman | Isi |
|---|---|
| Beranda | Kas hari ini, piutang, status router, peringatan WhatsApp |
| Pelanggan | Daftar, pencarian, tambah pelanggan dan layanan |
| Tagihan | Filter status, catat pembayaran tunai, batalkan tagihan |
| Kas | Riwayat pembayaran per rentang tanggal, ekspor CSV |
| Laporan | Ringkasan bulanan, tingkat penagihan, rincian per router, tren |
| Paket | Kelola paket dan pemetaan PPP profile per MikroTik |
| Router | Daftar router, status, sesi PPPoE aktif |
| Sistem | Kesehatan WhatsApp, riwayat alert, langkah pemulihan |

## Catatan desain

**Tanpa framework CSS.** Isinya tabel dan form; Tailwind atau Vuetify
menambah ukuran build dan ketergantungan yang tidak sebanding.

**Mode gelap otomatis** mengikuti sistem. Panel ini sering dibuka malam
hari dari HP saat ada gangguan jaringan.

**Semua aksi merusak minta konfirmasi.** Isolir memutus internet orang
sungguhan, dan salah ketuk sambil pegang HP di jalan bukan hal mustahil.

**Role hanya menyembunyikan tombol.** Otorisasi sesungguhnya ada di
server (`requireRole` di backend). Jangan mengandalkan pemeriksaan di
sisi klien.

## Struktur

```
src/
  lib/api.js          Klien API, format rupiah/tanggal
  stores/auth.js      Token, login, penanganan 401
  router/index.js     Rute + guard
  style.css           Seluruh gaya, variabel CSS terang/gelap
  App.vue             Navigasi atas
  views/              Satu file per halaman
```

## Lisensi

MIT
