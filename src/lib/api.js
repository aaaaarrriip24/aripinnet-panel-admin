/**
 * Klien API.
 *
 * Satu tempat untuk: base URL, header Authorization, dan penanganan 401.
 * Jangan pernah panggil fetch() langsung dari komponen — kalau token
 * kedaluwarsa, setiap komponen harus tahu cara meresponsnya, dan itu
 * pasti terlewat di salah satu tempat.
 */

const BASE = import.meta.env.VITE_API_BASE || '/api';

let onUnauthorized = null;

/** Dipanggil sekali dari store auth. */
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

function token() {
  return localStorage.getItem('admin_token');
}

async function request(path, { method = 'GET', body, params } = {}) {
  let url = BASE + path;

  if (params) {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
    ).toString();
    if (qs) url += '?' + qs;
  }

  const headers = {};
  const t = token();
  if (t) headers.Authorization = 'Bearer ' + t;
  if (body) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch {
    // Jaringan mati atau server tidak jalan — bedakan dari error dari server
    throw new ApiError('Tidak bisa terhubung ke server', 0);
  }

  if (res.status === 401) {
    onUnauthorized?.();
    throw new ApiError('Sesi berakhir, silakan login ulang', 401);
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiError(data.message || `Gagal (${res.status})`, res.status, data);
  }
  return data;
}

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

export const api = {
  get:   (path, params) => request(path, { params }),
  post:  (path, body)   => request(path, { method: 'POST', body }),
  patch: (path, body)   => request(path, { method: 'PATCH', body }),
  del:   (path)         => request(path, { method: 'DELETE' }),
};

/* ------------------------------------------------------------------ */
/* Format                                                              */
/* ------------------------------------------------------------------ */

export function rupiah(n) {
  return 'Rp' + Number(n || 0).toLocaleString('id-ID');
}

export function tanggal(d, withTime = false) {
  if (!d) return '-';
  const opts = { day: '2-digit', month: 'short', year: 'numeric' };
  if (withTime) Object.assign(opts, { hour: '2-digit', minute: '2-digit' });
  return new Date(d).toLocaleString('id-ID', opts);
}

/** "3 hari lagi" / "terlambat 5 hari" — lebih cepat dibaca daripada tanggal */
export function relatif(d) {
  if (!d) return '';
  const diff = Math.round((new Date(d) - new Date()) / 86400000);
  if (diff === 0) return 'hari ini';
  if (diff > 0) return `${diff} hari lagi`;
  return `terlambat ${Math.abs(diff)} hari`;
}
