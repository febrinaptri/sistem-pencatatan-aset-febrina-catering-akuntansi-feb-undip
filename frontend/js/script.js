const assetTableBody = document.querySelector('#asset-table-body');
const assetForm = document.querySelector('#asset-form');
const assetDialog = document.querySelector('#asset-dialog');
const assetDetailDialog = document.querySelector('#asset-detail-dialog');
const accountTableBody = document.querySelector('#account-table-body');
const accountForm = document.querySelector('#account-form');
const accountDialog = document.querySelector('#account-dialog');
const acquisitionForm = document.querySelector('#acquisition-journal-form');
const acquisitionAssetSelect = document.querySelector('#acquisition-asset-select');
const formError = document.querySelector('#form-error');
const toast = document.querySelector('#toast');
const searchInput = document.querySelector('#asset-search');
const conditionFilter = document.querySelector('#condition-filter');
const accountSearchInput = document.querySelector('#account-search');
const accountTypeFilter = document.querySelector('#account-type-filter');
const openingBalanceForm = document.querySelector('#opening-balance-form');
const openingBalanceDateInput = document.querySelector('#opening-balance-date');
const openingBalanceBody = document.querySelector('#opening-balance-body');
const reportPeriodInput = document.querySelector('#report-period');
const journalPeriodInput = document.querySelector('#journal-period');
const ledgerPeriodInput = document.querySelector('#ledger-period');
const depreciationExpenseAccountSelect = document.querySelector('#depreciation-expense-account');
const depreciationAccumulatedAccountSelect = document.querySelector('#depreciation-accumulated-account');
const SUPABASE_URL = 'https://xbvashcoltppogofrscm.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_Dq10cBfxlN1Z-cQWYOybzg_sKcvqw_i';
const SUPABASE_REST_URL = `${SUPABASE_URL}/rest/v1`;
const DEMO_USERNAME = 'febrina.catering';
const DEMO_PASSWORD = 'DemoFebrina26!';

let assets = [];
let accounts = [];
let openingBalanceAccounts = [];
let openingBalanceJournals = [];
let openingBalanceLoadError = '';
let acquisitionAssets = [];
let acquisitionAccounts = [];
let acquisitionJournals = [];
let depreciationAccounts = [];
let postedDepreciationJournals = [];
let depreciationPostingError = '';
let ledgerAccounts = [];
let ledgerDetails = [];
let ledgerLoadError = '';
let references = { kategori: [], lokasi: [], kondisi: [] };
let editingId = null;
let editingAccountId = null;
let toastTimer;
let referenceLoadError = '';

const rupiah = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
});
const dateFormatter = new Intl.DateTimeFormat('id-ID', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

async function api(path, options = {}) {
  if (SUPABASE_URL.includes('YOUR-PROJECT-REF') || SUPABASE_PUBLISHABLE_KEY.includes('YOUR_')) {
    throw new Error('Isi Project URL dan Publishable key pada frontend/js/script.js.');
  }
  let response;
  try {
    response = await fetch(`${SUPABASE_REST_URL}${path}`, {
      ...options,
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
        ...options.headers,
      },
    });
  } catch {
    throw new Error('Supabase tidak terhubung. Periksa Project URL dan Publishable key di frontend/js/script.js.');
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || result.error_description || result.error || 'Permintaan ke Supabase gagal. Periksa konfigurasi key dan policy RLS.');
  return result;
}

function friendlyError(error) {
  if (/umur_manfaat_tahun|nilai_residu/.test(error.message || '')) {
    return 'Database perlu diperbarui. Jalankan backend/sql/database.sql di Supabase SQL Editor, lalu muat ulang halaman.';
  }
  return error.message || 'Terjadi kesalahan saat memproses data.';
}

function fillReferenceSelect(name, rows, idKey, labelKey, emptyLabel) {
  const select = assetForm.elements[name];
  const placeholder = rows.length ? select.options[0].textContent : emptyLabel;
  select.innerHTML = `<option value="">${placeholder}</option>${rows.map((row) =>
    `<option value="${row[idKey]}">${escapeHtml(row[labelKey])}</option>`
  ).join('')}`;
  select.disabled = rows.length === 0;
}

async function loadReferences() {
  try {
    const [kategori, lokasi, kondisi] = await Promise.all([
      api('/kategori_aset?select=id_kategori,nama_kategori&order=nama_kategori.asc'),
      api('/lokasi?select=id_lokasi,nama_lokasi&order=nama_lokasi.asc'),
      api('/kondisi_aset?select=id_kondisi,nama_kondisi&order=id_kondisi.asc'),
    ]);
    references = { kategori, lokasi, kondisi };
  } catch (error) {
    referenceLoadError = `${error.message} Pastikan database.sql sudah dijalankan di Supabase.`;
    throw new Error(referenceLoadError);
  }
  fillReferenceSelect('kategori_id', references.kategori, 'id_kategori', 'nama_kategori', 'Kategori belum tersedia');
  fillReferenceSelect('lokasi_id', references.lokasi, 'id_lokasi', 'nama_lokasi', 'Lokasi belum tersedia');
  fillReferenceSelect('kondisi_id', references.kondisi, 'id_kondisi', 'nama_kondisi', 'Kondisi belum tersedia');
  conditionFilter.innerHTML = '<option value="">Semua kondisi</option>' + references.kondisi.map((condition) =>
    `<option value="${condition.id_kondisi}">${escapeHtml(condition.nama_kondisi)}</option>`
  ).join('');

  const missingReferences = [
    ['kategori', references.kategori],
    ['lokasi', references.lokasi],
    ['kondisi aset', references.kondisi],
  ].filter(([, rows]) => !rows.length).map(([label]) => label);
  if (missingReferences.length) {
    referenceLoadError = `Data ${missingReferences.join(', ')} belum tersedia. Jalankan backend/sql/database.sql di Supabase.`;
    throw new Error(referenceLoadError);
  }
  referenceLoadError = '';
}

async function loadAssets() {
  assetTableBody.innerHTML = '<tr><td class="table-message" colspan="10"><span class="loading-mark"></span>Memuat data aset...</td></tr>';
  try {
    assets = await api('/aset?select=id_aset,nama_aset,kategori_id,lokasi_id,kondisi_id,tanggal_pembelian,harga_perolehan,umur_manfaat_tahun,nilai_residu,kategori:kategori_aset(id_kategori,nama_kategori),lokasi:lokasi(id_lokasi,nama_lokasi),kondisi:kondisi_aset(id_kondisi,nama_kondisi)&order=id_aset.desc');
    renderAssets();
    renderDashboard();
    renderReports();
  } catch (error) {
    const message = friendlyError(error);
    assetTableBody.innerHTML = `<tr><td class="table-message" colspan="10">${escapeHtml(message)}</td></tr>`;
    document.querySelector('#result-count').textContent = 'Data gagal dimuat';
    showToast(message, true);
  }
}

async function loadAccounts() {
  accountTableBody.innerHTML = '<tr><td class="table-message" colspan="6"><span class="loading-mark"></span>Memuat akun...</td></tr>';
  try {
    accounts = await api('/akun?select=id_akun,kode_akun,nama_akun,jenis_akun,saldo_normal,is_aktif&order=kode_akun.asc');
    renderAccounts();
  } catch (error) {
    const message = /PGRST205|42P01|schema cache|public\.akun/i.test(error.message || '')
      ? 'Tabel akun belum tersedia. Jalankan backend/sql/database.sql di Supabase SQL Editor.'
      : friendlyError(error);
    accountTableBody.innerHTML = `<tr><td class="table-message" colspan="6">${escapeHtml(message)}</td></tr>`;
    document.querySelector('#account-result-count').textContent = 'Akun gagal dimuat';
  }
}

function getFilteredAccounts() {
  const query = accountSearchInput.value.trim().toLocaleLowerCase('id-ID');
  const selectedType = accountTypeFilter.value;
  return accounts.filter((account) => (!selectedType || account.jenis_akun === selectedType) && [
    account.kode_akun,
    account.nama_akun,
    account.jenis_akun,
    account.saldo_normal,
  ].some((value) => String(value || '').toLocaleLowerCase('id-ID').includes(query)));
}

function renderAccounts() {
  const filteredAccounts = getFilteredAccounts();
  if (!filteredAccounts.length) {
    const message = accounts.length ? 'Tidak ada akun yang sesuai dengan pencarian.' : 'Belum ada data akun.';
    accountTableBody.innerHTML = `<tr><td class="table-message" colspan="6">${escapeHtml(message)}</td></tr>`;
  } else {
    accountTableBody.innerHTML = filteredAccounts.map((account) => `<tr>
      <td class="account-code">${escapeHtml(account.kode_akun)}</td>
      <td><div class="asset-name">${escapeHtml(account.nama_akun)}</div></td>
      <td>${escapeHtml(account.jenis_akun)}</td>
      <td>${escapeHtml(account.saldo_normal)}</td>
      <td><span class="account-status ${account.is_aktif ? 'is-active' : 'is-inactive'}">${account.is_aktif ? 'Aktif' : 'Nonaktif'}</span></td>
      <td><div class="row-actions">
        <button class="row-button" type="button" data-account-action="edit" data-id="${account.id_akun}" aria-label="Edit ${escapeHtml(account.nama_akun)}" title="Edit akun">✎</button>
        <button class="account-toggle-button" type="button" data-account-action="toggle" data-id="${account.id_akun}">${account.is_aktif ? 'Nonaktifkan' : 'Aktifkan'}</button>
      </div></td>
    </tr>`).join('');
  }
  document.querySelector('#account-result-count').textContent = `${filteredAccounts.length} dari ${accounts.length} akun`;
}

function openAccountDialog(account = null) {
  editingAccountId = account?.id_akun ?? null;
  accountForm.reset();
  document.querySelector('#account-form-error').hidden = true;
  document.querySelector('#account-form-error').textContent = '';
  document.querySelector('#account-dialog-kicker').textContent = account ? 'UBAH AKUN' : 'AKUN BARU';
  document.querySelector('#account-dialog-title').textContent = account ? 'Edit akun' : 'Tambah akun';
  document.querySelector('#save-account-label').textContent = account ? 'Simpan perubahan' : 'Simpan akun';
  if (account) {
    accountForm.elements.kode_akun.value = account.kode_akun;
    accountForm.elements.nama_akun.value = account.nama_akun;
    accountForm.elements.jenis_akun.value = account.jenis_akun;
    accountForm.elements.saldo_normal.value = account.saldo_normal;
    accountForm.elements.is_aktif.checked = account.is_aktif;
  }
  accountDialog.showModal();
  accountForm.elements.kode_akun.focus();
}

async function submitAccount(event) {
  event.preventDefault();
  const accountFormError = document.querySelector('#account-form-error');
  if (!accountForm.reportValidity()) return;
  const payload = {
    kode_akun: accountForm.elements.kode_akun.value.trim(),
    nama_akun: accountForm.elements.nama_akun.value.trim(),
    jenis_akun: accountForm.elements.jenis_akun.value,
    saldo_normal: accountForm.elements.saldo_normal.value,
    is_aktif: accountForm.elements.is_aktif.checked,
    updated_at: new Date().toISOString(),
  };
  const saveButton = document.querySelector('#save-account-button');
  saveButton.disabled = true;
  accountFormError.hidden = true;
  try {
    await api(editingAccountId ? `/akun?id_akun=eq.${editingAccountId}` : '/akun', {
      method: editingAccountId ? 'PATCH' : 'POST',
      body: JSON.stringify(payload),
    });
    accountDialog.close();
    showToast(editingAccountId ? 'Perubahan akun berhasil disimpan.' : 'Akun berhasil ditambahkan.');
    await loadAccounts();
  } catch (error) {
    accountFormError.textContent = error.message || 'Gagal menyimpan akun.';
    accountFormError.hidden = false;
  } finally {
    saveButton.disabled = false;
  }
}

async function toggleAccountStatus(id) {
  const account = accounts.find((item) => String(item.id_akun) === String(id));
  if (!account) return;
  const nextStatus = !account.is_aktif;
  const action = nextStatus ? 'Aktifkan' : 'Nonaktifkan';
  if (!window.confirm(`${action} akun ${account.kode_akun} · ${account.nama_akun}?`)) return;
  try {
    await api(`/akun?id_akun=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ is_aktif: nextStatus, updated_at: new Date().toISOString() }),
    });
    showToast(`Akun ${nextStatus ? 'diaktifkan' : 'dinonaktifkan'}.`);
    await loadAccounts();
  } catch (error) {
    showToast(error.message || 'Gagal mengubah status akun.', true);
  }
}

async function loadOpeningBalancePage() {
  try {
    const [accountRows, journalRows] = await Promise.all([
      api('/akun?select=id_akun,kode_akun,nama_akun,jenis_akun,saldo_normal,is_aktif&order=kode_akun.asc'),
      api('/jurnal?select=id_jurnal,nomor_jurnal,tanggal_jurnal,jenis_jurnal,jurnal_detail(akun_id,posisi,jumlah)&order=tanggal_jurnal.asc'),
    ]);
    openingBalanceAccounts = accountRows;
    openingBalanceJournals = journalRows;
    openingBalanceLoadError = '';
    renderOpeningBalancePage();
  } catch (error) {
    openingBalanceLoadError = /akun|jurnal|schema cache|PGRST205|42P01/i.test(error.message || '')
      ? 'Jalankan backend/sql/database.sql di Supabase sebelum mengisi saldo awal.'
      : error.message || 'Data saldo awal gagal dimuat.';
    renderOpeningBalancePage();
  }
}

function renderOpeningBalancePage() {
  const existingJournal = openingBalanceJournals.find((journal) => journal.jenis_jurnal === 'Saldo Awal');
  if (openingBalanceLoadError) {
    openingBalanceBody.innerHTML = `<tr><td class="table-message" colspan="6">${escapeHtml(openingBalanceLoadError)}</td></tr>`;
    document.querySelector('#opening-balance-account-count').textContent = 'Akun gagal dimuat';
    document.querySelector('#opening-balance-help').textContent = openingBalanceLoadError;
    document.querySelector('#opening-balance-state').textContent = 'Belum tersedia';
    document.querySelector('#opening-balance-state').className = 'journal-balance is-error';
    document.querySelector('#save-opening-balance-button').disabled = true;
    return;
  }

  const existingLines = new Map((existingJournal?.jurnal_detail || []).map((line) => [String(line.akun_id), line]));
  const firstTransaction = openingBalanceJournals
    .filter((journal) => journal.jenis_jurnal !== 'Saldo Awal')
    .sort((left, right) => left.tanggal_jurnal.localeCompare(right.tanggal_jurnal))[0];

  if (existingJournal) {
    openingBalanceDateInput.value = existingJournal.tanggal_jurnal;
    openingBalanceDateInput.disabled = true;
    document.querySelector('#opening-balance-help').textContent = `Saldo awal sudah dicatat sebagai ${existingJournal.nomor_jurnal}. Jurnal ini tidak dapat ditimpa.`;
  } else {
    openingBalanceDateInput.disabled = false;
    if (!openingBalanceDateInput.value) {
      const suggestedDate = firstTransaction
        ? new Date(`${firstTransaction.tanggal_jurnal}T00:00:00`)
        : new Date(new Date().getFullYear(), 0, 1);
      if (firstTransaction) suggestedDate.setDate(suggestedDate.getDate() - 1);
      openingBalanceDateInput.value = `${suggestedDate.getFullYear()}-${String(suggestedDate.getMonth() + 1).padStart(2, '0')}-${String(suggestedDate.getDate()).padStart(2, '0')}`;
    }
  }

  if (!existingJournal && firstTransaction) {
    document.querySelector('#opening-balance-help').textContent = `Tanggal harus sebelum transaksi pertama (${dateFormatter.format(new Date(`${firstTransaction.tanggal_jurnal}T00:00:00`))}). Isi saldo sesuai neraca awal; saldo nol boleh dikosongkan.`;
  }

  if (!openingBalanceAccounts.length) {
    openingBalanceBody.innerHTML = '<tr><td class="table-message" colspan="6">Belum ada akun. Tambahkan akun aktif terlebih dahulu.</td></tr>';
  } else {
    openingBalanceBody.innerHTML = openingBalanceAccounts.map((account) => {
      const existingLine = existingLines.get(String(account.id_akun));
      const inactive = !account.is_aktif && !existingLine;
      return `<tr>
        <td class="account-code">${escapeHtml(account.kode_akun)}</td>
        <td><div class="asset-name">${escapeHtml(account.nama_akun)}</div></td>
        <td>${escapeHtml(account.jenis_akun)}</td>
        <td><span class="account-normal-balance">${escapeHtml(existingLine?.posisi || account.saldo_normal)}</span></td>
        <td><span class="account-status ${account.is_aktif ? 'is-active' : 'is-inactive'}">${account.is_aktif ? 'Aktif' : 'Nonaktif'}</span></td>
        <td class="opening-amount-cell"><span>Rp</span><input class="opening-balance-input" type="number" min="0" step="0.01" inputmode="decimal" data-account-id="${account.id_akun}" data-position="${escapeHtml(existingLine?.posisi || account.saldo_normal)}" value="${existingLine ? Number(existingLine.jumlah) : ''}" placeholder="0,00" aria-label="Saldo awal ${escapeHtml(account.nama_akun)}" ${existingJournal || inactive ? 'disabled' : ''}></td>
      </tr>`;
    }).join('');
  }
  document.querySelector('#opening-balance-account-count').textContent = `${openingBalanceAccounts.length} akun`;
  updateOpeningBalanceTotals(existingJournal);
}

function updateOpeningBalanceTotals(existingJournal = null) {
  const amounts = [...openingBalanceBody.querySelectorAll('.opening-balance-input')].map((input) => ({
    position: input.dataset.position,
    amount: Number(input.value || 0),
  }));
  const debitTotal = Math.round(amounts.reduce((sum, line) => sum + (line.position === 'Debit' ? line.amount : 0), 0) * 100) / 100;
  const creditTotal = Math.round(amounts.reduce((sum, line) => sum + (line.position === 'Kredit' ? line.amount : 0), 0) * 100) / 100;
  const isBalanced = debitTotal > 0 && debitTotal === creditTotal;
  const state = document.querySelector('#opening-balance-state');
  document.querySelector('#opening-debit-total').textContent = rupiah.format(debitTotal);
  document.querySelector('#opening-credit-total').textContent = rupiah.format(creditTotal);
  state.classList.remove('is-error', 'is-balanced', 'is-unbalanced', 'is-posted');

  if (existingJournal) {
    state.textContent = 'Sudah dicatat';
    state.classList.add('is-posted');
  } else if (!debitTotal && !creditTotal) {
    state.textContent = 'Isi saldo akun untuk memeriksa keseimbangan';
    state.classList.add('is-error');
  } else if (isBalanced) {
    state.textContent = 'Seimbang';
    state.classList.add('is-balanced');
  } else {
    state.textContent = 'Total debit dan kredit harus sama';
    state.classList.add('is-unbalanced');
  }
  document.querySelector('#save-opening-balance-button').disabled = Boolean(existingJournal) || !isBalanced;
}

async function submitOpeningBalance(event) {
  event.preventDefault();
  const errorMessage = document.querySelector('#opening-balance-error');
  if (!openingBalanceForm.reportValidity()) return;
  const lines = [...openingBalanceBody.querySelectorAll('.opening-balance-input')]
    .map((input) => ({
      akun_id: Number(input.dataset.accountId),
      posisi: input.dataset.position,
      jumlah: Number(input.value || 0),
    }))
    .filter((line) => line.jumlah > 0);
  if (!lines.length) return;
  if (!window.confirm('Simpan saldo awal? Jurnal saldo awal hanya dapat dicatat satu kali.')) return;

  const button = document.querySelector('#save-opening-balance-button');
  button.disabled = true;
  errorMessage.hidden = true;
  try {
    await api('/rpc/catat_saldo_awal', {
      method: 'POST',
      body: JSON.stringify({ p_tanggal: openingBalanceDateInput.value, p_baris: lines }),
    });
    showToast('Saldo awal berhasil dicatat.');
    await loadOpeningBalancePage();
  } catch (error) {
    errorMessage.textContent = error.message || 'Gagal mencatat saldo awal.';
    errorMessage.hidden = false;
    button.disabled = false;
  }
}

async function loadAcquisitionPage() {
  const tableBody = document.querySelector('#acquisition-journal-table-body');
  tableBody.innerHTML = '<tr><td class="table-message" colspan="6"><span class="loading-mark"></span>Memuat jurnal perolehan...</td></tr>';
  try {
    const [assetRows, accountRows, journalRows] = await Promise.all([
      api('/aset?select=id_aset,nama_aset,tanggal_pembelian,harga_perolehan&order=tanggal_pembelian.asc'),
      api('/akun?select=id_akun,kode_akun,nama_akun,jenis_akun,saldo_normal,is_aktif&is_aktif=eq.true&order=kode_akun.asc'),
      api('/jurnal?select=id_jurnal,nomor_jurnal,tanggal_jurnal,id_aset,deskripsi,aset(nama_aset),jurnal_detail(posisi,jumlah,keterangan,akun(kode_akun,nama_akun))&jenis_jurnal=eq.Perolehan%20Aset&order=tanggal_jurnal.desc'),
    ]);
    acquisitionAssets = assetRows.filter((asset) => !journalRows.some((journal) => String(journal.id_aset) === String(asset.id_aset)));
    acquisitionAccounts = accountRows;
    acquisitionJournals = journalRows;
    renderAcquisitionPage();
  } catch (error) {
    const message = /akun|jurnal|schema cache|PGRST205|42P01/i.test(error.message || '')
      ? 'Tabel akun atau jurnal belum tersedia. Jalankan backend/sql/database.sql di Supabase SQL Editor.'
      : friendlyError(error);
    tableBody.innerHTML = `<tr><td class="table-message" colspan="6">${escapeHtml(message)}</td></tr>`;
    document.querySelector('#acquisition-journal-result-count').textContent = 'Jurnal gagal dimuat';
    document.querySelector('#post-acquisition-journal-button').disabled = true;
  }
}

function renderAcquisitionPage() {
  const debitAccounts = acquisitionAccounts.filter((account) =>
    account.jenis_akun === 'Aset'
    && account.saldo_normal === 'Debit'
    && !/kas|bank/i.test(account.nama_akun)
  );
  const creditAccounts = acquisitionAccounts.filter((account) =>
    (account.jenis_akun === 'Aset' && account.saldo_normal === 'Debit' && /kas|bank/i.test(account.nama_akun))
    || (account.jenis_akun === 'Liabilitas' && account.saldo_normal === 'Kredit')
  );
  acquisitionAssetSelect.innerHTML = '<option value="">Pilih aset belum dijurnal</option>' + acquisitionAssets.map((asset) =>
    `<option value="${asset.id_aset}">${escapeHtml(asset.nama_aset)} · AST-${String(asset.id_aset).padStart(4, '0')}</option>`
  ).join('');
  document.querySelector('#acquisition-debit-account').innerHTML = '<option value="">Pilih akun aset</option>' + debitAccounts.map((account) =>
    `<option value="${account.id_akun}">${escapeHtml(account.kode_akun)} · ${escapeHtml(account.nama_akun)}</option>`
  ).join('');
  document.querySelector('#acquisition-credit-account').innerHTML = '<option value="">Pilih akun sumber</option>' + creditAccounts.map((account) =>
    `<option value="${account.id_akun}">${escapeHtml(account.kode_akun)} · ${escapeHtml(account.nama_akun)}</option>`
  ).join('');
  document.querySelector('#post-acquisition-journal-button').disabled = !acquisitionAssets.length || !debitAccounts.length || !creditAccounts.length;
  renderAcquisitionPreview();
  renderAcquisitionHistory();
}

function renderAcquisitionPreview() {
  const asset = acquisitionAssets.find((item) => String(item.id_aset) === acquisitionAssetSelect.value);
  document.querySelector('#acquisition-date-preview').textContent = asset
    ? dateFormatter.format(new Date(`${asset.tanggal_pembelian}T00:00:00`))
    : '—';
  document.querySelector('#acquisition-value-preview').textContent = asset
    ? rupiah.format(Number(asset.harga_perolehan))
    : '—';
}

function renderAcquisitionHistory() {
  const tableBody = document.querySelector('#acquisition-journal-table-body');
  if (!acquisitionJournals.length) {
    tableBody.innerHTML = '<tr><td class="table-message" colspan="6">Belum ada jurnal perolehan aset.</td></tr>';
  } else {
    tableBody.innerHTML = acquisitionJournals.map((journal) => (journal.jurnal_detail || []).map((line) => {
      const accountName = line.akun?.nama_akun || '-';
      const accountCode = line.akun?.kode_akun || '-';
      const amount = escapeHtml(rupiah.format(Number(line.jumlah)));
      const isDebit = line.posisi === 'Debit';
      return `<tr>
        <td>${escapeHtml(journal.nomor_jurnal)}</td>
        <td>${escapeHtml(dateFormatter.format(new Date(`${journal.tanggal_jurnal}T00:00:00`)))}</td>
        <td>${escapeHtml(journal.aset?.nama_aset || journal.deskripsi)}</td>
        <td>${escapeHtml(accountCode)} · ${escapeHtml(accountName)}</td>
        <td class="price-cell">${isDebit ? amount : '—'}</td>
        <td class="price-cell">${isDebit ? '—' : amount}</td>
      </tr>`;
    }).join('')).join('');
  }
  document.querySelector('#acquisition-journal-result-count').textContent = `${acquisitionJournals.length} jurnal perolehan`;
}

async function submitAcquisitionJournal(event) {
  event.preventDefault();
  const errorMessage = document.querySelector('#acquisition-journal-error');
  if (!acquisitionForm.reportValidity()) return;
  const assetId = Number(acquisitionAssetSelect.value);
  const debitAccountId = Number(document.querySelector('#acquisition-debit-account').value);
  const creditAccountId = Number(document.querySelector('#acquisition-credit-account').value);
  if (debitAccountId === creditAccountId) {
    errorMessage.textContent = 'Akun debit dan kredit harus berbeda.';
    errorMessage.hidden = false;
    return;
  }

  const submitButton = document.querySelector('#post-acquisition-journal-button');
  submitButton.disabled = true;
  errorMessage.hidden = true;
  try {
    await api('/rpc/catat_jurnal_perolehan', {
      method: 'POST',
      body: JSON.stringify({
        p_id_aset: assetId,
        p_akun_aset_id: debitAccountId,
        p_akun_sumber_id: creditAccountId,
      }),
    });
    acquisitionForm.reset();
    showToast('Jurnal perolehan berhasil dicatat.');
    await loadAcquisitionPage();
  } catch (error) {
    errorMessage.textContent = error.message || 'Gagal mencatat jurnal perolehan.';
    errorMessage.hidden = false;
  } finally {
    submitButton.disabled = !acquisitionAssets.length;
  }
}

async function loadDepreciationPostingData() {
  const status = document.querySelector('#depreciation-posting-status');
  try {
    const [accountRows, journalRows] = await Promise.all([
      api('/akun?select=id_akun,kode_akun,nama_akun,jenis_akun,saldo_normal,is_aktif&is_aktif=eq.true&order=kode_akun.asc'),
      api('/jurnal?select=id_jurnal,nomor_jurnal,periode&jenis_jurnal=eq.Penyusutan&order=periode.desc'),
    ]);
    depreciationPostingError = '';
    depreciationAccounts = accountRows;
    postedDepreciationJournals = journalRows;
    const expenseAccounts = accountRows.filter((account) =>
      account.jenis_akun === 'Beban' && account.saldo_normal === 'Debit' && /penyusutan/i.test(account.nama_akun)
    );
    const accumulatedAccounts = accountRows.filter((account) =>
      account.jenis_akun === 'Aset'
      && account.saldo_normal === 'Kredit'
      && /akumulasi.*penyusutan|penyusutan.*akumulasi/i.test(account.nama_akun)
    );
    depreciationExpenseAccountSelect.innerHTML = '<option value="">Pilih akun beban</option>' + expenseAccounts.map((account) =>
      `<option value="${account.id_akun}">${escapeHtml(account.kode_akun)} · ${escapeHtml(account.nama_akun)}</option>`
    ).join('');
    depreciationAccumulatedAccountSelect.innerHTML = '<option value="">Pilih akun akumulasi</option>' + accumulatedAccounts.map((account) =>
      `<option value="${account.id_akun}">${escapeHtml(account.kode_akun)} · ${escapeHtml(account.nama_akun)}</option>`
    ).join('');
    depreciationExpenseAccountSelect.value = expenseAccounts.find((account) => account.kode_akun === '5201')?.id_akun || '';
    depreciationAccumulatedAccountSelect.value = accumulatedAccounts.find((account) => account.kode_akun === '1291')?.id_akun || '';
    renderReports();
  } catch (error) {
    depreciationPostingError = /akun|jurnal|schema cache|PGRST205|42P01/i.test(error.message || '')
      ? 'Jalankan backend/sql/database.sql di Supabase sebelum melakukan posting.'
      : error.message || 'Status posting tidak dapat dimuat.';
    renderReports();
  }
}

function updateDepreciationPostingState(journalRows, journalTotal) {
  const period = reportPeriodInput.value;
  const posted = postedDepreciationJournals.find((journal) => journal.periode === `${period}-01`);
  const status = document.querySelector('#depreciation-posting-status');
  const button = document.querySelector('#post-depreciation-button');
  status.classList.remove('is-error', 'is-posted');
  if (depreciationPostingError) {
    status.textContent = depreciationPostingError;
    status.classList.add('is-error');
    button.disabled = true;
    return;
  }
  if (posted) {
    status.textContent = `Sudah diposting sebagai ${posted.nomor_jurnal}.`;
    status.classList.add('is-posted');
  } else if (!journalRows.length || journalTotal <= 0) {
    status.textContent = 'Tidak ada beban penyusutan untuk diposting pada periode ini.';
  } else {
    status.textContent = 'Pratinjau belum diposting ke jurnal tersimpan.';
  }
  button.disabled = Boolean(posted)
    || !journalRows.length
    || journalTotal <= 0
    || !depreciationExpenseAccountSelect.value
    || !depreciationAccumulatedAccountSelect.value;
}

async function postDepreciationJournal() {
  const period = reportPeriodInput.value;
  const errorMessage = document.querySelector('#depreciation-posting-status');
  const button = document.querySelector('#post-depreciation-button');
  if (!period || !depreciationExpenseAccountSelect.value || !depreciationAccumulatedAccountSelect.value) return;
  if (!window.confirm(`Posting jurnal penyusutan periode ${period}? Posting untuk periode yang sama tidak dapat diulang.`)) return;
  button.disabled = true;
  errorMessage.classList.remove('is-error');
  try {
    await api('/rpc/posting_jurnal_penyusutan', {
      method: 'POST',
      body: JSON.stringify({
        p_periode: `${period}-01`,
        p_akun_beban_id: Number(depreciationExpenseAccountSelect.value),
        p_akun_akumulasi_id: Number(depreciationAccumulatedAccountSelect.value),
      }),
    });
    showToast(`Jurnal penyusutan ${period} berhasil diposting.`);
    await loadDepreciationPostingData();
  } catch (error) {
    errorMessage.textContent = error.message || 'Gagal memposting jurnal penyusutan.';
    errorMessage.classList.add('is-error');
    button.disabled = false;
  }
}

async function loadLedgerPage() {
  ledgerLoadError = '';
  try {
    const [accountRows, detailRows] = await Promise.all([
      api('/akun?select=id_akun,kode_akun,nama_akun,jenis_akun,saldo_normal&order=kode_akun.asc'),
      api('/jurnal_detail?select=id_detail_jurnal,posisi,jumlah,keterangan,akun(id_akun,kode_akun,nama_akun,jenis_akun,saldo_normal),jurnal(id_jurnal,nomor_jurnal,tanggal_jurnal,jenis_jurnal,deskripsi)&order=id_detail_jurnal.asc'),
    ]);
    ledgerAccounts = accountRows;
    ledgerDetails = detailRows.filter((line) => line.jurnal?.tanggal_jurnal);
  } catch (error) {
    ledgerLoadError = /akun|jurnal|schema cache|PGRST205|42P01/i.test(error.message || '')
      ? 'Jalankan migrasi akun dan jurnal di Supabase untuk melihat buku besar.'
      : error.message || 'Buku besar gagal dimuat.';
  }
  renderLedger();
}

function renderLedger() {
  const detailBody = document.querySelector('#ledger-detail-body');
  const trialBody = document.querySelector('#trial-balance-body');
  if (ledgerLoadError) {
    detailBody.innerHTML = `<tr><td class="table-message" colspan="6">${escapeHtml(ledgerLoadError)}</td></tr>`;
    trialBody.innerHTML = `<tr><td class="table-message" colspan="5">${escapeHtml(ledgerLoadError)}</td></tr>`;
    document.querySelector('#ledger-as-of').textContent = '';
    document.querySelector('#ledger-period-debit').textContent = '—';
    document.querySelector('#ledger-period-credit').textContent = '—';
    document.querySelector('#ledger-trial-debit').textContent = '—';
    document.querySelector('#ledger-trial-credit').textContent = '—';
    const balanceStatus = document.querySelector('#ledger-balance-status');
    balanceStatus.textContent = 'Belum tersedia';
    balanceStatus.classList.remove('is-balanced', 'is-unbalanced');
    balanceStatus.classList.add('is-error');
    return;
  }
  if (!ledgerPeriodInput.value) return;

  const [year, month] = ledgerPeriodInput.value.split('-').map(Number);
  const periodEnd = new Date(year, month, 0);
  const periodEndDate = `${year}-${String(month).padStart(2, '0')}-${String(periodEnd.getDate()).padStart(2, '0')}`;
  const currentPeriodPrefix = `${year}-${String(month).padStart(2, '0')}-`;
  const periodDetails = ledgerDetails.filter((line) => line.jurnal.tanggal_jurnal.startsWith(currentPeriodPrefix));
  const cumulativeDetails = ledgerDetails.filter((line) => line.jurnal.tanggal_jurnal <= periodEndDate);
  const periodDebit = periodDetails.reduce((sum, line) => sum + (line.posisi === 'Debit' ? Number(line.jumlah) : 0), 0);
  const periodCredit = periodDetails.reduce((sum, line) => sum + (line.posisi === 'Kredit' ? Number(line.jumlah) : 0), 0);
  const balances = ledgerAccounts.map((account) => {
    const accountLines = cumulativeDetails.filter((line) => Number(line.akun?.id_akun) === Number(account.id_akun));
    const debits = accountLines.reduce((sum, line) => sum + (line.posisi === 'Debit' ? Number(line.jumlah) : 0), 0);
    const credits = accountLines.reduce((sum, line) => sum + (line.posisi === 'Kredit' ? Number(line.jumlah) : 0), 0);
    const netBalance = Math.round((debits - credits) * 100) / 100;
    return {
      account,
      debitBalance: Math.max(0, netBalance),
      creditBalance: Math.max(0, -netBalance),
    };
  });
  const totalTrialDebit = balances.reduce((sum, row) => sum + row.debitBalance, 0);
  const totalTrialCredit = balances.reduce((sum, row) => sum + row.creditBalance, 0);
  const balanced = Math.round(totalTrialDebit * 100) === Math.round(totalTrialCredit * 100);
  const periodLabel = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(periodEnd);
  document.querySelector('#ledger-as-of').textContent = `Mutasi: ${periodLabel} · Saldo kumulatif sampai ${dateFormatter.format(periodEnd)}`;
  document.querySelector('#ledger-period-debit').textContent = rupiah.format(periodDebit);
  document.querySelector('#ledger-period-credit').textContent = rupiah.format(periodCredit);
  document.querySelector('#ledger-trial-debit').textContent = rupiah.format(totalTrialDebit);
  document.querySelector('#ledger-trial-credit').textContent = rupiah.format(totalTrialCredit);
  const balanceStatus = document.querySelector('#ledger-balance-status');
  balanceStatus.textContent = balanced ? 'Seimbang' : 'Tidak seimbang';
  balanceStatus.classList.remove('is-error');
  balanceStatus.classList.toggle('is-balanced', balanced);
  balanceStatus.classList.toggle('is-unbalanced', !balanced);

  if (!periodDetails.length) {
    detailBody.innerHTML = '<tr><td class="table-message" colspan="6">Tidak ada mutasi pada periode ini.</td></tr>';
  } else {
    detailBody.innerHTML = periodDetails.map((line) => {
      const isDebit = line.posisi === 'Debit';
      return `<tr>
        <td>${escapeHtml(dateFormatter.format(new Date(`${line.jurnal.tanggal_jurnal}T00:00:00`)))}</td>
        <td>${escapeHtml(line.jurnal.nomor_jurnal)}</td>
        <td>${escapeHtml(line.akun?.kode_akun || '-')} · ${escapeHtml(line.akun?.nama_akun || '-')}</td>
        <td>${escapeHtml(line.keterangan || line.jurnal.deskripsi)}</td>
        <td class="price-cell">${isDebit ? escapeHtml(rupiah.format(Number(line.jumlah))) : '—'}</td>
        <td class="price-cell">${isDebit ? '—' : escapeHtml(rupiah.format(Number(line.jumlah)))}</td>
      </tr>`;
    }).join('');
  }
  if (!balances.length) {
    trialBody.innerHTML = '<tr><td class="table-message" colspan="5">Belum ada data akun.</td></tr>';
  } else {
    trialBody.innerHTML = balances.map(({ account, debitBalance, creditBalance }) => `<tr>
      <td class="account-code">${escapeHtml(account.kode_akun)}</td>
      <td><div class="asset-name">${escapeHtml(account.nama_akun)}</div></td>
      <td>${escapeHtml(account.jenis_akun)}</td>
      <td class="price-cell">${debitBalance ? escapeHtml(rupiah.format(debitBalance)) : '—'}</td>
      <td class="price-cell">${creditBalance ? escapeHtml(rupiah.format(creditBalance)) : '—'}</td>
    </tr>`).join('');
  }
}

function calculateDepreciation(asset, asOf = new Date()) {
  const usefulLifeMonths = Number(asset.umur_manfaat_tahun) * 12;
  const purchasePrice = Number(asset.harga_perolehan);
  const residualValue = Number(asset.nilai_residu || 0);
  if (!Number.isFinite(usefulLifeMonths) || usefulLifeMonths < 12) return null;

  const purchaseDate = new Date(`${asset.tanggal_pembelian}T00:00:00`);
  if (Number.isNaN(purchaseDate.getTime())) return null;
  let elapsedMonths = (asOf.getFullYear() - purchaseDate.getFullYear()) * 12
    + asOf.getMonth() - purchaseDate.getMonth();
  if (asOf.getDate() < purchaseDate.getDate()) elapsedMonths -= 1;
  elapsedMonths = Math.max(0, Math.min(elapsedMonths, usefulLifeMonths));

  const depreciableAmount = Math.max(0, purchasePrice - residualValue);
  const monthlyDepreciation = depreciableAmount / usefulLifeMonths;
  const accumulatedDepreciation = Math.min(depreciableAmount, monthlyDepreciation * elapsedMonths);
  return {
    monthlyDepreciation,
    accumulatedDepreciation,
    bookValue: Math.max(residualValue, purchasePrice - accumulatedDepreciation),
  };
}

function renderDashboard() {
  const totalValue = assets.reduce((sum, asset) => sum + Number(asset.harga_perolehan || 0), 0);
  const attentionAssets = assets.filter((asset) => /rusak|perbaikan/i.test(asset.kondisi?.nama_kondisi || ''));
  const depreciableAssets = assets.map((asset) => ({ asset, depreciation: calculateDepreciation(asset) }))
    .filter((item) => item.depreciation);
  const totalDepreciation = depreciableAssets.reduce((sum, item) => sum + item.depreciation.accumulatedDepreciation, 0);
  document.querySelector('#total-assets').textContent = new Intl.NumberFormat('id-ID').format(assets.length);
  document.querySelector('#total-value').textContent = rupiah.format(totalValue);
  document.querySelector('#attention-assets').textContent = new Intl.NumberFormat('id-ID').format(attentionAssets.length);
  document.querySelector('#total-depreciation').textContent = rupiah.format(totalDepreciation);
  const chart = document.querySelector('#depreciation-chart');
  if (!depreciableAssets.length) {
    chart.innerHTML = assets.length
      ? '<div class="depreciation-empty">Lengkapi umur manfaat aset melalui tombol Edit di Data aset untuk melihat grafik.</div>'
      : '<div class="depreciation-empty">Belum ada data aset untuk dihitung.</div>';
  } else {
    const maxBookValue = Math.max(...depreciableAssets.map((item) => item.depreciation.bookValue), 1);
    chart.innerHTML = depreciableAssets.map(({ asset, depreciation }) => {
      const percentage = Math.max(2, (depreciation.bookValue / maxBookValue) * 100);
      return `<div class="depreciation-row">
        <div class="depreciation-asset"><span class="asset-name">${escapeHtml(asset.nama_aset)}</span><span class="asset-id">${asset.umur_manfaat_tahun} th · ${escapeHtml(asset.kondisi?.nama_kondisi || '-')}</span></div>
        <div class="depreciation-track" role="img" aria-label="Nilai buku ${escapeHtml(asset.nama_aset)} ${rupiah.format(depreciation.bookValue)}"><span class="depreciation-bar" style="width:${percentage}%"></span></div>
        <strong class="depreciation-value">${escapeHtml(rupiah.format(depreciation.bookValue))}</strong>
      </div>`;
    }).join('');
  }
  const attentionList = document.querySelector('#attention-list');
  if (!attentionAssets.length) {
    attentionList.innerHTML = '<div class="attention-empty">Semua aset dalam kondisi baik.</div>';
    return;
  }
  attentionList.innerHTML = attentionAssets.map((asset) => {
    const condition = asset.kondisi?.nama_kondisi || '-';
    return `<article class="attention-row">
      <div class="attention-asset">
        <span class="attention-mark" aria-hidden="true">!</span>
        <div><div class="asset-name">${escapeHtml(asset.nama_aset)}</div><div class="asset-id">AST-${String(asset.id_aset).padStart(4, '0')} · ${escapeHtml(asset.lokasi?.nama_lokasi || '-')}</div></div>
      </div>
      <span class="condition-badge ${conditionClass(condition)}">${escapeHtml(condition)}</span>
    </article>`;
  }).join('');
}

function renderReports() {
  if (!reportPeriodInput.value) return;
  const [year, month] = reportPeriodInput.value.split('-').map(Number);
  const periodEnd = new Date(year, month, 0);
  const periodEndDate = `${year}-${String(month).padStart(2, '0')}-${String(periodEnd.getDate()).padStart(2, '0')}`;
  const periodAssets = assets.filter((asset) => asset.tanggal_pembelian <= periodEndDate);
  const reportRows = periodAssets.map((asset) => ({ asset, depreciation: calculateDepreciation(asset, periodEnd) }));
  const depreciableRows = reportRows.filter((row) => row.depreciation);
  const priorPeriodEnd = new Date(year, month - 1, 0);
  const journalRows = periodAssets.map((asset) => {
    const currentDepreciation = calculateDepreciation(asset, periodEnd);
    const priorDepreciation = calculateDepreciation(asset, priorPeriodEnd);
    const amount = currentDepreciation
      ? Math.max(0, Math.round(currentDepreciation.accumulatedDepreciation) - Math.round(priorDepreciation?.accumulatedDepreciation || 0))
      : 0;
    return { asset, amount };
  }).filter((row) => row.amount > 0);
  const totalAcquisition = periodAssets.reduce((sum, asset) => sum + Number(asset.harga_perolehan || 0), 0);
  const totalDepreciation = depreciableRows.reduce((sum, row) => sum + row.depreciation.accumulatedDepreciation, 0);
  const totalBookValue = depreciableRows.reduce((sum, row) => sum + row.depreciation.bookValue, 0);
  const journalDebitTotal = journalRows.reduce((sum, row) => sum + row.amount, 0);
  const journalCreditTotal = journalRows.reduce((sum, row) => sum + row.amount, 0);
  const isJournalBalanced = journalDebitTotal === journalCreditTotal;
  const reportMonth = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(periodEnd);

  document.querySelector('#report-as-of').textContent = `Periode: ${reportMonth}`;
  document.querySelector('#journal-as-of').textContent = `Periode: ${reportMonth}`;
  document.querySelector('#report-asset-count').textContent = new Intl.NumberFormat('id-ID').format(periodAssets.length);
  document.querySelector('#report-acquisition-total').textContent = rupiah.format(totalAcquisition);
  document.querySelector('#report-depreciation-total').textContent = rupiah.format(totalDepreciation);
  document.querySelector('#report-book-value-total').textContent = rupiah.format(totalBookValue);
  document.querySelector('#report-monthly-total').textContent = rupiah.format(depreciableRows.reduce((sum, row) => sum + row.depreciation.monthlyDepreciation, 0));
  document.querySelector('#journal-debit-total').textContent = rupiah.format(journalDebitTotal);
  document.querySelector('#journal-credit-total').textContent = rupiah.format(journalCreditTotal);
  const journalBalance = document.querySelector('#journal-balance');
  journalBalance.textContent = isJournalBalanced ? 'Seimbang' : 'Tidak seimbang';
  journalBalance.classList.toggle('is-balanced', isJournalBalanced);
  journalBalance.classList.toggle('is-unbalanced', !isJournalBalanced);
  updateDepreciationPostingState(journalRows, journalDebitTotal);

  const assetReportBody = document.querySelector('#asset-report-body');
  const depreciationReportBody = document.querySelector('#depreciation-report-body');
  const depreciationJournalBody = document.querySelector('#depreciation-journal-body');
  if (!reportRows.length) {
    assetReportBody.innerHTML = '<tr><td class="table-message" colspan="7">Belum ada aset pada periode ini.</td></tr>';
  } else {
    assetReportBody.innerHTML = reportRows.map(({ asset, depreciation }) => `<tr>
      <td>${escapeHtml(`AST-${String(asset.id_aset).padStart(4, '0')}`)}</td>
      <td><div class="asset-name">${escapeHtml(asset.nama_aset)}</div></td>
      <td>${escapeHtml(asset.kategori?.nama_kategori || '-')}</td>
      <td>${escapeHtml(asset.lokasi?.nama_lokasi || '-')}</td>
      <td class="price-cell">${escapeHtml(rupiah.format(Number(asset.harga_perolehan)))}</td>
      <td class="price-cell">${depreciation ? escapeHtml(rupiah.format(depreciation.accumulatedDepreciation)) : '<span class="unset-value">Belum diatur</span>'}</td>
      <td class="price-cell">${depreciation ? escapeHtml(rupiah.format(depreciation.bookValue)) : '—'}</td>
    </tr>`).join('');
  }
  if (!depreciableRows.length) {
    depreciationReportBody.innerHTML = '<tr><td class="table-message" colspan="6">Belum ada aset dengan umur manfaat pada periode ini.</td></tr>';
  } else {
    depreciationReportBody.innerHTML = depreciableRows.map(({ asset, depreciation }) => `<tr>
      <td>${escapeHtml(`AST-${String(asset.id_aset).padStart(4, '0')}`)}</td>
      <td><div class="asset-name">${escapeHtml(asset.nama_aset)}</div></td>
      <td>${escapeHtml(asset.umur_manfaat_tahun)} tahun</td>
      <td class="price-cell">${escapeHtml(rupiah.format(depreciation.monthlyDepreciation))}</td>
      <td class="price-cell">${escapeHtml(rupiah.format(depreciation.accumulatedDepreciation))}</td>
      <td class="price-cell">${escapeHtml(rupiah.format(depreciation.bookValue))}</td>
    </tr>`).join('');
  }
  if (!journalRows.length) {
    depreciationJournalBody.innerHTML = '<tr><td class="table-message" colspan="6">Tidak ada beban penyusutan untuk periode ini.</td></tr>';
  } else {
    const journalDate = escapeHtml(dateFormatter.format(periodEnd));
    depreciationJournalBody.innerHTML = journalRows.map(({ asset, amount }) => {
      const assetCode = escapeHtml(`AST-${String(asset.id_aset).padStart(4, '0')}`);
      const assetName = escapeHtml(asset.nama_aset);
      const formattedAmount = escapeHtml(rupiah.format(amount));
      return `<tr class="journal-entry-row">
        <td>${journalDate}</td>
        <td>${assetCode}</td>
        <td>${assetName}</td>
        <td>Beban Penyusutan</td>
        <td class="price-cell">${formattedAmount}</td>
        <td class="price-cell">—</td>
      </tr><tr class="journal-entry-row journal-credit-row">
        <td>${journalDate}</td>
        <td>${assetCode}</td>
        <td>${assetName}</td>
        <td>Akumulasi Penyusutan</td>
        <td class="price-cell">—</td>
        <td class="price-cell">${formattedAmount}</td>
      </tr>`;
    }).join('');
  }
}

function conditionClass(name) {
  if (/rusak/i.test(name)) return 'is-danger';
  if (/perbaikan/i.test(name)) return 'is-warning';
  return '';
}

function getFilteredAssets() {
  const query = searchInput.value.trim().toLocaleLowerCase('id-ID');
  const selectedCondition = conditionFilter.value;
  return assets.filter((asset) => (!selectedCondition || String(asset.kondisi_id) === selectedCondition) && [
    asset.nama_aset,
    asset.kategori?.nama_kategori,
    asset.lokasi?.nama_lokasi,
    asset.kondisi?.nama_kondisi,
    String(asset.id_aset),
  ].some((value) => String(value || '').toLocaleLowerCase('id-ID').includes(query)));
}

function openAssetDetail(id) {
  const asset = assets.find((item) => String(item.id_aset) === String(id));
  if (!asset) return;

  const [year, month] = reportPeriodInput.value.split('-').map(Number);
  const asOf = new Date(year, month, 0);
  const depreciation = calculateDepreciation(asset, asOf);
  const purchaseDate = new Date(`${asset.tanggal_pembelian}T00:00:00`);
  const hasValidPurchaseDate = !Number.isNaN(purchaseDate.getTime());
  const depreciationStart = hasValidPurchaseDate
    ? new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' })
      .format(new Date(purchaseDate.getFullYear(), purchaseDate.getMonth() + 1, 1))
    : '—';
  const condition = asset.kondisi?.nama_kondisi || '-';
  const setDetail = (selector, value) => {
    document.querySelector(selector).textContent = value;
  };

  setDetail('#asset-detail-title', asset.nama_aset);
  setDetail('#detail-asset-code', `AST-${String(asset.id_aset).padStart(4, '0')}`);
  setDetail('#detail-asset-id', `${asset.id_aset}`);
  setDetail('#detail-asset-name', asset.nama_aset);
  setDetail('#detail-category', asset.kategori?.nama_kategori || '-');
  setDetail('#detail-location', asset.lokasi?.nama_lokasi || '-');
  const conditionBadge = document.querySelector('#detail-condition');
  conditionBadge.className = `condition-badge ${conditionClass(condition)}`;
  conditionBadge.textContent = condition;
  setDetail('#detail-purchase-date', hasValidPurchaseDate ? dateFormatter.format(purchaseDate) : '—');
  setDetail('#detail-acquisition-cost', rupiah.format(Number(asset.harga_perolehan)));
  setDetail('#detail-useful-life', asset.umur_manfaat_tahun ? `${asset.umur_manfaat_tahun} tahun` : 'Belum diatur');
  setDetail('#detail-residual-value', rupiah.format(Number(asset.nilai_residu || 0)));
  setDetail('#detail-depreciation-start', depreciationStart);
  setDetail('#detail-monthly-depreciation', depreciation ? rupiah.format(depreciation.monthlyDepreciation) : 'Belum tersedia');
  setDetail('#detail-accumulated-depreciation', depreciation ? rupiah.format(depreciation.accumulatedDepreciation) : 'Belum tersedia');
  setDetail('#detail-book-value', depreciation ? rupiah.format(depreciation.bookValue) : 'Belum tersedia');
  setDetail('#detail-as-of', dateFormatter.format(asOf));
  assetDetailDialog.showModal();
}

function renderAssets() {
  const filteredAssets = getFilteredAssets();

  if (!filteredAssets.length) {
    const message = assets.length ? 'Coba kata kunci lain.' : 'Tambahkan aset pertama untuk memulai pencatatan.';
    assetTableBody.innerHTML = `<tr><td class="table-message" colspan="10"><span class="empty-state"><strong>${assets.length ? 'Aset tidak ditemukan' : 'Belum ada data aset'}</strong>${message}</span></td></tr>`;
  } else {
    assetTableBody.innerHTML = filteredAssets.map((asset) => {
      const assetCode = `AST-${String(asset.id_aset).padStart(4, '0')}`;
      const purchaseDate = dateFormatter.format(new Date(`${asset.tanggal_pembelian}T00:00:00`));
      const condition = asset.kondisi?.nama_kondisi || '-';
      const depreciation = calculateDepreciation(asset);
      return `<tr>
        <td><button class="asset-name asset-detail-link" type="button" data-action="detail" data-id="${asset.id_aset}" aria-label="Lihat detail ${escapeHtml(asset.nama_aset)}">${escapeHtml(asset.nama_aset)}</button><div class="asset-id">${escapeHtml(assetCode)}</div></td>
        <td class="category-name">${escapeHtml(asset.kategori?.nama_kategori || '-')}</td>
        <td>${escapeHtml(asset.lokasi?.nama_lokasi || '-')}</td>
        <td><span class="condition-badge ${conditionClass(condition)}">${escapeHtml(condition)}</span></td>
        <td class="date-cell">${escapeHtml(purchaseDate)}</td>
        <td class="price-cell">${escapeHtml(rupiah.format(Number(asset.harga_perolehan)))}</td>
        <td>${asset.umur_manfaat_tahun ? `${escapeHtml(asset.umur_manfaat_tahun)} tahun` : '<span class="unset-value">Belum diatur</span>'}</td>
        <td class="price-cell">${depreciation ? escapeHtml(rupiah.format(depreciation.monthlyDepreciation)) : '—'}</td>
        <td class="price-cell">${depreciation ? escapeHtml(rupiah.format(depreciation.bookValue)) : '—'}</td>
        <td><div class="row-actions"><button class="row-detail-button" type="button" data-action="detail" data-id="${asset.id_aset}" aria-label="Detail ${escapeHtml(asset.nama_aset)}">Detail</button><button class="row-button" type="button" data-action="edit" data-id="${asset.id_aset}" aria-label="Edit ${escapeHtml(asset.nama_aset)}" title="Edit">✎</button><button class="row-button delete" type="button" data-action="delete" data-id="${asset.id_aset}" aria-label="Hapus ${escapeHtml(asset.nama_aset)}" title="Hapus">⌫</button></div></td>
      </tr>`;
    }).join('');
  }
  document.querySelector('#result-count').textContent = `${filteredAssets.length} dari ${assets.length} aset`;
}

function csvCell(value) {
  let text = String(value ?? '');
  if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function exportAssetsCsv() {
  const filteredAssets = getFilteredAssets();
  if (!filteredAssets.length) {
    showToast('Tidak ada data untuk diekspor.', true);
    return;
  }

  const rows = [
    ['ID Aset', 'Nama Aset', 'Kategori Aset', 'Lokasi', 'Kondisi Aset', 'Tanggal Pembelian', 'Harga Perolehan (Rp)', 'Umur Manfaat (Tahun)', 'Nilai Residu (Rp)', 'Penyusutan per Bulan (Rp)', 'Akumulasi Penyusutan (Rp)', 'Nilai Buku (Rp)'],
    ...filteredAssets.map((asset) => {
      const depreciation = calculateDepreciation(asset);
      return [
        `AST-${String(asset.id_aset).padStart(4, '0')}`,
        asset.nama_aset,
        asset.kategori?.nama_kategori || '',
        asset.lokasi?.nama_lokasi || '',
        asset.kondisi?.nama_kondisi || '',
        asset.tanggal_pembelian,
        Number(asset.harga_perolehan),
        asset.umur_manfaat_tahun || '',
        Number(asset.nilai_residu || 0),
        depreciation ? Math.round(depreciation.monthlyDepreciation) : '',
        depreciation ? Math.round(depreciation.accumulatedDepreciation) : '',
        depreciation ? Math.round(depreciation.bookValue) : '',
      ];
    }),
  ];
  const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(';')).join('\r\n')}`;
  const downloadUrl = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const downloadLink = document.createElement('a');
  downloadLink.href = downloadUrl;
  downloadLink.download = `aset-catering-${new Date().toISOString().slice(0, 10)}.csv`;
  downloadLink.click();
  window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
  showToast(`${filteredAssets.length} aset diekspor ke CSV.`);
}

function showToast(message, isError = false) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.toggle('error', isError);
  toast.classList.add('visible');
  toastTimer = window.setTimeout(() => toast.classList.remove('visible'), 3200);
}

function openDialog(asset = null) {
  editingId = asset?.id_aset ?? null;
  assetForm.reset();
  formError.hidden = true;
  formError.textContent = '';
  document.querySelector('#dialog-kicker').textContent = asset ? 'UBAH DATA ASET' : 'ASET BARU';
  document.querySelector('#dialog-title').textContent = asset ? 'Edit aset' : 'Tambah aset';
  document.querySelector('.save-label').textContent = asset ? 'Simpan perubahan' : 'Simpan aset';
  document.querySelector('#save-button').disabled = Boolean(referenceLoadError);
  if (referenceLoadError) {
    formError.textContent = referenceLoadError;
    formError.hidden = false;
  }
  if (asset) {
    for (const field of ['nama_aset', 'kategori_id', 'lokasi_id', 'kondisi_id', 'tanggal_pembelian', 'harga_perolehan', 'umur_manfaat_tahun', 'nilai_residu']) {
      assetForm.elements[field].value = asset[field] ?? asset[{
        kategori_id: 'kategori_id', lokasi_id: 'lokasi_id', kondisi_id: 'kondisi_id',
      }[field]] ?? '';
    }
  }
  assetDialog.showModal();
  assetForm.elements.nama_aset.focus();
}

async function submitAsset(event) {
  event.preventDefault();
  if (referenceLoadError) {
    formError.textContent = referenceLoadError;
    formError.hidden = false;
    return;
  }
  const formData = new FormData(assetForm);
  const payload = Object.fromEntries(formData.entries());
  payload.harga_perolehan = Number(payload.harga_perolehan);
  payload.umur_manfaat_tahun = Number(payload.umur_manfaat_tahun);
  payload.nilai_residu = Number(payload.nilai_residu);
  if (!Number.isInteger(payload.umur_manfaat_tahun) || payload.umur_manfaat_tahun < 1 || payload.umur_manfaat_tahun > 100) {
    formError.textContent = 'Umur manfaat harus antara 1 sampai 100 tahun.';
    formError.hidden = false;
    return;
  }
  if (!Number.isFinite(payload.nilai_residu) || payload.nilai_residu < 0 || payload.nilai_residu > payload.harga_perolehan) {
    formError.textContent = 'Nilai residu harus antara 0 dan harga perolehan.';
    formError.hidden = false;
    return;
  }
  const saveButton = document.querySelector('#save-button');
  saveButton.disabled = true;
  formError.hidden = true;
  try {
    await api(editingId ? `/aset?id_aset=eq.${editingId}` : '/aset', {
      method: editingId ? 'PATCH' : 'POST',
      body: JSON.stringify(payload),
    });
    assetDialog.close();
    showToast(editingId ? 'Perubahan aset berhasil disimpan.' : 'Aset baru berhasil ditambahkan.');
    await loadAssets();
  } catch (error) {
    formError.textContent = friendlyError(error);
    formError.hidden = false;
  } finally {
    saveButton.disabled = false;
  }
}

async function deleteAsset(id) {
  const asset = assets.find((item) => String(item.id_aset) === String(id));
  if (!asset || !window.confirm(`Hapus aset "${asset.nama_aset}"? Tindakan ini tidak dapat dibatalkan.`)) return;
  try {
    await api(`/aset?id_aset=eq.${id}`, { method: 'DELETE' });
    showToast('Aset berhasil dihapus.');
    await loadAssets();
  } catch (error) {
    showToast(friendlyError(error), true);
  }
}

document.querySelector('#today-label').textContent = new Intl.DateTimeFormat('id-ID', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
}).format(new Date());
function activateView() {
  const requestedView = location.hash.slice(1);
  const activeView = ['dashboard', 'data-aset', 'data-akun', 'saldo-awal', 'jurnal-perolehan', 'jurnal-penyusutan', 'buku-besar', 'laporan'].includes(requestedView) ? requestedView : 'dashboard';
  document.querySelectorAll('.page-view').forEach((view) => {
    view.hidden = view.id !== activeView;
  });
  document.querySelectorAll('.primary-nav .nav-link').forEach((link) => {
    link.classList.toggle('active', link.hash === `#${activeView}`);
  });
  if (activeView === 'data-akun') loadAccounts();
  if (activeView === 'saldo-awal') loadOpeningBalancePage();
  if (activeView === 'jurnal-perolehan') loadAcquisitionPage();
  if (activeView === 'jurnal-penyusutan') loadDepreciationPostingData();
  if (activeView === 'buku-besar') loadLedgerPage();
}
window.addEventListener('hashchange', activateView);
activateView();
const currentDate = new Date();
reportPeriodInput.value = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
journalPeriodInput.value = reportPeriodInput.value;
ledgerPeriodInput.value = reportPeriodInput.value;
document.querySelector('#add-asset-button').addEventListener('click', () => openDialog());
document.querySelector('#add-asset-from-list').addEventListener('click', () => openDialog());
document.querySelector('#add-account-button').addEventListener('click', () => openAccountDialog());
document.querySelector('#close-dialog-button').addEventListener('click', () => assetDialog.close());
document.querySelector('#cancel-dialog-button').addEventListener('click', () => assetDialog.close());
document.querySelector('#close-account-dialog-button').addEventListener('click', () => accountDialog.close());
document.querySelector('#cancel-account-dialog-button').addEventListener('click', () => accountDialog.close());
document.querySelector('#close-asset-detail-button').addEventListener('click', () => assetDetailDialog.close());
document.querySelector('#close-asset-detail-action').addEventListener('click', () => assetDetailDialog.close());
document.querySelector('#refresh-button').addEventListener('click', loadAssets);
document.querySelector('#refresh-accounts-button').addEventListener('click', loadAccounts);
document.querySelector('#export-button').addEventListener('click', exportAssetsCsv);
searchInput.addEventListener('input', renderAssets);
conditionFilter.addEventListener('change', renderAssets);
accountSearchInput.addEventListener('input', renderAccounts);
accountTypeFilter.addEventListener('change', renderAccounts);
openingBalanceBody.addEventListener('input', () => updateOpeningBalanceTotals(
  openingBalanceJournals.find((journal) => journal.jenis_jurnal === 'Saldo Awal'),
));
openingBalanceForm.addEventListener('submit', submitOpeningBalance);
journalPeriodInput.addEventListener('change', () => {
  reportPeriodInput.value = journalPeriodInput.value;
  renderReports();
});
reportPeriodInput.addEventListener('change', () => {
  journalPeriodInput.value = reportPeriodInput.value;
  renderReports();
});
document.querySelector('#print-report-button').addEventListener('click', () => window.print());
document.querySelector('#print-journal-button').addEventListener('click', () => window.print());
document.querySelector('#print-ledger-button').addEventListener('click', () => window.print());
document.querySelector('#post-depreciation-button').addEventListener('click', postDepreciationJournal);
depreciationExpenseAccountSelect.addEventListener('change', () => renderReports());
depreciationAccumulatedAccountSelect.addEventListener('change', () => renderReports());
ledgerPeriodInput.addEventListener('change', renderLedger);
assetForm.addEventListener('submit', submitAsset);
accountForm.addEventListener('submit', submitAccount);
acquisitionAssetSelect.addEventListener('change', renderAcquisitionPreview);
acquisitionForm.addEventListener('submit', submitAcquisitionJournal);
accountTableBody.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-account-action]');
  if (!button) return;
  if (button.dataset.accountAction === 'edit') {
    const account = accounts.find((item) => String(item.id_akun) === button.dataset.id);
    if (account) openAccountDialog(account);
  } else if (button.dataset.accountAction === 'toggle') {
    toggleAccountStatus(button.dataset.id);
  }
});
assetTableBody.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  if (button.dataset.action === 'detail') {
    openAssetDetail(button.dataset.id);
  } else if (button.dataset.action === 'edit') {
    const asset = assets.find((item) => String(item.id_aset) === button.dataset.id);
    if (asset) openDialog(asset);
  } else if (button.dataset.action === 'delete') {
    deleteAsset(button.dataset.id);
  }
});
document.addEventListener('keydown', (event) => {
  if (event.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
    event.preventDefault();
    searchInput.focus();
  }
});

document.querySelector('#demo-login-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const loginForm = event.currentTarget;
  const errorMessage = document.querySelector('#demo-login-error');
  const username = loginForm.elements.username.value.trim();
  const password = loginForm.elements.password.value;
  if (username !== DEMO_USERNAME || password !== DEMO_PASSWORD) {
    errorMessage.textContent = 'Username atau password tidak sesuai.';
    errorMessage.hidden = false;
    return;
  }
  errorMessage.hidden = true;
  document.querySelector('#demo-login').hidden = true;
  document.querySelector('#app-shell').hidden = false;
  document.querySelector('.primary-nav .nav-link.active')?.focus();
});

document.querySelector('#demo-logout-button').addEventListener('click', () => {
  document.querySelector('#app-shell').hidden = true;
  document.querySelector('#demo-login').hidden = false;
  document.querySelector('#demo-login-error').hidden = true;
  document.querySelector('#demo-username').focus();
});

(async function initialize() {
  try {
    await loadReferences();
    await loadAssets();
  } catch (error) {
    assetTableBody.innerHTML = `<tr><td class="table-message" colspan="10">${escapeHtml(error.message)}</td></tr>`;
    document.querySelector('#result-count').textContent = 'Referensi gagal dimuat';
    showToast(error.message, true);
  }
})();
