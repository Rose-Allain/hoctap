const API_ROOT = '/api/admin';
const KEY_STORAGE = 'rideform-admin-key';
const INVOICE_STATUS_LABELS = {
  draft: 'Bản nháp', pending: 'Chờ xác nhận', confirmed: 'Đã xác nhận', processing: 'Đang xử lý',
  shipped: 'Đang giao', delivered: 'Đã giao', cancelled: 'Đã hủy', refunded: 'Đã hoàn tiền',
};
const PAYMENT_STATUS_LABELS = { pending: 'Chưa thanh toán', partial: 'Thanh toán một phần', paid: 'Đã thanh toán', refunded: 'Đã hoàn tiền' };
const PAYMENT_METHOD_LABELS = { cash: 'Tiền mặt', bank_transfer: 'Chuyển khoản', card: 'Thẻ', e_wallet: 'Ví điện tử', cod: 'Thu hộ (COD)', other: 'Khác' };

const state = { key: '', products: [], invoices: [], lookups: { categories: [], brands: [], suppliers: [] }, catalogType: 'brands', catalogRecords: [], toastTimer: null, reopenInvoiceId: null };
const accessScreen = document.querySelector('#access-screen');
const adminApp = document.querySelector('#admin-app');
const accessForm = document.querySelector('#access-form');
const accessKeyInput = document.querySelector('#admin-key');
const accessError = document.querySelector('#access-error');
const productDialog = document.querySelector('#product-dialog');
const catalogDialog = document.querySelector('#catalog-dialog');
const catalogForm = document.querySelector('#catalog-form');
const catalogListPanel = document.querySelector('#catalog-list-panel');
const catalogList = document.querySelector('#catalog-list');
const catalogEmpty = document.querySelector('#catalog-empty');
const invoiceDialog = document.querySelector('#invoice-dialog');
const paymentDialog = document.querySelector('#payment-dialog');
const productForm = document.querySelector('#product-form');
const invoiceForm = document.querySelector('#invoice-form');
const paymentForm = document.querySelector('#payment-form');

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function formatMoney(value) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 })
    .format(Number(value) || 0);
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

function statusPill(status, label, extraClass = '') {
  return `<span class="status-pill status-pill--${escapeHtml(status)} ${extraClass}">${escapeHtml(label)}</span>`;
}

function showToast(message, isError = false) {
  const toast = document.querySelector('#toast');
  toast.textContent = message;
  toast.classList.toggle('is-error', isError);
  toast.classList.add('is-visible');
  window.clearTimeout(state.toastTimer);
  state.toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 3300);
}

function showAccessError(message) {
  accessError.textContent = message;
  accessError.hidden = false;
}

function clearAccess() {
  state.key = '';
  sessionStorage.removeItem(KEY_STORAGE);
  adminApp.hidden = true;
  accessScreen.hidden = false;
  accessKeyInput.value = '';
  accessKeyInput.focus();
}

async function adminFetch(path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set('x-admin-key', state.key);
  if (options.body) headers.set('content-type', 'application/json');
  let response;
  try {
    response = await fetch(`${API_ROOT}${path}`, { ...options, headers });
  } catch (_error) {
    throw new Error('Không kết nối được máy chủ. Hãy kiểm tra máy chủ Node.js và PostgreSQL.');
  }
  const payload = await response.json().catch(() => ({}));
  if (response.status === 401) {
    clearAccess();
    throw new Error(payload.message || 'Khóa quản trị không hợp lệ.');
  }
  if (!response.ok) throw new Error(payload.message || 'Yêu cầu không thành công.');
  return payload;
}

async function connectToAdmin() {
  accessError.hidden = true;
  try {
    await adminFetch('/summary');
    sessionStorage.setItem(KEY_STORAGE, state.key);
    accessScreen.hidden = true;
    adminApp.hidden = false;
    await loadAll();
  } catch (error) {
    if (!adminApp.hidden) clearAccess();
    showAccessError(error.message);
  }
}

async function loadAll() {
  try {
    const [summary, products, invoices, lookups] = await Promise.all([
      adminFetch('/summary'), adminFetch('/products'), adminFetch('/invoices'), adminFetch('/lookups'),
    ]);
    state.products = products.data || [];
    state.invoices = invoices.data || [];
    state.lookups = lookups;
    renderSummary(summary);
    renderProducts();
    renderInvoices();
    renderOverview();
    populateLookupSelects();
    setTodayLabel();
  } catch (error) {
    showToast(error.message, true);
  }
}

function setTodayLabel() {
  const now = new Date();
  document.querySelector('#today-label').textContent = new Intl.DateTimeFormat('vi-VN', {
    weekday: 'short', day: '2-digit', month: 'long', year: 'numeric',
  }).format(now);
  const eyebrow = document.querySelector('#view-overview .view-heading .admin-eyebrow');
  eyebrow.textContent = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    .format(now).toUpperCase();
}

function renderSummary(summary) {
  document.querySelector('#metric-products').textContent = Number(summary.products.total || 0).toLocaleString('vi-VN');
  document.querySelector('#metric-active-products').textContent = `${Number(summary.products.active || 0).toLocaleString('vi-VN')} sản phẩm đang bán`;
  document.querySelector('#metric-invoices').textContent = Number(summary.invoices || 0).toLocaleString('vi-VN');
  document.querySelector('#metric-revenue').textContent = formatMoney(summary.revenue);
  document.querySelector('#metric-low-stock').textContent = Number(summary.lowStock || 0).toLocaleString('vi-VN');
}

function renderProducts() {
  const query = document.querySelector('#product-search').value.trim().toLocaleLowerCase('vi');
  const filter = document.querySelector('#product-status-filter').value;
  const rows = state.products.filter((product) => {
    const searchable = [product.name, product.sku, product.category_name, product.brand_name].filter(Boolean).join(' ').toLocaleLowerCase('vi');
    const statusMatch = filter === 'all' || (filter === 'inactive' ? !product.is_active : product.is_active && product.status === filter);
    return statusMatch && (!query || searchable.includes(query));
  });
  document.querySelector('#product-count').textContent = `${rows.length} sản phẩm`;
  document.querySelector('#product-empty').hidden = rows.length > 0;
  document.querySelector('#product-table-body').innerHTML = rows.map((product) => {
    const status = !product.is_active ? statusPill('inactive', 'Đã ẩn')
      : statusPill(product.status, product.status === 'draft' ? 'Bản nháp' : product.status === 'discontinued' ? 'Ngừng bán' : 'Đang bán');
    const stock = Number(product.stock_quantity) || 0;
    return `<tr>
      <td><div class="product-cell"><span class="product-cell__art">R/F</span><div class="product-cell__text"><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(product.brand_name || 'Chưa có thương hiệu')}</small></div></div></td>
      <td>${escapeHtml(product.sku)}</td><td>${escapeHtml(product.category_name || 'Chưa phân loại')}</td>
      <td><span class="stock-value ${stock <= 5 ? 'stock-value--low' : ''}">${stock.toLocaleString('vi-VN')}</span></td>
      <td><strong>${formatMoney(product.price)}</strong></td><td>${status}</td>
      <td><div class="row-actions"><button class="row-action" type="button" data-product-edit="${product.id}" aria-label="Sửa sản phẩm" title="Sửa">↗</button>${product.is_active ? `<button class="row-action row-action--danger" type="button" data-product-archive="${product.id}" aria-label="Ẩn sản phẩm" title="Ẩn khỏi cửa hàng">×</button>` : ''}</div></td>
    </tr>`;
  }).join('');
}

function renderInvoices() {
  const query = document.querySelector('#invoice-search').value.trim().toLocaleLowerCase('vi');
  const filter = document.querySelector('#invoice-status-filter').value;
  const rows = state.invoices.filter((invoice) => {
    const searchable = [invoice.invoice_code, invoice.customer_name, invoice.customer_email, invoice.customer_phone].filter(Boolean).join(' ').toLocaleLowerCase('vi');
    return (filter === 'all' || invoice.status === filter) && (!query || searchable.includes(query));
  });
  document.querySelector('#invoice-count').textContent = `${rows.length} hóa đơn`;
  document.querySelector('#invoice-empty').hidden = rows.length > 0;
  document.querySelector('#invoice-table-body').innerHTML = rows.map((invoice) => `
    <tr>
      <td><strong>${escapeHtml(invoice.invoice_code)}</strong><small>${Number(invoice.item_count) || 0} dòng hàng</small></td>
      <td><strong>${escapeHtml(invoice.customer_name)}</strong><small>${escapeHtml(invoice.customer_phone || invoice.customer_email || 'Khách lẻ')}</small></td>
      <td>${formatDate(invoice.created_at)}</td><td>${Number(invoice.item_count) || 0} món</td>
      <td>${statusPill(invoice.payment_status, PAYMENT_STATUS_LABELS[invoice.payment_status] || invoice.payment_status)}</td>
      <td>${statusPill(invoice.status, INVOICE_STATUS_LABELS[invoice.status] || invoice.status)}</td>
      <td><strong>${formatMoney(invoice.total_amount)}</strong></td>
      <td><div class="row-actions"><button class="row-action" type="button" data-invoice-edit="${invoice.id}" aria-label="Mở hóa đơn" title="Xem / sửa">↗</button>${['cancelled', 'refunded'].includes(invoice.status) || Number(invoice.paid_amount) >= Number(invoice.total_amount) ? '' : `<button class="row-action" type="button" data-invoice-payment="${invoice.id}" aria-label="Ghi nhận thanh toán" title="Ghi nhận thanh toán">₫</button>`}<button class="row-action row-action--danger" type="button" data-invoice-archive="${invoice.id}" aria-label="Lưu trữ hóa đơn" title="Lưu trữ">×</button></div></td>
    </tr>`).join('');
}

function renderOverview() {
  const products = [...state.products].sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at)).slice(0, 4);
  document.querySelector('#overview-products').innerHTML = products.length ? products.map((product) => `
    <div class="overview-row"><div class="overview-row__main"><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(product.sku)} · ${escapeHtml(product.category_name || 'Chưa phân loại')}</small></div><div class="overview-row__aside">${formatMoney(product.price)}<small>${Number(product.stock_quantity) || 0} trong kho</small></div></div>`).join('') : '<div class="overview-empty">Chưa có sản phẩm trong cửa hàng.</div>';
  const invoices = state.invoices.slice(0, 4);
  document.querySelector('#overview-invoices').innerHTML = invoices.length ? invoices.map((invoice) => `
    <div class="overview-row"><div class="overview-row__main"><strong>${escapeHtml(invoice.invoice_code)} · ${escapeHtml(invoice.customer_name)}</strong><small>${formatDate(invoice.created_at)} · ${INVOICE_STATUS_LABELS[invoice.status] || invoice.status}</small></div><div class="overview-row__aside">${formatMoney(invoice.total_amount)}</div></div>`).join('') : '<div class="overview-empty">Chưa có hóa đơn mới.</div>';
}

function populateLookupSelects() {
  const sets = [
    ['#product-category', state.lookups.categories, 'Chưa phân loại'],
    ['#product-brand', state.lookups.brands, 'Chọn thương hiệu'],
    ['#product-supplier', state.lookups.suppliers, 'Chọn nhà cung cấp'],
  ];
  for (const [selector, records, placeholder] of sets) {
    const select = document.querySelector(selector);
    const selected = select.value;
    select.innerHTML = '<option value="">' + placeholder + '</option>' + records.map((record) => (
      '<option value="' + record.id + '" ' + (record.is_active === false ? 'disabled' : '') + '>'
      + escapeHtml(record.name) + (record.is_active === false ? ' (ngừng dùng)' : '') + '</option>'
    )).join('');
    select.value = selected;
    if (!productForm.elements.id.value && select.selectedOptions[0]?.disabled) select.value = '';
  }
}

function catalogMeta(type = state.catalogType) {
  const labels = {
    categories: { label: 'danh mục', title: 'Danh mục', eyebrow: 'CATEGORY MANAGEMENT' },
    brands: { label: 'thương hiệu', title: 'Thương hiệu', eyebrow: 'BRAND MANAGEMENT' },
    suppliers: { label: 'nhà cung cấp', title: 'Nhà cung cấp', eyebrow: 'SUPPLIER MANAGEMENT' },
  };
  return labels[type] || labels.suppliers;
}

async function refreshCatalogRecords() {
  const result = await adminFetch('/catalog/' + state.catalogType);
  state.catalogRecords = result.data || [];
  renderCatalogRecords();
}

async function openCatalogManager(type) {
  state.catalogType = type;
  const meta = catalogMeta(type);
  document.querySelector('#catalog-dialog-eyebrow').textContent = meta.eyebrow;
  document.querySelector('#catalog-dialog-title').textContent = 'Quản lý ' + meta.title.toLocaleLowerCase('vi');
  document.querySelector('#catalog-dialog-description').textContent = 'Thêm, sửa hoặc xóa ' + meta.label + '. Mục đã xóa vẫn được giữ trong lịch sử sản phẩm.';
  document.querySelector('#catalog-add-button').textContent = '＋ Thêm ' + meta.label;
  catalogForm.hidden = true;
  catalogListPanel.hidden = false;
  try {
    await refreshCatalogRecords();
    catalogDialog.showModal();
  } catch (error) {
    showToast(error.message, true);
  }
}

function renderCatalogRecords() {
  const meta = catalogMeta();
  const activeCount = state.catalogRecords.filter((record) => record.is_active).length;
  document.querySelector('#catalog-count').textContent = activeCount + ' đang dùng · ' + state.catalogRecords.length + ' mục';
  catalogEmpty.hidden = state.catalogRecords.length > 0;
  catalogList.innerHTML = state.catalogRecords.map((record) => {
    const detail = state.catalogType === 'categories'
      ? [record.slug, record.description].filter(Boolean).join(' · ')
      : state.catalogType === 'suppliers'
        ? [record.contact_name, record.phone, record.email].filter(Boolean).join(' · ')
        : record.description || '';
    const actions = record.is_active
      ? '<button class="admin-button admin-button--quiet" type="button" data-catalog-edit="' + record.id + '">Sửa</button><button class="admin-button admin-button--quiet catalog-delete-button" type="button" data-catalog-delete="' + record.id + '">Xóa</button>'
      : '<button class="admin-button admin-button--quiet" type="button" data-catalog-edit="' + record.id + '">Sửa</button><button class="admin-button admin-button--quiet" type="button" data-catalog-restore="' + record.id + '">Khôi phục</button>';
    const status = record.is_active ? '' : '<span class="catalog-status">Đã ngừng dùng</span>';
    const emptyDetail = record.is_active ? 'Không có thông tin ' + meta.label + '.' : 'Không xuất hiện trong lựa chọn sản phẩm mới.';
    return '<article class="catalog-row"><div class="catalog-row__info"><strong>' + escapeHtml(record.name) + status
      + '</strong><small>' + escapeHtml(detail || emptyDetail) + '</small></div><div class="catalog-row__actions">'
      + actions + '</div></article>';
  }).join('');
}

function openCatalogEditor(record = null) {
  const meta = catalogMeta();
  catalogForm.reset();
  catalogForm.elements.name.maxLength = state.catalogType === 'suppliers' ? 200 : 150;
  catalogForm.elements.id.value = record?.id || '';
  catalogForm.elements.name.value = record?.name || '';
  catalogForm.elements.is_active.checked = record ? Boolean(record.is_active) : true;
  document.querySelector('#catalog-extra-fields').innerHTML = state.catalogType === 'categories'
    ? '<label class="field field--wide">Slug<input name="slug" maxlength="180" placeholder="vi-du-danh-muc" /></label><label class="field field--wide">Mô tả<textarea name="description" rows="3" maxlength="10000" placeholder="Mô tả danh mục"></textarea></label>'
    : state.catalogType === 'brands'
      ? '<label class="field field--wide">Mô tả<textarea name="description" rows="3" maxlength="10000" placeholder="Thông tin về thương hiệu"></textarea></label>'
      : '<label class="field">Người liên hệ<input name="contact_name" maxlength="200" /></label><label class="field">Email<input name="email" type="email" maxlength="255" /></label><label class="field">Số điện thoại<input name="phone" maxlength="30" /></label><label class="field field--wide">Địa chỉ<textarea name="address" rows="2" maxlength="2000"></textarea></label><label class="field field--wide">Ghi chú<textarea name="notes" rows="3" maxlength="10000"></textarea></label>';
  if (record) {
    for (const field of ['slug', 'description', 'contact_name', 'email', 'phone', 'address', 'notes']) {
      if (catalogForm.elements[field]) catalogForm.elements[field].value = record[field] || '';
    }
  }
  document.querySelector('#catalog-dialog-title').textContent = (record ? 'Sửa ' : 'Thêm ') + meta.label;
  document.querySelector('#catalog-save-button').textContent = record ? 'Lưu thay đổi' : 'Thêm mới';
  catalogListPanel.hidden = true;
  catalogForm.hidden = false;
  catalogForm.elements.name.focus();
}

function showCatalogList() {
  const meta = catalogMeta();
  document.querySelector('#catalog-dialog-title').textContent = 'Quản lý ' + meta.title.toLocaleLowerCase('vi');
  catalogForm.reset();
  catalogForm.hidden = true;
  catalogListPanel.hidden = false;
}

async function submitCatalog(event) {
  event.preventDefault();
  const button = document.querySelector('#catalog-save-button');
  const id = catalogForm.elements.id.value;
  const payload = Object.fromEntries(new FormData(catalogForm).entries());
  delete payload.id;
  payload.is_active = catalogForm.elements.is_active.checked;
  button.disabled = true;
  try {
    await adminFetch('/catalog/' + state.catalogType + (id ? '/' + id : ''), {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(payload),
    });
    await loadAll();
    await refreshCatalogRecords();
    showCatalogList();
    showToast(id ? 'Đã cập nhật ' + catalogMeta().label + '.' : 'Đã thêm ' + catalogMeta().label + '.');
  } catch (error) {
    showToast(error.message, true);
  } finally {
    button.disabled = false;
  }
}

async function handleCatalogAction(event) {
  const editButton = event.target.closest('[data-catalog-edit]');
  const deleteButton = event.target.closest('[data-catalog-delete]');
  const restoreButton = event.target.closest('[data-catalog-restore]');
  const button = editButton || deleteButton || restoreButton;
  if (!button) return;
  const recordId = button.dataset.catalogEdit || button.dataset.catalogDelete || button.dataset.catalogRestore;
  const record = state.catalogRecords.find((item) => String(item.id) === recordId);
  if (!record) return;
  if (editButton) {
    openCatalogEditor(record);
    return;
  }
  const meta = catalogMeta();
  const restoring = Boolean(restoreButton);
  if (!restoring && !window.confirm('Xóa ' + meta.label + ' “' + record.name + '” khỏi các lựa chọn mới? Sản phẩm đã gắn vẫn giữ nguyên dữ liệu.')) return;
  try {
    if (restoring) {
      const payload = { ...record, is_active: true };
      await adminFetch('/catalog/' + state.catalogType + '/' + record.id, { method: 'PUT', body: JSON.stringify(payload) });
    } else {
      await adminFetch('/catalog/' + state.catalogType + '/' + record.id, { method: 'DELETE' });
    }
    await loadAll();
    await refreshCatalogRecords();
    showToast(restoring ? 'Đã khôi phục ' + meta.label + '.' : 'Đã xóa ' + meta.label + '; dữ liệu lịch sử được giữ lại.');
  } catch (error) {
    showToast(error.message, true);
  }
}

function setView(view) {
  for (const section of document.querySelectorAll('.admin-view')) section.hidden = section.id !== `view-${view}`;
  for (const button of document.querySelectorAll('.admin-nav__item')) button.classList.toggle('is-active', button.dataset.view === view);
  const labels = { overview: 'Tổng quan', products: 'Sản phẩm', invoices: 'Hóa đơn' };
  document.querySelector('#breadcrumb-current').textContent = labels[view] || 'Tổng quan';
}

function openProduct(product = null) {
  productForm.reset();
  populateLookupSelects();
  productForm.elements.id.value = product?.id || '';
  productForm.elements.name.value = product?.name || '';
  productForm.elements.sku.value = product?.sku || '';
  productForm.elements.category_id.value = product?.category_id || '';
  productForm.elements.brand_id.value = product?.brand_id || '';
  productForm.elements.supplier_id.value = product?.supplier_id || '';
  productForm.elements.price.value = product?.price ?? '';
  productForm.elements.cost_price.value = product?.cost_price ?? '';
  productForm.elements.stock_quantity.value = product?.stock_quantity ?? 0;
  productForm.elements.status.value = product?.status || 'active';
  productForm.elements.is_active.checked = product ? Boolean(product.is_active) : true;
  productForm.elements.image_url.value = product?.image_url || '';
  productForm.elements.description.value = product?.description || '';
  document.querySelector('#product-dialog-title').textContent = product ? 'Chỉnh sửa sản phẩm' : 'Thêm sản phẩm';
  productDialog.showModal();
}

function activeProducts() {
  return state.products.filter((product) => product.is_active && product.status === 'active');
}

function addInvoiceLine(value = {}) {
  const row = document.createElement('div');
  row.className = 'invoice-line';
  row.dataset.invoiceLine = '';
  const productField = document.createElement('label');
  productField.className = 'field';
  productField.textContent = 'Sản phẩm';
  const productSelect = document.createElement('select');
  productSelect.className = 'invoice-product-select';
  productSelect.required = true;
  const prompt = document.createElement('option');
  prompt.value = '';
  prompt.textContent = 'Chọn sản phẩm';
  productSelect.append(prompt);
  const products = [...activeProducts()];
  if (value.product_id && !products.some((product) => String(product.id) === String(value.product_id))) {
    const unavailable = state.products.find((product) => String(product.id) === String(value.product_id));
    if (unavailable) products.unshift(unavailable);
  }
  products.forEach((product) => {
    const option = document.createElement('option');
    option.value = String(product.id);
    option.textContent = `${product.name} · ${product.sku}${product.is_active ? '' : ' · đã ẩn'}`;
    productSelect.append(option);
  });
  productSelect.value = value.product_id || '';
  productField.append(productSelect);

  const quantityField = document.createElement('label');
  quantityField.className = 'field';
  quantityField.textContent = 'Số lượng';
  const quantityInput = document.createElement('input');
  quantityInput.className = 'invoice-quantity';
  quantityInput.type = 'number';
  quantityInput.min = '1';
  quantityInput.step = '1';
  quantityInput.required = true;
  quantityInput.value = value.quantity || 1;
  quantityField.append(quantityInput);

  const remove = document.createElement('button');
  remove.className = 'invoice-line__remove';
  remove.type = 'button';
  remove.dataset.removeInvoiceLine = '';
  remove.setAttribute('aria-label', 'Xóa dòng sản phẩm');
  remove.textContent = '×';
  row.append(productField, quantityField, remove);
  document.querySelector('#invoice-items-list').append(row);
}

function calculateInvoicePreview() {
  const subtotal = [...document.querySelectorAll('.invoice-line')].reduce((total, line) => {
    const productId = line.querySelector('.invoice-product-select').value;
    const product = state.products.find((record) => String(record.id) === productId);
    const count = Number(line.querySelector('.invoice-quantity').value) || 0;
    return total + (Number(product?.price) || 0) * count;
  }, 0);
  const discount = Number(invoiceForm.elements.discount_amount.value) || 0;
  const tax = Number(invoiceForm.elements.tax_amount.value) || 0;
  const shipping = Number(invoiceForm.elements.shipping_fee.value) || 0;
  document.querySelector('#invoice-subtotal').textContent = formatMoney(subtotal);
  document.querySelector('#invoice-discount').textContent = `− ${formatMoney(discount)}`;
  document.querySelector('#invoice-total').textContent = formatMoney(Math.max(0, subtotal - discount + tax + shipping));
}

function renderPayments(payments) {
  const section = document.querySelector('#payment-history-section');
  section.hidden = false;
  const target = document.querySelector('#payment-history');
  target.innerHTML = payments.length ? payments.map((payment) => `
    <div class="payment-history__row"><div><strong>${formatMoney(payment.amount)}</strong><span>${escapeHtml(PAYMENT_METHOD_LABELS[payment.method] || payment.method)} · ${formatDate(payment.paid_at || payment.created_at)}</span></div>${statusPill(payment.status, payment.status === 'completed' ? 'Đã nhận' : payment.status)}</div>`).join('') : '<p class="payment-history__empty">Chưa có khoản thanh toán nào.</p>';
}

function renderStatusHistory(history) {
  const section = document.querySelector('#status-history-section');
  section.hidden = false;
  const target = document.querySelector('#status-history');
  target.innerHTML = history.length ? history.map((entry) => `
    <div class="payment-history__row"><div><strong>${entry.old_status ? `${escapeHtml(INVOICE_STATUS_LABELS[entry.old_status] || entry.old_status)} → ` : ''}${escapeHtml(INVOICE_STATUS_LABELS[entry.new_status] || entry.new_status)}</strong><span>${escapeHtml(entry.note || 'Cập nhật trạng thái')} · ${formatDate(entry.created_at)}</span></div></div>`).join('') : '<p class="payment-history__empty">Chưa có lịch sử trạng thái.</p>';
}

async function openInvoice(invoiceId = null) {
  invoiceForm.reset();
  invoiceForm.elements.id.value = '';
  document.querySelector('#invoice-items-list').replaceChildren();
  document.querySelector('#invoice-code-label').textContent = '';
  document.querySelector('#payment-history-section').hidden = true;
  document.querySelector('#status-history-section').hidden = true;
  document.querySelector('#record-payment-button').hidden = true;
  document.querySelector('#invoice-dialog-title').textContent = invoiceId ? 'Chỉnh sửa hóa đơn' : 'Tạo hóa đơn';
  invoiceForm.elements.status.value = 'pending';
  invoiceForm.elements.discount_amount.value = 0;
  invoiceForm.elements.tax_amount.value = 0;
  invoiceForm.elements.shipping_fee.value = 0;

  if (invoiceId) {
    try {
      const response = await adminFetch(`/invoices/${invoiceId}`);
      const invoice = response.data;
      invoiceForm.elements.id.value = invoice.id;
      invoiceForm.elements.customer_name.value = invoice.customer_name || '';
      invoiceForm.elements.customer_email.value = invoice.customer_email || '';
      invoiceForm.elements.customer_phone.value = invoice.customer_phone || '';
      invoiceForm.elements.billing_address.value = invoice.billing_address || '';
      invoiceForm.elements.shipping_address.value = invoice.shipping_address || '';
      invoiceForm.elements.notes.value = invoice.notes || '';
      invoiceForm.elements.status.value = invoice.status;
      invoiceForm.elements.discount_amount.value = Number(invoice.discount_amount) || 0;
      invoiceForm.elements.tax_amount.value = Number(invoice.tax_amount) || 0;
      invoiceForm.elements.shipping_fee.value = Number(invoice.shipping_fee) || 0;
      document.querySelector('#invoice-dialog-title').textContent = 'Chỉnh sửa hóa đơn';
      document.querySelector('#invoice-code-label').textContent = `${invoice.invoice_code} · ${PAYMENT_STATUS_LABELS[invoice.payment_status] || invoice.payment_status}`;
      invoice.items.forEach((item) => addInvoiceLine({ product_id: item.product_id, quantity: item.quantity }));
      renderPayments(invoice.payments || []);
      renderStatusHistory(invoice.status_history || []);
      const paymentButton = document.querySelector('#record-payment-button');
      paymentButton.hidden = ['cancelled', 'refunded'].includes(invoice.status)
        || invoice.payment_status === 'paid'
        || Number((invoice.payments || []).filter((payment) => payment.status === 'completed').reduce((total, payment) => total + Number(payment.amount), 0)) >= Number(invoice.total_amount);
      paymentButton.dataset.invoiceId = String(invoice.id);
    } catch (error) {
      showToast(error.message, true);
      return;
    }
  } else {
    addInvoiceLine();
  }
  calculateInvoicePreview();
  invoiceDialog.showModal();
}

function openPayment(invoiceId) {
  const invoice = state.invoices.find((record) => String(record.id) === String(invoiceId));
  if (!invoice) return;
  const remaining = Math.max(0, Number(invoice.total_amount) - Number(invoice.paid_amount));
  if (remaining <= 0) {
    showToast('Hóa đơn đã thanh toán đủ.', true);
    return;
  }
  paymentForm.reset();
  paymentForm.elements.invoice_id.value = invoice.id;
  document.querySelector('#payment-invoice-label').textContent = `${invoice.invoice_code} · ${invoice.customer_name} · Còn lại ${formatMoney(remaining)}`;
  if (invoiceDialog.open) invoiceDialog.close();
  paymentDialog.showModal();
}

function invoicePayload() {
  const lines = [...document.querySelectorAll('.invoice-line')].map((line) => ({
    product_id: line.querySelector('.invoice-product-select').value,
    quantity: line.querySelector('.invoice-quantity').value,
  }));
  return {
    customer_name: invoiceForm.elements.customer_name.value,
    customer_email: invoiceForm.elements.customer_email.value,
    customer_phone: invoiceForm.elements.customer_phone.value,
    billing_address: invoiceForm.elements.billing_address.value,
    shipping_address: invoiceForm.elements.shipping_address.value,
    notes: invoiceForm.elements.notes.value,
    status: invoiceForm.elements.status.value,
    discount_amount: invoiceForm.elements.discount_amount.value || 0,
    tax_amount: invoiceForm.elements.tax_amount.value || 0,
    shipping_fee: invoiceForm.elements.shipping_fee.value || 0,
    items: lines,
  };
}

async function submitProduct(event) {
  event.preventDefault();
  const button = productForm.querySelector('[type="submit"]');
  button.disabled = true;
  const id = productForm.elements.id.value;
  const payload = Object.fromEntries(new FormData(productForm).entries());
  payload.is_active = productForm.elements.is_active.checked;
  try {
    await adminFetch(id ? `/products/${id}` : '/products', { method: id ? 'PUT' : 'POST', body: JSON.stringify(payload) });
    productDialog.close();
    await loadAll();
    showToast(id ? 'Đã cập nhật sản phẩm.' : 'Đã thêm sản phẩm vào danh mục.');
  } catch (error) {
    showToast(error.message, true);
  } finally {
    button.disabled = false;
  }
}

async function submitInvoice(event) {
  event.preventDefault();
  const button = invoiceForm.querySelector('[type="submit"]');
  button.disabled = true;
  const id = invoiceForm.elements.id.value;
  try {
    await adminFetch(id ? `/invoices/${id}` : '/invoices', {
      method: id ? 'PUT' : 'POST', body: JSON.stringify(invoicePayload()),
    });
    invoiceDialog.close();
    await loadAll();
    showToast(id ? 'Đã cập nhật hóa đơn và tồn kho.' : 'Đã tạo hóa đơn và ghi nhận xuất kho.');
  } catch (error) {
    showToast(error.message, true);
  } finally {
    button.disabled = false;
  }
}

async function submitPayment(event) {
  event.preventDefault();
  const button = paymentForm.querySelector('[type="submit"]');
  button.disabled = true;
  const invoiceId = paymentForm.elements.invoice_id.value;
  const payload = Object.fromEntries(new FormData(paymentForm).entries());
  delete payload.invoice_id;
  try {
    await adminFetch(`/invoices/${invoiceId}/payments`, { method: 'POST', body: JSON.stringify(payload) });
    paymentDialog.close();
    await loadAll();
    showToast('Đã ghi nhận khoản thanh toán.');
    if (state.reopenInvoiceId) {
      const reopenId = state.reopenInvoiceId;
      state.reopenInvoiceId = null;
      await openInvoice(reopenId);
    }
  } catch (error) {
    showToast(error.message, true);
  } finally {
    button.disabled = false;
  }
}

document.querySelectorAll('[data-view]').forEach((button) => {
  button.addEventListener('click', () => setView(button.dataset.view));
});

accessForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  state.key = accessKeyInput.value.trim();
  if (!state.key) return;
  await connectToAdmin();
});

document.querySelector('#logout-button').addEventListener('click', clearAccess);
document.querySelector('#new-product-button').addEventListener('click', () => openProduct());
document.querySelector('#new-invoice-button').addEventListener('click', () => openInvoice());
document.querySelectorAll('[data-catalog-manage]').forEach((button) => {
  button.addEventListener('click', () => openCatalogManager(button.dataset.catalogManage));
});
document.querySelector('#catalog-add-button').addEventListener('click', () => openCatalogEditor());
document.querySelector('#catalog-cancel-edit').addEventListener('click', () => {
  showCatalogList();
});
catalogForm.addEventListener('submit', submitCatalog);
catalogList.addEventListener('click', handleCatalogAction);
document.querySelector('#product-search').addEventListener('input', renderProducts);
document.querySelector('#product-status-filter').addEventListener('change', renderProducts);
document.querySelector('#invoice-search').addEventListener('input', renderInvoices);
document.querySelector('#invoice-status-filter').addEventListener('change', renderInvoices);
productForm.addEventListener('submit', submitProduct);
invoiceForm.addEventListener('submit', submitInvoice);
paymentForm.addEventListener('submit', submitPayment);
document.querySelector('#add-invoice-item').addEventListener('click', () => {
  addInvoiceLine();
  calculateInvoicePreview();
});

document.querySelector('#invoice-items-list').addEventListener('click', (event) => {
  if (!event.target.closest('[data-remove-invoice-line]')) return;
  const lines = document.querySelectorAll('.invoice-line');
  if (lines.length <= 1) {
    showToast('Hóa đơn cần có ít nhất một sản phẩm.', true);
    return;
  }
  event.target.closest('.invoice-line').remove();
  calculateInvoicePreview();
});
document.querySelector('#invoice-items-list').addEventListener('input', calculateInvoicePreview);
document.querySelector('#invoice-items-list').addEventListener('change', calculateInvoicePreview);
for (const field of ['discount_amount', 'tax_amount', 'shipping_fee']) {
  invoiceForm.elements[field].addEventListener('input', calculateInvoicePreview);
}

document.querySelector('#product-table-body').addEventListener('click', async (event) => {
  const edit = event.target.closest('[data-product-edit]');
  if (edit) {
    const product = state.products.find((record) => String(record.id) === edit.dataset.productEdit);
    if (product) openProduct(product);
    return;
  }
  const archive = event.target.closest('[data-product-archive]');
  if (!archive) return;
  const product = state.products.find((record) => String(record.id) === archive.dataset.productArchive);
  if (!product || !window.confirm(`Ẩn “${product.name}” khỏi cửa hàng? Lịch sử bán hàng sẽ được giữ lại.`)) return;
  try {
    await adminFetch(`/products/${product.id}`, { method: 'DELETE' });
    await loadAll();
    showToast('Đã ẩn sản phẩm khỏi cửa hàng.');
  } catch (error) {
    showToast(error.message, true);
  }
});

document.querySelector('#invoice-table-body').addEventListener('click', async (event) => {
  const edit = event.target.closest('[data-invoice-edit]');
  if (edit) {
    await openInvoice(edit.dataset.invoiceEdit);
    return;
  }
  const payment = event.target.closest('[data-invoice-payment]');
  if (payment) {
    state.reopenInvoiceId = payment.dataset.invoicePayment;
    openPayment(payment.dataset.invoicePayment);
    return;
  }
  const archive = event.target.closest('[data-invoice-archive]');
  if (!archive) return;
  const invoice = state.invoices.find((record) => String(record.id) === archive.dataset.invoiceArchive);
  if (!invoice || !window.confirm(`Lưu trữ hóa đơn ${invoice.invoice_code}? Dữ liệu thanh toán sẽ được giữ lại.`)) return;
  try {
    await adminFetch(`/invoices/${invoice.id}`, { method: 'DELETE' });
    await loadAll();
    showToast('Đã lưu trữ hóa đơn.');
  } catch (error) {
    showToast(error.message, true);
  }
});

document.querySelector('#record-payment-button').addEventListener('click', () => {
  const id = document.querySelector('#record-payment-button').dataset.invoiceId;
  state.reopenInvoiceId = id;
  openPayment(id);
});

document.querySelectorAll('[data-close-dialog]').forEach((button) => {
  button.addEventListener('click', () => document.querySelector(`#${button.dataset.closeDialog}`).close());
});

for (const dialog of document.querySelectorAll('dialog')) {
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
}

const storedKey = sessionStorage.getItem(KEY_STORAGE);
if (storedKey) {
  state.key = storedKey;
  connectToAdmin();
} else {
  accessKeyInput.focus();
}
