/* ═══════════════════════════════════════════════════
   PensiunID – Simulasi Pensiunan Babada Corp
   app.js  |  Developed by Ronald Smith
   PP No. 45/2015 (JHT) & PP No. 46/2015 (JP)
   ═══════════════════════════════════════════════════ */
'use strict';

// ── KONSTANTA ───────────────────────────────────────
const CFG = {
  USIA_PENSIUN_NORMAL:  57,
  USIA_DIPERCEPAT_MIN:  46,
  MK_DIPERCEPAT_MIN:    10,
  MK_CACAT_MIN:          1,
  FAKTOR_JP:          0.01,
  JP_MIN:           300000,
  BATAS_GAJI_JP:   9559600,
  FAKTOR_ANUITAS:       15,
  JHT_PEMBERI:       0.037,
  JHT_KARYAUSAHAWAN: 0.020,
  BUNGA_JHT: { konservatif: 0.03, moderat: 0.06, optimis: 0.12 },
  REDUKSI_DIPERCEPAT: 0.040,
  JAMINAN_CACAT_BULAN:  25,
  PCT_AHLI_WARIS:      0.50,
};

// ── STATE ───────────────────────────────────────────
let karyausahawanList = [];
let aktiveSkenarioJHT = 'konservatif';
let hasilAktif = null;
let dbConfig = JSON.parse(localStorage.getItem('babadacorp_dbconfig') || 'null');
let dbMode = 'lokal'; // 'lokal' | 'supabase' | 'api'

// ══════════════════════════════════════════════════
// DATABASE LAYER
// ══════════════════════════════════════════════════

async function initDB() {
  setDbStatus('connecting', 'Menghubungkan ke database...');
  if (!dbConfig || dbConfig.mode === 'lokal') {
    dbMode = 'lokal';
    karyausahawanList = JSON.parse(localStorage.getItem('babadacorp_data') || '[]');
    setDbStatus('lokal', 'Mode Lokal', 'Data tersimpan di browser ini');
    renderTable(); updateStats();
    return;
  }
  dbMode = dbConfig.mode;
  try {
    const data = await dbFetch();
    karyausahawanList = data;
    setDbStatus('connected', 'Terhubung · ' + dbConfig.mode.toUpperCase(), dbConfig.url || '');
    renderTable(); updateStats();
  } catch(e) {
    console.warn('DB error, fallback lokal:', e);
    dbMode = 'lokal';
    karyausahawanList = JSON.parse(localStorage.getItem('babadacorp_data') || '[]');
    setDbStatus('disconnected', 'Gagal terhubung — Mode Lokal', e.message);
    renderTable(); updateStats();
  }
}

async function dbFetch() {
  if (dbMode === 'supabase') {
    const res = await fetch(`${dbConfig.url}/rest/v1/karyausahawan?select=*&order=id`, {
      headers: { apikey: dbConfig.key, Authorization: 'Bearer ' + dbConfig.key, 'Content-Type': 'application/json' }
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  }
  if (dbMode === 'api') {
    const headers = { 'Content-Type': 'application/json' };
    if (dbConfig.token) headers['Authorization'] = dbConfig.token;
    const res = await fetch(dbConfig.url, { headers });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const j = await res.json();
    return Array.isArray(j) ? j : (j.data || []);
  }
  return JSON.parse(localStorage.getItem('babadacorp_data') || '[]');
}

async function dbSave(k) {
  if (dbMode === 'supabase') {
    const res = await fetch(`${dbConfig.url}/rest/v1/karyausahawan`, {
      method: 'POST',
      headers: { apikey: dbConfig.key, Authorization: 'Bearer ' + dbConfig.key,
        'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify(k)
    });
    if (!res.ok) throw new Error('Simpan gagal: HTTP ' + res.status);
    const saved = await res.json();
    return Array.isArray(saved) ? saved[0] : saved;
  }
  if (dbMode === 'api') {
    const headers = { 'Content-Type': 'application/json' };
    if (dbConfig.token) headers['Authorization'] = dbConfig.token;
    const res = await fetch(dbConfig.url, { method: 'POST', headers, body: JSON.stringify(k) });
    if (!res.ok) throw new Error('Simpan gagal: HTTP ' + res.status);
    return k;
  }
  // lokal
  const list = JSON.parse(localStorage.getItem('babadacorp_data') || '[]');
  list.push(k);
  localStorage.setItem('babadacorp_data', JSON.stringify(list));
  return k;
}

async function dbDelete(id) {
  if (dbMode === 'supabase') {
    await fetch(`${dbConfig.url}/rest/v1/karyausahawan?id=eq.${id}`, {
      method: 'DELETE',
      headers: { apikey: dbConfig.key, Authorization: 'Bearer ' + dbConfig.key }
    });
    return;
  }
  if (dbMode === 'api') {
    const headers = {};
    if (dbConfig.token) headers['Authorization'] = dbConfig.token;
    await fetch(`${dbConfig.url}/${id}`, { method: 'DELETE', headers });
    return;
  }
  const list = JSON.parse(localStorage.getItem('babadacorp_data') || '[]');
  localStorage.setItem('babadacorp_data', JSON.stringify(list.filter(x => x.id !== id)));
}

function setDbStatus(type, label, detail = '') {
  const dot = document.getElementById('dbDot');
  dot.className = 'db-dot';
  if (type === 'connected')    { dot.classList.add('connected');    }
  else if (type === 'lokal')   { dot.classList.add('connected');    }
  else if (type === 'disconnected') { dot.classList.add('disconnected'); }
  else                         { dot.classList.add('connecting');   }
  document.getElementById('dbLabel').textContent  = label;
  document.getElementById('dbDetail').textContent = detail;
}

// ── DB CONFIG MODAL ─────────────────────────────────
function bukaConfigDB() { document.getElementById('dbConfigOverlay').classList.add('open'); }
function tutupConfigDB() { document.getElementById('dbConfigOverlay').classList.remove('open'); }

function gantiDbTab(tab, el) {
  document.querySelectorAll('.db-tab').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  ['supabase','api','lokal'].forEach(t => {
    const p = document.getElementById('dbPane-' + t);
    if (p) p.style.display = t === tab ? 'block' : 'none';
  });
}

async function simpanConfigDB(mode) {
  const result = document.getElementById('dbTestResult');
  result.innerHTML = '<span style="color:var(--ink-muted)">⏳ Menguji koneksi...</span>';

  let cfg = { mode };
  if (mode === 'supabase') {
    cfg.url = document.getElementById('dbSupabaseUrl').value.trim().replace(/\/$/, '');
    cfg.key = document.getElementById('dbSupabaseKey').value.trim();
    if (!cfg.url || !cfg.key) { result.innerHTML = '<span class="err">⚠ URL dan Key wajib diisi.</span>'; return; }
    try {
      const res = await fetch(`${cfg.url}/rest/v1/karyausahawan?select=id&limit=1`, {
        headers: { apikey: cfg.key, Authorization: 'Bearer ' + cfg.key }
      });
      if (!res.ok) throw new Error('HTTP ' + res.status + ' — pastikan tabel karyausahawan sudah dibuat.');
      result.innerHTML = '<span class="ok">✅ Koneksi berhasil! Menyimpan konfigurasi...</span>';
    } catch(e) {
      result.innerHTML = `<span class="err">❌ ${e.message}</span>`; return;
    }
  } else if (mode === 'api') {
    cfg.url   = document.getElementById('dbApiUrl').value.trim();
    cfg.token = document.getElementById('dbApiToken').value.trim();
    if (!cfg.url) { result.innerHTML = '<span class="err">⚠ URL endpoint wajib diisi.</span>'; return; }
    try {
      const headers = {};
      if (cfg.token) headers['Authorization'] = cfg.token;
      const res = await fetch(cfg.url, { headers });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      result.innerHTML = '<span class="ok">✅ Koneksi berhasil!</span>';
    } catch(e) {
      result.innerHTML = `<span class="err">❌ ${e.message}</span>`; return;
    }
  } else {
    result.innerHTML = '<span class="ok">✅ Mode lokal dipilih.</span>';
  }

  dbConfig = cfg;
  localStorage.setItem('babadacorp_dbconfig', JSON.stringify(cfg));
  setTimeout(() => { tutupConfigDB(); initDB(); }, 900);
}

// ══════════════════════════════════════════════════
// KALKULASI
// ══════════════════════════════════════════════════

function hitungSelisihTahun(a, b) {
  const da = new Date(a), db = new Date(b);
  let y = db.getFullYear() - da.getFullYear();
  const md = db.getMonth() - da.getMonth();
  if (md < 0 || (md === 0 && db.getDate() < da.getDate())) y--;
  return Math.max(0, y);
}

function formatRp(n) {
  if (n == null || isNaN(n)) return '—';
  return 'Rp ' + Math.round(n).toLocaleString('id-ID');
}

function parseGaji(s) { return parseInt(String(s).replace(/\D/g,''), 10) || 0; }

function showToast(msg, ms = 2800) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), ms);
}

function fvJHT(iuran, mk, r) {
  if (!mk || !iuran) return 0;
  const rm = r / 12, n = mk * 12;
  return iuran * ((Math.pow(1 + rm, n) - 1) / rm);
}

function hitungPensiun(k) {
  const ref = k.tglBerhenti || new Date().toISOString().split('T')[0];
  const usia = hitungSelisihTahun(k.tglLahir, ref);
  const mk   = hitungSelisihTahun(k.tglMasuk, ref);
  const gaji = k.gajiPokok;

  let status;
  if      (usia >= CFG.USIA_PENSIUN_NORMAL + 3)                            status = 'terlambat';
  else if (usia >= CFG.USIA_PENSIUN_NORMAL)                                 status = 'normal';
  else if (usia >= CFG.USIA_DIPERCEPAT_MIN && mk >= CFG.MK_DIPERCEPAT_MIN) status = 'dipercepat';
  else                                                                       status = 'belum';

  const sisaTahun   = Math.max(0, CFG.USIA_PENSIUN_NORMAL - usia);
  const gajiDasarJP = Math.min(gaji, CFG.BATAS_GAJI_JP);
  const jpNormal    = Math.max(CFG.FAKTOR_JP * mk * gajiDasarJP, CFG.JP_MIN);
  let jpDipercepat  = 0;
  if (status === 'dipercepat') {
    const lebihAwal = CFG.USIA_PENSIUN_NORMAL - usia;
    jpDipercepat = Math.max(jpNormal * (1 - Math.min(CFG.REDUKSI_DIPERCEPAT * lebihAwal, 0.5)), CFG.JP_MIN);
  }
  const jpBulanan = status === 'dipercepat' ? jpDipercepat : jpNormal;
  const jpLumpSum = jpBulanan * 12 * CFG.FAKTOR_ANUITAS;
  const iuranJHT  = (CFG.JHT_PEMBERI + CFG.JHT_KARYAUSAHAWAN) * gaji;
  const saldoJHT  = {
    konservatif: fvJHT(iuranJHT, mk, CFG.BUNGA_JHT.konservatif),
    moderat:     fvJHT(iuranJHT, mk, CFG.BUNGA_JHT.moderat),
    optimis:     fvJHT(iuranJHT, mk, CFG.BUNGA_JHT.optimis),
  };
  return {
    usia, mk, gaji, gajiDasarJP, status, sisaTahun,
    jpNormal, jpDipercepat, jpBulanan, jpLumpSum,
    iuranJHT, saldoJHT,
    totalLumpSum: jpLumpSum + saldoJHT.moderat,
    manfaatCacat:     mk >= CFG.MK_CACAT_MIN ? Math.max(jpNormal, CFG.JAMINAN_CACAT_BULAN * gaji / 12) : 0,
    manfaatAhliWaris: mk >= CFG.MK_CACAT_MIN ? jpBulanan * CFG.PCT_AHLI_WARIS : 0,
  };
}

// ══════════════════════════════════════════════════
// SKENARIO JHT INTERAKTIF
// ══════════════════════════════════════════════════

function pilihSkenarioJHT(skenario) {
  aktiveSkenarioJHT = skenario;
  ['konservatif','moderat','optimis'].forEach(s => {
    document.getElementById('tab-' + s).classList.toggle('active', s === skenario);
    const p = document.getElementById('panel-' + s);
    if (p) p.style.display = s === skenario ? 'block' : 'none';
  });
  document.querySelectorAll('.jht-mini-card').forEach(el => el.classList.remove('active'));
  const mc = document.querySelector('.jht-mini-' + skenario);
  if (mc) mc.classList.add('active');
  if (hasilAktif) isiPanelJHT(hasilAktif);
}

// ══════════════════════════════════════════════════
// HITUNG JP PER SKENARIO BUNGA
// ══════════════════════════════════════════════════
// Logika:
// JP Bulanan BPJS = 1% × MK × Gaji (tetap, tidak tergantung bunga)
// TAPI bunga mempengaruhi:
//   - JP Lump Sum = JP_Bulanan × faktorAnutias(r)
//   - Faktor anuitas bergantung discount rate r:
//       a(r,n) = [1 - (1+r/12)^(-n)] / (r/12)   jika r > 0
//       a(0,n) = n                                 jika r = 0
// Semakin tinggi r, faktor anuitas LEBIH KECIL → Lump Sum lebih kecil
// (uang masa depan didiskon lebih agresif)
// Dan: jika dipilih anuitas, JP Bulanan = nilai yang diterima tetap
// Namun NILAI RIIL berbeda karena daya beli berubah sesuai skenario inflasi/bunga

function hitungFaktorAnuitas(r, nTahun) {
  // r = bunga tahunan, nTahun = durasi (default 15 tahun sesuai regulasi BPJS)
  const n = nTahun * 12; // konversi ke bulan
  const rm = r / 12;
  if (rm === 0) return n;
  return (1 - Math.pow(1 + rm, -n)) / rm;
}

function hitungJPperSkenario(h, bunga) {
  // ── KONSEP INTI ──────────────────────────────────────────────────────
  // Dana yang tersedia (Lump Sum Referensi) = JP Bulanan × 180 bulan (flat)
  // Dengan tingkat bunga/diskonto berbeda, dana yg sama menghasilkan:
  //   • JP Bulanan LEBIH TINGGI jika bunga rendah (3%) — uang masa depan
  //     bernilai lebih rendah, sehingga tiap cicilan bisa lebih besar
  //   • JP Bulanan LEBIH RENDAH jika bunga tinggi (12%) — uang masa depan
  //     bernilai lebih tinggi, sehingga cicilan bulanan lebih kecil
  //
  // Rumus:
  //   LumpSum Referensi = jpBulananDasar × 180          (base, PP 46/2015)
  //   Faktor anuitas (r,15th) = [1−(1+r/12)^−180] / (r/12)
  //   JP Bulanan skenario    = LumpSum Referensi / faktor(r)
  //   JP Lump Sum skenario   = JP Bulanan skenario × faktor(r)  = LumpSum Ref
  //     (Lump Sum nilainya sama karena Dana sama; yang berubah hanya JP bulanan)
  // ─────────────────────────────────────────────────────────────────────

  // Dana referensi = JP bulanan PP × 180 bulan (base flat, tidak bergantung bunga)
  const jpBulananDasar  = h.jpBulanan;          // JP dasar PP 46/2015
  const lumpSumRef      = jpBulananDasar * 180; // dana referensi flat (base)

  // Faktor anuitas dengan discount rate = bunga skenario
  const faktor = hitungFaktorAnuitas(bunga, CFG.FAKTOR_ANUITAS); // 15 th

  // JP Bulanan skenario = dana yang sama dibagi faktor anuitas bunga ini
  // Bunga rendah (3%)  → faktor besar → JP bulanan lebih KECIL dari referensi
  // Bunga tinggi (12%) → faktor kecil → JP bulanan lebih BESAR dari referensi
  const jpBulananSkenario = lumpSumRef / faktor;

  // Lump Sum skenario = JP bulanan skenario × faktor = selalu = lumpSumRef
  // Tapi tampilkan tetap untuk konsistensi:
  const jpLumpSumSkenario = jpBulananSkenario * faktor; // ≈ lumpSumRef

  // Durasi & proyeksi total diterima
  const durasiEst         = (75 - CFG.USIA_PENSIUN_NORMAL) * 12; // est. 216 bln
  const totalDiterimaEst  = jpBulananSkenario * durasiEst;
  const ahliWaris         = jpBulananSkenario * CFG.PCT_AHLI_WARIS;

  return {
    jpBulananDasar,       // JP dasar PP 46/2015 (referensi)
    jpBulananSkenario,    // JP bulanan yg BERUBAH sesuai bunga → ini yang ditampilkan
    jpLumpSumSkenario,    // Lump Sum skenario ini
    lumpSumRef,           // Dana referensi flat (180 bln)
    faktor,
    totalDiterimaEst,
    ahliWaris,
    durasiEst,
  };
}

function hitungPensiunLengkap(k) {
  const h = hitungPensiun(k);
  // Hitung JP per skenario bunga
  h.jpSkenario = {
    konservatif: hitungJPperSkenario(h, CFG.BUNGA_JHT.konservatif),
    moderat:     hitungJPperSkenario(h, CFG.BUNGA_JHT.moderat),
    optimis:     hitungJPperSkenario(h, CFG.BUNGA_JHT.optimis),
  };
  return h;
}

function isiPanelJHT(h) {
  hasilAktif = h;
  const n = h.mk * 12;

  // Tanggal mulai bayar JP = saat pensiun (tglLahir + usia pensiun)
  const karyawan = karyausahawanList.find(x => x.gajiPokok === h.gaji) || {};
  const tglLahir = karyawan.tglLahir || null;

  // Hitung tanggal pensiun
  let tglPensiun = null, tglAkhirJP = null;
  if (tglLahir) {
    const lahir = new Date(tglLahir);
    tglPensiun = new Date(lahir);
    tglPensiun.setFullYear(tglPensiun.getFullYear() + CFG.USIA_PENSIUN_NORMAL);
    // Estimasi akhir JP: usia harapan hidup 75 tahun (regulasi = seumur hidup, estimasi 75)
    tglAkhirJP = new Date(lahir);
    tglAkhirJP.setFullYear(tglAkhirJP.getFullYear() + 75);
  }

  const fmt = (d) => d ? d.toLocaleDateString('id-ID',{day:'2-digit',month:'long',year:'numeric'}) : '—';
  const fmtBln = (d) => d ? d.toLocaleDateString('id-ID',{month:'long',year:'numeric'}) : '—';

  const mulaiStr   = tglPensiun ? fmtBln(tglPensiun) : '— (isi tgl lahir)';
  const akhirStr   = '🔁 Seumur hidup (s/d meninggal)';
  const durasiStr  = tglPensiun && tglAkhirJP
    ? `Est. ${75 - CFG.USIA_PENSIUN_NORMAL} tahun (usia 57–75), est. ${(75-CFG.USIA_PENSIUN_NORMAL)*12} bulan`
    : `Est. 18 tahun (usia 57–75, asumsi harapan hidup 75 th)`;
  const ahliWarisStr = formatRp(h.jpBulanan * 0.5) + '/bln (janda/duda seumur hidup, anak s/d 23 th)';
  const totalTerimaStr = tglPensiun
    ? formatRp(h.jpBulanan * (75 - CFG.USIA_PENSIUN_NORMAL) * 12) + ` (est. ${75-CFG.USIA_PENSIUN_NORMAL} th)`
    : formatRp(h.jpBulanan * 18 * 12) + ' (est. 18 th)';

  const syaratStr = h.mk >= CFG.MK_DIPERCEPAT_MIN
    ? `✅ Memenuhi syarat (MK ${h.mk} th ≥ 10 th)`
    : `⚠️ MK ${h.mk} th — perlu ${CFG.MK_DIPERCEPAT_MIN} th untuk klaim penuh`;

  const rekomendasi = (skenario, jpBul, jpLS, saldo, bunga) => {
    const total = jpLS + saldo;
    const pctBunga = (bunga * 100).toFixed(0);
    const items = [];
    // Status
    if (h.status === 'terlambat') {
      items.push({icon:'⚠️', text:`<strong>Sudah melewati usia pensiun normal (${h.usia} th).</strong> Ajukan klaim segera ke BPJS Ketenagakerjaan. Manfaat tetap penuh + masa kerja tambahan sudah terhitung.`});
    } else if (h.status === 'normal') {
      items.push({icon:'✅', text:`<strong>Tepat di usia pensiun normal (57 th).</strong> Segera ajukan klaim JP dan JHT ke kantor BPJS TK terdekat dengan membawa KTP, KK, buku tabungan, dan kartu peserta BPJS.`});
    } else if (h.status === 'dipercepat') {
      items.push({icon:'⚡', text:`<strong>Bisa ajukan pensiun dipercepat (usia ${h.usia} th).</strong> Manfaat terkena reduksi ${(CFG.REDUKSI_DIPERCEPAT * (CFG.USIA_PENSIUN_NORMAL - h.usia) * 100).toFixed(0)}%. Pertimbangkan apakah lebih baik menunggu usia 57.`});
    } else {
      items.push({icon:'🔵', text:`<strong>Belum memenuhi syarat pensiun.</strong> Lanjutkan iuran BPJS TK. Saldo JHT terus bertumbuh dengan bunga ${pctBunga}%/tahun.`});
    }
    // Pilihan bayar
    items.push({icon:'💡', text:`<strong>Pilih JP Anuitas</strong> jika ingin penghasilan rutin ${formatRp(jpBul)}/bulan seumur hidup — cocok jika tidak punya sumber pendapatan lain.`});
    items.push({icon:'💰', text:`<strong>Pilih JP Lump Sum</strong> (${formatRp(jpLS)}) dengan bunga ${(bunga*100).toFixed(0)}% — faktor anuitas lebih ${bunga>0.06?"kecil":"besar"}, nilai tunai lebih ${bunga>0.06?"rendah":"tinggi"}. Cocok untuk usaha atau investasi.`});
    // JHT
    items.push({icon:'🏦', text:`<strong>JHT (skenario ${pctBunga}%) = ${formatRp(saldo)}.</strong> JHT selalu cair sekaligus (Lump Sum), tidak ada opsi anuitas. Cairkan bersamaan atau setelah klaim JP.`});
    items.push({icon:'📋', text:`<strong>Dokumen Klaim BPJS TK:</strong> Kartu peserta BPJS TK, KTP, KK, buku tabungan aktif, surat keterangan pensiun dari HRD, dan formulir F5. Proses ±14 hari kerja.`});
    items.push({icon:'📌', text:`<strong>Total manfaat (${skenario}) = ${formatRp(jpLS + saldo)}.</strong> JP Lump Sum ${formatRp(jpLS)} + JHT ${formatRp(saldo)}. Semakin tinggi bunga, faktor anuitas lebih kecil namun JHT lebih besar.`});
    return items;
  };

  const fillPanel = (pfx, bunga, saldo) => {
    const pct = (bunga * 100).toFixed(0);
    const g   = (id) => document.getElementById(pfx + id);
    if (!g('-iuran')) return;

    const skenNama = pfx==='k' ? 'konservatif' : pfx==='m' ? 'moderat' : 'optimis';
    const jp = (h.jpSkenario && h.jpSkenario[skenNama]) || hitungJPperSkenario(h, bunga);

    // ── JP Bulanan: BERUBAH per skenario bunga ──────────
    // Semakin RENDAH bunga → faktor anuitas besar → JP bulanan lebih kecil
    // Semakin TINGGI bunga → faktor anuitas kecil → JP bulanan lebih besar
    const jpBulTampil = jp.jpBulananSkenario;
    const selisihVsBase = jpBulTampil - jp.jpBulananDasar;
    const selisihTxt = selisihVsBase > 0
      ? `▲ ${formatRp(selisihVsBase)} lebih tinggi dari dasar PP (${formatRp(jp.jpBulananDasar)})`
      : selisihVsBase < 0
      ? `▼ ${formatRp(Math.abs(selisihVsBase))} lebih rendah dari dasar PP (${formatRp(jp.jpBulananDasar)})`
      : `= Sama dengan dasar PP (bunga moderat)`;

    g('-jp-bulanan').textContent      = formatRp(jpBulTampil);
    g('-jp-mulai').textContent        = mulaiStr;
    g('-jp-akhir').textContent        = akhirStr;
    g('-jp-durasi').textContent       = `Est. ${75-CFG.USIA_PENSIUN_NORMAL} th (usia 57–75) · ${selisihTxt}`;
    g('-jp-ahliwaris').textContent    = formatRp(jp.ahliWaris) + '/bln (janda/duda seumur hidup, anak s/d 23 th)';
    g('-jp-total-terima').textContent = formatRp(jp.totalDiterimaEst) + ` (est. ${75-CFG.USIA_PENSIUN_NORMAL} th × 12)`;

    // ── JP Lump Sum ─────────────────────────────────────
    // = Dana Referensi (selalu sama), tapi JP bulanan yg berubah
    g('-jp-lumpsum').textContent       = formatRp(jp.jpLumpSumSkenario);
    g('-jp-ls-rumus').textContent      = `${formatRp(jpBulTampil)}/bln × faktor(${pct}%, 15th) = ${formatRp(jp.jpLumpSumSkenario)}`;
    g('-jp-ls-ekuivalen').textContent  = `Faktor anuitas = ${jp.faktor.toFixed(2)} · Dana ref. ${formatRp(jp.lumpSumRef)}`;
    g('-jp-ls-syarat').textContent     = syaratStr;

    // ── JHT breakdown ───────────────────────────────────
    g('-gaji').textContent     = formatRp(h.gaji);
    g('-iuran-pk').textContent = formatRp(h.gaji * CFG.JHT_PEMBERI);
    g('-iuran-kw').textContent = formatRp(h.gaji * CFG.JHT_KARYAUSAHAWAN);
    g('-iuran').textContent    = formatRp(h.iuranJHT);
    g('-mk').textContent       = `${h.mk} tahun (${n} bulan iuran)`;
    g('-saldo').textContent    = formatRp(saldo);

    // ── Total ────────────────────────────────────────────
    g('-total').textContent         = formatRp(jp.jpLumpSumSkenario + saldo);
    g('-total-anuitas').textContent = `${formatRp(jpBulTampil)}/bln + ${formatRp(saldo)} (JHT cair)`;

    // ── Formula JHT ──────────────────────────────────────
    g('-formula').textContent = `FV = ${formatRp(h.iuranJHT)}/bln × [((1+${pct}%/12)^${n}−1)/(${pct}%/12)] = ${formatRp(saldo)}`;

    // ── Rekomendasi ──────────────────────────────────────
    const items = rekomendasi(skenNama, jpBulTampil, jp.jpLumpSumSkenario, saldo, bunga);
    g('-rekomen').innerHTML = items.map(it =>
      `<div class="rekomen-item"><span class="rekomen-icon">${it.icon}</span><span class="rekomen-text">${it.text}</span></div>`
    ).join('');
  };

  fillPanel('k', CFG.BUNGA_JHT.konservatif, h.saldoJHT.konservatif);
  fillPanel('m', CFG.BUNGA_JHT.moderat,     h.saldoJHT.moderat);
  fillPanel('o', CFG.BUNGA_JHT.optimis,     h.saldoJHT.optimis);

  // Mini summary — tampilkan JP Bulanan skenario
  const jpK2 = h.jpSkenario ? h.jpSkenario.konservatif : hitungJPperSkenario(h, CFG.BUNGA_JHT.konservatif);
  const jpM2 = h.jpSkenario ? h.jpSkenario.moderat     : hitungJPperSkenario(h, CFG.BUNGA_JHT.moderat);
  const jpO2 = h.jpSkenario ? h.jpSkenario.optimis     : hitungJPperSkenario(h, CFG.BUNGA_JHT.optimis);
  document.getElementById('mini-k').innerHTML = `<span style="font-size:.68rem;font-weight:700">${formatRp(jpK2.jpBulananSkenario)}/bln</span><br/><span style="font-size:.65rem;color:var(--ink-muted)">JHT: ${formatRp(h.saldoJHT.konservatif)}</span>`;
  document.getElementById('mini-m').innerHTML = `<span style="font-size:.68rem;font-weight:700">${formatRp(jpM2.jpBulananSkenario)}/bln</span><br/><span style="font-size:.65rem;color:var(--ink-muted)">JHT: ${formatRp(h.saldoJHT.moderat)}</span>`;
  document.getElementById('mini-o').innerHTML = `<span style="font-size:.68rem;font-weight:700">${formatRp(jpO2.jpBulananSkenario)}/bln</span><br/><span style="font-size:.65rem;color:var(--ink-muted)">JHT: ${formatRp(h.saldoJHT.optimis)}</span>`;
  document.getElementById('jhtMiniSummary').style.display = 'flex';
}

// ══════════════════════════════════════════════════
// TAMPIL HASIL
// ══════════════════════════════════════════════════

function tampilHasil(k, h) {
  const panel = document.getElementById('resultPanel');
  panel.style.display = 'block';
  const BADGES = {
    normal:     ['✅ Pensiun Normal',           'badge-normal'],
    terlambat:  ['⚠️ Sudah Lewat Usia Pensiun', 'badge-terlambat'],
    dipercepat: ['⚡ Pensiun Dipercepat',        'badge-dipercepat'],
    belum:      ['🔵 Belum Dapat Pensiun',       'badge-belum'],
  };
  const [bt, bc] = BADGES[h.status];
  const badge = document.getElementById('resultBadge');
  badge.textContent = bt; badge.className = `result-badge ${bc}`;
  document.getElementById('resultNama').textContent = k.nama;

  document.getElementById('resultMeta').innerHTML = `
    <span>NIK: <strong>${k.nik}</strong></span>
    <span>Usia: <strong>${h.usia} tahun</strong></span>
    <span>Masa Kerja: <strong>${h.mk} tahun</strong></span>
    <span>Jabatan: <strong>${k.jabatan||'—'}</strong></span>
    ${h.sisaTahun > 0 ? `<span>Sisa ke pensiun: <strong>${h.sisaTahun} th</strong></span>` : ''}
  `;

  // Ambil nilai per skenario untuk ringkasan (default moderat)
  const jpM = (h.jpSkenario && h.jpSkenario.moderat) || hitungJPperSkenario(h, CFG.BUNGA_JHT.moderat);
  const jpK = (h.jpSkenario && h.jpSkenario.konservatif) || hitungJPperSkenario(h, CFG.BUNGA_JHT.konservatif);
  const jpO = (h.jpSkenario && h.jpSkenario.optimis) || hitungJPperSkenario(h, CFG.BUNGA_JHT.optimis);

  document.getElementById('resultGrid').innerHTML = `
    <div class="result-item"><div class="result-item-label">Gaji Pokok</div><div class="result-item-value">${formatRp(h.gaji)}</div></div>
    <div class="result-item"><div class="result-item-label">Gaji Dasar JP (maks. Rp 9,56 jt)</div><div class="result-item-value">${formatRp(h.gajiDasarJP)}</div></div>

    <div class="result-item" style="grid-column:span 2;background:var(--bg-card);border:1.5px solid var(--border)">
      <div class="result-item-label" style="margin-bottom:.5rem">JP Bulanan &amp; Lump Sum — berubah sesuai skenario bunga 🔁 Klik tab di bawah</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:.5rem">
        <div style="text-align:center;padding:.6rem .5rem;background:#fffde7;border-radius:8px;border:1.5px solid #f9a825">
          <div style="font-size:.68rem;font-weight:700;color:#c05000;text-transform:uppercase;letter-spacing:.05em">3% Konservatif</div>
          <div style="font-size:.92rem;font-weight:700;color:#c05000;margin:.15rem 0">${formatRp(jpK.jpBulananSkenario)}<span style="font-size:.65rem">/bln</span></div>
          <div style="font-size:.7rem;color:#8a6000">LS: ${formatRp(jpK.jpLumpSumSkenario)}</div>
        </div>
        <div style="text-align:center;padding:.6rem .5rem;background:var(--green-lt);border-radius:8px;border:1.5px solid var(--green)">
          <div style="font-size:.68rem;font-weight:700;color:var(--green);text-transform:uppercase;letter-spacing:.05em">6% Moderat ★</div>
          <div style="font-size:.92rem;font-weight:700;color:var(--green);margin:.15rem 0">${formatRp(jpM.jpBulananSkenario)}<span style="font-size:.65rem">/bln</span></div>
          <div style="font-size:.7rem;color:var(--green)">LS: ${formatRp(jpM.jpLumpSumSkenario)}</div>
        </div>
        <div style="text-align:center;padding:.6rem .5rem;background:var(--blue-lt);border-radius:8px;border:1.5px solid var(--blue)">
          <div style="font-size:.68rem;font-weight:700;color:var(--blue);text-transform:uppercase;letter-spacing:.05em">12% Optimis</div>
          <div style="font-size:.92rem;font-weight:700;color:var(--blue);margin:.15rem 0">${formatRp(jpO.jpBulananSkenario)}<span style="font-size:.65rem">/bln</span></div>
          <div style="font-size:.7rem;color:var(--blue)">LS: ${formatRp(jpO.jpLumpSumSkenario)}</div>
        </div>
      </div>
      <div style="font-size:.7rem;color:var(--ink-muted);margin-top:.5rem;padding:.4rem .6rem;background:var(--bg);border-radius:6px">
        💡 <strong>Cara baca:</strong> Bunga tinggi (12%) → faktor anuitas lebih kecil → JP Bulanan lebih besar, tapi dana riil sama. Klik tab skenario di bawah untuk detail lengkap.
      </div>
    </div>

    <div class="result-item"><div class="result-item-label">Iuran JHT / Bulan (5,7%)</div><div class="result-item-value">${formatRp(h.iuranJHT)}</div></div>
    <div class="result-item"><div class="result-item-label">Total Manfaat (JP LS 6% + JHT 6%)</div><div class="result-item-value big">${formatRp(jpM.jpLumpSumSkenario + h.saldoJHT.moderat)}</div></div>
  `;

  pilihSkenarioJHT('konservatif');
  isiPanelJHT(h);

  document.getElementById('resultScenarios').innerHTML = `
    <div style="font-size:.79rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-muted);margin-bottom:.6rem">Semua Skenario Pensiun</div>
    <div class="scenario-row">
      <span class="scenario-icon">✅</span>
      <div class="scenario-info"><div class="scenario-title">Pensiun Normal (usia 57)</div><div class="scenario-desc">1% × ${h.mk} th × ${formatRp(h.gajiDasarJP)}</div></div>
      <span class="scenario-value">${formatRp(h.jpNormal)}/bln</span>
    </div>
    ${h.jpDipercepat > 0 ? `<div class="scenario-row">
      <span class="scenario-icon">⚡</span>
      <div class="scenario-info"><div class="scenario-title">Pensiun Dipercepat (usia ${h.usia})</div><div class="scenario-desc">Reduksi 4% × ${CFG.USIA_PENSIUN_NORMAL - h.usia} tahun lebih awal</div></div>
      <span class="scenario-value">${formatRp(h.jpDipercepat)}/bln</span>
    </div>` : ''}
    <div class="scenario-row">
      <span class="scenario-icon">🦽</span>
      <div class="scenario-info"><div class="scenario-title">Pensiun Cacat Total</div><div class="scenario-desc">${h.mk >= CFG.MK_CACAT_MIN ? 'MAX(JP Normal, 25 bulan upah)' : 'Belum memenuhi syarat'}</div></div>
      <span class="scenario-value">${h.manfaatCacat > 0 ? formatRp(h.manfaatCacat)+'/bln' : '—'}</span>
    </div>
    <div class="scenario-row">
      <span class="scenario-icon">🕊️</span>
      <div class="scenario-info"><div class="scenario-title">Meninggal – Ahli Waris</div><div class="scenario-desc">${h.manfaatAhliWaris > 0 ? '50% dari JP Bulanan' : 'Belum memenuhi syarat'}</div></div>
      <span class="scenario-value">${h.manfaatAhliWaris > 0 ? formatRp(h.manfaatAhliWaris)+'/bln' : '—'}</span>
    </div>
    <div class="scenario-row" style="background:var(--green-lt);border-color:var(--green)">
      <span class="scenario-icon">💰</span>
      <div class="scenario-info"><div class="scenario-title" style="color:var(--green)">Total Manfaat ${k.jenisBayar} (JP + JHT 6%)</div><div class="scenario-desc">JP Lump Sum + Estimasi Saldo JHT Moderat</div></div>
      <span class="scenario-value" style="color:var(--green);font-size:1.15rem">${formatRp(h.totalLumpSum)}</span>
    </div>
  `;
  panel.scrollIntoView({ behavior:'smooth', block:'nearest' });
}

// ══════════════════════════════════════════════════
// CRUD
// ══════════════════════════════════════════════════

async function tambahKaryausahawan() {
  const err = document.getElementById('formError');
  err.textContent = '';

  const nama     = document.getElementById('fNama').value.trim();
  const nik      = document.getElementById('fNIK').value.trim();
  const lahir    = document.getElementById('fLahir').value;
  const masuk    = document.getElementById('fMasuk').value;
  const berhenti = document.getElementById('fBerhenti').value;
  const gaji     = parseGaji(document.getElementById('fGaji').value);
  const jabatan  = document.getElementById('fJabatan').value.trim();
  const divisi   = document.getElementById('fDivisi').value.trim();
  const bpjs     = document.getElementById('fBPJS').value.trim();
  const bayar    = document.getElementById('fBayar').value;

  if (!nama)  { err.textContent = '⚠ Nama wajib diisi.'; return; }
  if (!nik)   { err.textContent = '⚠ NIK wajib diisi.'; return; }
  if (!lahir) { err.textContent = '⚠ Tanggal lahir wajib diisi.'; return; }
  if (!masuk) { err.textContent = '⚠ Tanggal masuk wajib diisi.'; return; }
  if (!gaji || gaji < 1000) { err.textContent = '⚠ Gaji pokok tidak valid.'; return; }
  if (new Date(lahir) >= new Date(masuk)) { err.textContent = '⚠ Tanggal masuk harus setelah lahir.'; return; }
  if (karyausahawanList.find(x => x.nik === nik)) { err.textContent = `⚠ NIK "${nik}" sudah ada.`; return; }

  const k = {
    id: Date.now(), nama, nik,
    tglLahir: lahir, tglMasuk: masuk,
    tglBerhenti: berhenti || null,
    gajiPokok: gaji, jabatan, divisi,
    noBPJS: bpjs, jenisBayar: bayar,
  };

  try {
    await dbSave(k);
    karyausahawanList.push(k);
    updateStats(); renderTable();
    tampilHasil(k, hitungPensiunLengkap(k));
    showToast(`✅ ${nama} berhasil ditambahkan!`);
    resetForm();
  } catch(e) {
    err.textContent = '❌ Gagal menyimpan: ' + e.message;
  }
}

function resetForm() {
  ['fNama','fNIK','fLahir','fMasuk','fBerhenti','fGaji','fJabatan','fDivisi','fBPJS']
    .forEach(id => { document.getElementById(id).value = ''; });
  document.getElementById('fBayar').value = 'Lump Sum';
  document.getElementById('formError').textContent = '';
}

async function hapusKaryausahawan(id) {
  const k = karyausahawanList.find(x => x.id === id);
  if (!k || !confirm(`Hapus data ${k.nama}?`)) return;
  try {
    await dbDelete(id);
    karyausahawanList = karyausahawanList.filter(x => x.id !== id);
    updateStats(); renderTable();
    showToast(`🗑 Data ${k.nama} dihapus.`);
  } catch(e) { showToast('❌ Gagal hapus: ' + e.message); }
}

async function hapusSemua() {
  if (!karyausahawanList.length) { showToast('Tidak ada data.'); return; }
  if (!confirm('Hapus SEMUA data karyausahawan?')) return;
  for (const k of karyausahawanList) { try { await dbDelete(k.id); } catch(e){} }
  karyausahawanList = [];
  updateStats(); renderTable();
  showToast('🗑 Semua data dihapus.');
}

// ══════════════════════════════════════════════════
// MODAL DETAIL
// ══════════════════════════════════════════════════

function lihatDetail(id) {
  const k = karyausahawanList.find(x => x.id === id);
  if (!k) return;
  const h = hitungPensiunLengkap(k);
  const SM = {normal:'✅ Normal',terlambat:'⚠️ Terlambat',dipercepat:'⚡ Dipercepat',belum:'🔵 Belum'};
  document.getElementById('modalContent').innerHTML = `
    <h2 style="font-family:var(--font-serif);font-size:1.5rem;margin-bottom:.2rem">${k.nama}</h2>
    <p style="color:var(--ink-muted);margin-bottom:1.2rem">${k.nik} · ${k.jabatan||'—'} · ${k.divisi||'—'}</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:.6rem;margin-bottom:1.2rem">
      ${ir('Tanggal Lahir', new Date(k.tglLahir).toLocaleDateString('id-ID',{day:'2-digit',month:'long',year:'numeric'}))}
      ${ir('Tanggal Masuk', new Date(k.tglMasuk).toLocaleDateString('id-ID',{day:'2-digit',month:'long',year:'numeric'}))}
      ${ir('Usia', h.usia+' tahun')} ${ir('Masa Kerja', h.mk+' tahun')}
      ${ir('Status', SM[h.status]||'')} ${ir('Pilihan Bayar', k.jenisBayar)}
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:.86rem;margin-bottom:1.2rem">
      <thead><tr style="background:var(--ink);color:#fff"><th style="padding:.55rem .85rem;text-align:left">Komponen JP</th><th style="padding:.55rem .85rem;text-align:right">Nilai</th></tr></thead>
      <tbody>
        ${tr2('Gaji Pokok', formatRp(h.gaji))} ${tr2('Gaji Dasar JP', formatRp(h.gajiDasarJP))}
        ${tr2('JP Bulanan', formatRp(h.jpBulanan), true)} ${tr2('JP Lump Sum', formatRp(h.jpLumpSum), true)}
        ${tr2('Iuran JHT/Bulan', formatRp(h.iuranJHT))}
        ${tr2('Manfaat Cacat', h.manfaatCacat>0?formatRp(h.manfaatCacat)+'/bln':'—')}
        ${tr2('Manfaat Ahli Waris', h.manfaatAhliWaris>0?formatRp(h.manfaatAhliWaris)+'/bln':'—')}
      </tbody>
    </table>
    <div style="font-size:.75rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-muted);margin-bottom:.6rem">Estimasi Saldo JHT – 3 Skenario</div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:.6rem;margin-bottom:1rem">
      <div style="background:#fffde7;border:2px solid #f9a825;border-radius:8px;padding:.85rem;text-align:center">
        <div style="font-size:.7rem;font-weight:700;color:#e65100;text-transform:uppercase">Konservatif</div>
        <div style="font-size:1.25rem;font-weight:900;font-family:var(--font-serif);color:#e65100">3%</div>
        <div style="font-size:.88rem;font-weight:600">${formatRp(h.saldoJHT.konservatif)}</div>
      </div>
      <div style="background:var(--green-lt);border:2px solid var(--green);border-radius:8px;padding:.85rem;text-align:center">
        <div style="font-size:.7rem;font-weight:700;color:var(--green);text-transform:uppercase">Moderat ★</div>
        <div style="font-size:1.25rem;font-weight:900;font-family:var(--font-serif);color:var(--green)">6%</div>
        <div style="font-size:.88rem;font-weight:600">${formatRp(h.saldoJHT.moderat)}</div>
      </div>
      <div style="background:var(--blue-lt);border:2px solid var(--blue);border-radius:8px;padding:.85rem;text-align:center">
        <div style="font-size:.7rem;font-weight:700;color:var(--blue);text-transform:uppercase">Optimis</div>
        <div style="font-size:1.25rem;font-weight:900;font-family:var(--font-serif);color:var(--blue)">12%</div>
        <div style="font-size:.88rem;font-weight:600">${formatRp(h.saldoJHT.optimis)}</div>
      </div>
    </div>
    <div style="background:var(--green-lt);border:2px solid var(--green);border-radius:8px;padding:1rem;text-align:center">
      <div style="font-size:.74rem;font-weight:700;color:var(--green);text-transform:uppercase;margin-bottom:.2rem">Total Manfaat (JP + JHT 6%)</div>
      <div style="font-size:1.5rem;font-weight:900;font-family:var(--font-serif);color:var(--green)">${formatRp(h.totalLumpSum)}</div>
    </div>
  `;
  document.getElementById('modalOverlay').classList.add('open');
}

function ir(label, val) {
  return `<div style="background:var(--bg);padding:.65rem .85rem;border-radius:8px;border:1px solid var(--border)">
    <div style="font-size:.7rem;font-weight:700;color:var(--ink-muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:.15rem">${label}</div>
    <div style="font-weight:600;font-size:.88rem">${val}</div></div>`;
}
function tr2(label, val, bold=false) {
  return `<tr style="border-bottom:1px solid var(--border)">
    <td style="padding:.55rem .85rem">${label}</td>
    <td style="padding:.55rem .85rem;text-align:right;${bold?'color:var(--accent);font-weight:700':''}">${val}</td></tr>`;
}
function closeModal() { document.getElementById('modalOverlay').classList.remove('open'); }

// ══════════════════════════════════════════════════
// TABLE + STATS
// ══════════════════════════════════════════════════

function renderTable() {
  const tbody = document.getElementById('tableBody');
  const empty = document.getElementById('emptyState');
  const q  = (document.getElementById('searchInput').value||'').toLowerCase();
  const fs = (document.getElementById('filterStatus').value||'').toLowerCase();
  const list = karyausahawanList.filter(k => {
    const h = hitungPensiun(k);
    const mq = !q || [k.nama,k.nik,k.jabatan||'',k.divisi||''].some(s=>s.toLowerCase().includes(q));
    return mq && (!fs || h.status===fs);
  });
  if (!list.length) { tbody.innerHTML=''; empty.style.display='block'; return; }
  empty.style.display='none';
  const SD = {
    normal:     '<span class="status-badge" style="background:var(--green-lt);color:var(--green)">✅ Normal</span>',
    terlambat:  '<span class="status-badge" style="background:var(--orange-lt);color:var(--orange)">⚠️ Terlambat</span>',
    dipercepat: '<span class="status-badge" style="background:var(--blue-lt);color:var(--blue)">⚡ Dipercepat</span>',
    belum:      '<span class="status-badge" style="background:#f0f4ff;color:#5c6bc0">🔵 Belum</span>',
  };
  tbody.innerHTML = list.map((k,i) => {
    const h = hitungPensiun(k);
    return `<tr>
      <td>${i+1}</td>
      <td style="font-weight:600">${k.nik}</td>
      <td><strong>${k.nama}</strong><br/><small style="color:var(--ink-muted)">${k.jabatan||''} ${k.divisi?'· '+k.divisi:''}</small></td>
      <td>${h.usia} th</td><td>${h.mk} th</td>
      <td>${SD[h.status]||''}</td>
      <td>${formatRp(h.gaji)}</td>
      <td style="color:var(--accent);font-weight:600">${formatRp(h.jpBulanan)}</td>
      <td>${formatRp(h.saldoJHT.moderat)}</td>
      <td style="color:var(--green);font-weight:700">${formatRp(h.totalLumpSum)}</td>
      <td>
        <button class="btn-view" onclick="lihatDetail(${k.id})">Detail</button>
        <button class="btn-del"  onclick="hapusKaryausahawan(${k.id})">Hapus</button>
      </td>
    </tr>`;
  }).join('');
}

function updateStats() {
  const c = {total:karyausahawanList.length, normal:0, terlambat:0, dipercepat:0, belum:0};
  karyausahawanList.forEach(k => { const h=hitungPensiun(k); if(h.status in c) c[h.status]++; });
  animCount('statTotal',c.total); animCount('statNormal',c.normal);
  animCount('statTerlambat',c.terlambat); animCount('statDipercepat',c.dipercepat);
}

function animCount(id, target) {
  const el = document.getElementById(id); if (!el) return;
  const start = parseInt(el.textContent)||0, diff = target-start;
  if (!diff) { el.textContent=target; return; }
  const step=diff/20; let cur=start;
  const t = setInterval(()=>{
    cur+=step;
    if((diff>0&&cur>=target)||(diff<0&&cur<=target)){el.textContent=target;clearInterval(t);}
    else el.textContent=Math.round(cur);
  },25);
}

// ══════════════════════════════════════════════════
// EKSPOR CSV
// ══════════════════════════════════════════════════

function exportCSV() {
  if (!karyausahawanList.length) { showToast('⚠ Tidak ada data.'); return; }
  const H = ['No','NIK','Nama','Jabatan','Divisi','Tgl Lahir','Tgl Masuk','Tgl Berhenti',
    'Gaji Pokok','Usia','Masa Kerja','Status','Gaji Dasar JP','JP Bulanan','JP Lump Sum',
    'Iuran JHT/Bln','Saldo JHT 3%','Saldo JHT 6%','Saldo JHT 12%',
    'Total Manfaat (JP+JHT6%)','Manfaat Cacat','Manfaat Ahli Waris','Pilihan Bayar','No BPJS'];
  const SM = {normal:'Normal',terlambat:'Terlambat',dipercepat:'Dipercepat',belum:'Belum'};
  const rows = karyausahawanList.map((k,i) => {
    const h = hitungPensiun(k);
    return [i+1,k.nik,k.nama,k.jabatan||'',k.divisi||'',k.tglLahir,k.tglMasuk,k.tglBerhenti||'',
      h.gaji,h.usia,h.mk,SM[h.status]||'',h.gajiDasarJP,
      Math.round(h.jpBulanan),Math.round(h.jpLumpSum),Math.round(h.iuranJHT),
      Math.round(h.saldoJHT.konservatif),Math.round(h.saldoJHT.moderat),Math.round(h.saldoJHT.optimis),
      Math.round(h.totalLumpSum),Math.round(h.manfaatCacat),Math.round(h.manfaatAhliWaris),
      k.jenisBayar,k.noBPJS||'']
      .map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',');
  });
  const csv='\uFEFF'+[H.join(','),...rows].join('\n');
  const a=Object.assign(document.createElement('a'),{
    href:URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),
    download:`BabadaCorp_Pensiun_${new Date().toISOString().split('T')[0]}.csv`
  });
  a.click(); showToast('✅ CSV berhasil diunduh!');
}

// ══════════════════════════════════════════════════
// MISC
// ══════════════════════════════════════════════════

document.getElementById('fGaji').addEventListener('input', function() {
  const r=this.value.replace(/\D/g,'');
  this.value = r ? parseInt(r).toLocaleString('id-ID') : '';
});
window.addEventListener('scroll', () => {
  document.getElementById('siteHeader').classList.toggle('scrolled', window.scrollY > 10);
});
function toggleMenu() { document.getElementById('mobileNav').classList.toggle('open'); }
document.addEventListener('keydown', e => { if(e.key==='Escape'){ closeModal(); tutupConfigDB(); } });

// ── INIT ─────────────────────────────────────────────
initDB();
