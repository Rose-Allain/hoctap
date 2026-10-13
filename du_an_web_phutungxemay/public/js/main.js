(() => {
const productGrid = document.querySelector('#product-grid');
const productSummary = document.querySelector('#product-summary');
const categoryFilters = document.querySelector('#category-filters');
const searchInput = document.querySelector('#product-search');
const sortSelect = document.querySelector('#product-sort');
const cartCount = document.querySelector('#cart-count');
const cartDialogCount = document.querySelector('#cart-dialog-count');
const cartDialog = document.querySelector('#cart-dialog');
const cartItems = document.querySelector('#cart-items');
const cartTotal = document.querySelector('#cart-total');
const catalogNote = document.querySelector('#catalog-note');
const checkoutOpen = document.querySelector('#checkout-open');
const cartActions = document.querySelector('#cart-actions');
const checkoutForm = document.querySelector('#checkout-form');
const checkoutError = document.querySelector('#checkout-error');
const checkoutResult = document.querySelector('#checkout-result');
const checkoutResultNote = document.querySelector('#checkout-result-note');
const checkoutSubmit = document.querySelector('#checkout-submit');
const initialParams = new URLSearchParams(window.location.search);

const CART_STORAGE_KEY = 'rideform-cart-v1';
const LOCAL_PREVIEW_HOSTS = new Set(['localhost', '127.0.0.1']);
const isLocalPreview = LOCAL_PREVIEW_HOSTS.has(window.location.hostname);
const previewProducts = [
  { id: 9001, category_name: 'Phanh & truyền động', name: 'Bố thắng đĩa trước Ceramic', sku: 'RF-BRK-2401', price: '285000', stock_quantity: 18, image_url: null, description: 'Lực phanh ổn định, kiểm soát tự tin trong điều kiện đi phố.' },
  { id: 9002, category_name: 'Phanh & truyền động', name: 'Bộ nhông sên dĩa thép tôi', sku: 'RF-DRV-1436', price: '695000', stock_quantity: 9, image_url: null, description: 'Bộ truyền động bền bỉ, phù hợp nhu cầu sử dụng hằng ngày.' },
  { id: 9003, category_name: 'Bảo dưỡng định kỳ', name: 'Lọc gió hiệu suất cao', sku: 'RF-AIR-0082', price: '420000', stock_quantity: 12, image_url: null, description: 'Thiết kế lưu thông khí tối ưu cho lịch bảo dưỡng đều đặn.' },
  { id: 9004, category_name: 'Bảo dưỡng định kỳ', name: 'Dầu động cơ tổng hợp 10W-40', sku: 'RF-OIL-1040', price: '198000', stock_quantity: 25, image_url: null, description: 'Độ nhớt phù hợp cho nhiều điều kiện vận hành thường ngày.' },
  { id: 9005, category_name: 'Điện & chiếu sáng', name: 'Đèn LED projector compact', sku: 'RF-LGT-0320', price: '1250000', stock_quantity: 6, image_url: null, description: 'Cụm chiếu sáng gọn gàng, ánh sáng tập trung và rõ nét.' },
  { id: 9006, category_name: 'Nâng cấp & cá tính', name: 'Tay nắm cao su texture', sku: 'RF-GRP-0018', price: '245000', stock_quantity: 14, image_url: null, description: 'Bề mặt bám tay, hoàn thiện tối giản cho khoang lái.' },
  { id: 9007, category_name: 'Nâng cấp & cá tính', name: 'Phuộc sau chỉnh tải trọng', sku: 'RF-SUS-2206', price: '1890000', stock_quantity: 4, image_url: null, description: 'Tùy chỉnh tải trọng để cân bằng cảm giác lái theo nhu cầu.' },
  { id: 9008, category_name: 'Phanh & truyền động', name: 'Đĩa phanh thép không gỉ', sku: 'RF-DIS-0267', price: '980000', stock_quantity: 7, image_url: null, description: 'Bề mặt gia công chính xác, thiết kế cho hiệu suất phanh ổn định.' },
];
const money = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
});

let products = [];
let activeCategory = initialParams.get('category') || 'all';
let loadError = false;
let isDemoCatalog = false;
let cart = readCart();

searchInput.value = initialParams.get('q') || '';

function readCart() {
  try {
    const saved = JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || '{}');
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return {};

    return Object.fromEntries(
      Object.entries(saved)
        .filter(([id, quantity]) => /^\d+$/.test(id) && Number.isInteger(quantity) && quantity > 0)
        .map(([id, quantity]) => [id, quantity]),
    );
  } catch (_error) {
    return {};
  }
}

function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function icon(name, className = 'icon') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', className);
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#icon-${name}`);
  svg.append(use);
  return svg;
}

function formatPrice(value) {
  const amount = Number(value);
  return money.format(Number.isFinite(amount) ? amount : 0);
}

function safeImageUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value.trim(), window.location.origin);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : null;
  } catch (_error) {
    return null;
  }
}

function makeFilterButton(label, value, isActive = false) {
  const button = createElement('button', `filter-chip${isActive ? ' is-active' : ''}`, label);
  button.type = 'button';
  button.dataset.category = value;
  return button;
}

function renderCategoryFilters() {
  const categories = [...new Set(products.map((product) => product.category_name).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'vi'));

  if (activeCategory !== 'all') {
    activeCategory = categories.find((category) => category.toLocaleLowerCase('vi') === activeCategory.toLocaleLowerCase('vi')) || 'all';
  }
  categoryFilters.replaceChildren(makeFilterButton('Tất cả', 'all', activeCategory === 'all'));
  categories.forEach((category) => {
    categoryFilters.append(makeFilterButton(category, category, activeCategory === category));
  });
}

function getVisibleProducts() {
  const query = searchInput.value.trim().toLocaleLowerCase('vi');
  const visible = products.filter((product) => {
    const matchesCategory = activeCategory === 'all' || product.category_name === activeCategory;
    const searchable = [product.name, product.sku, product.description, product.category_name]
      .filter(Boolean).join(' ').toLocaleLowerCase('vi');
    return matchesCategory && (!query || searchable.includes(query));
  });

  switch (sortSelect.value) {
    case 'price-asc':
      visible.sort((a, b) => Number(a.price) - Number(b.price));
      break;
    case 'price-desc':
      visible.sort((a, b) => Number(b.price) - Number(a.price));
      break;
    case 'name':
      visible.sort((a, b) => String(a.name).localeCompare(String(b.name), 'vi'));
      break;
    default:
      visible.sort((a, b) => Number(b.id) - Number(a.id));
  }
  return visible;
}

function createProductCard(product) {
  const card = createElement('article', 'product-card');
  const visual = createElement('div', 'product-card__visual');
  const imageUrl = safeImageUrl(product.image_url);

  if (imageUrl) {
    const image = createElement('img', 'product-card__image');
    image.src = imageUrl;
    image.alt = product.name ? `Ảnh ${product.name}` : 'Ảnh phụ tùng xe máy';
    image.loading = 'lazy';
    image.addEventListener('error', () => {
      image.remove();
      visual.append(createPlaceholderArt(product));
    }, { once: true });
    visual.append(image);
  } else {
    visual.append(createPlaceholderArt(product));
  }

  if (product.category_name) visual.append(createElement('span', 'product-card__category', product.category_name));
  visual.append(createElement('span', 'product-card__sku', `SKU / ${product.sku || '—'}`));

  const content = createElement('div', 'product-card__content');
  const name = createElement('h3', 'product-card__name', product.name || 'Phụ tùng xe máy');
  const description = createElement('p', 'product-card__description', product.description || 'Thông tin chi tiết sản phẩm đang được cập nhật.');
  const bottom = createElement('div', 'product-card__bottom');
  const price = createElement('div', 'product-card__price');
  price.append(createElement('strong', '', formatPrice(product.price)));
  const stock = Math.max(0, Number(product.stock_quantity) || 0);
  price.append(createElement('small', '', stock > 0 ? `Còn ${stock} sản phẩm` : 'Tạm hết hàng'));

  const add = createElement('button', 'product-card__add', '');
  add.type = 'button';
  add.dataset.addToCart = String(product.id);
  add.disabled = stock <= 0;
  add.setAttribute('aria-label', stock > 0 ? `Thêm ${product.name} vào giỏ hàng` : `${product.name} tạm hết hàng`);
  add.append(icon('bag'));

  bottom.append(price, add);
  content.append(name, description, bottom);
  card.append(visual, content);
  return card;
}

function createPlaceholderArt(product) {
  const placeholder = createElement('div', 'product-card__placeholder');
  const productText = `${product.name || ''} ${product.category_name || ''}`.toLocaleLowerCase('vi');
  const artId = /phanh|bố thắng|đĩa|nhông|sên/.test(productText) ? 'art-disc'
    : /lọc gió|lọc nhớt|filter/.test(productText) ? 'art-filter'
      : /dầu|nhớt/.test(productText) ? 'art-bottle'
        : /đèn|điện|led/.test(productText) ? 'art-lamp'
          : /phuộc|giảm xóc|suspension/.test(productText) ? 'art-shock'
            : /tay nắm|grip/.test(productText) ? 'art-grip'
              : null;

  if (!artId) {
    placeholder.append(icon('gear'));
    return placeholder;
  }

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'product-card__illustration');
  svg.setAttribute('viewBox', '0 0 240 190');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#${artId}`);
  svg.append(use);
  placeholder.append(svg);
  return placeholder;
}

function showCatalogMessage(message, state = 'empty', retry = false) {
  const box = createElement('div', `catalog-message catalog-message--${state}`);
  if (state === 'loading') box.append(createElement('span', 'catalog-message__spinner'));
  box.append(createElement('p', '', message));
  if (retry) {
    const button = createElement('button', 'catalog-message__retry', 'Thử tải lại');
    button.type = 'button';
    button.addEventListener('click', loadProducts);
    box.append(button);
  }
  productGrid.replaceChildren(box);
}

function renderProducts() {
  productGrid.setAttribute('aria-busy', 'false');
  if (loadError) {
    showCatalogMessage('Danh mục đang tạm thời chưa kết nối. Vui lòng thử lại sau ít phút.', 'error', true);
    productSummary.textContent = 'Chưa tải được danh mục sản phẩm';
    return;
  }

  if (!products.length) {
    showCatalogMessage('Danh mục đang được cập nhật. Mời bạn quay lại sau.', 'empty');
    productSummary.textContent = 'Chưa có sản phẩm';
    return;
  }

  const visible = getVisibleProducts();
  if (!visible.length) {
    showCatalogMessage('Chưa tìm thấy sản phẩm phù hợp. Thử từ khóa hoặc danh mục khác nhé.', 'empty');
    productSummary.textContent = '0 sản phẩm phù hợp';
    return;
  }

  const fragment = document.createDocumentFragment();
  visible.forEach((product) => fragment.append(createProductCard(product)));
  productGrid.replaceChildren(fragment);
  productSummary.textContent = `${visible.length} sản phẩm${visible.length === products.length ? '' : ` / ${products.length}`}${isDemoCatalog ? ' · dữ liệu mẫu' : ''}`;
}

function saveCart() {
  try {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
  } catch (error) {
    console.warn('Không thể lưu giỏ hàng trên thiết bị:', error);
  }
  renderCart();
}

function renderCart() {
  const count = Object.values(cart).reduce((total, quantity) => total + quantity, 0);
  cartCount.textContent = String(count);
  cartDialogCount.textContent = `(${count})`;
  checkoutOpen.disabled = !Object.keys(cart).some((id) => products.some((item) => String(item.id) === id));
  cartItems.replaceChildren();

  const entries = Object.entries(cart)
    .map(([id, quantity]) => ({ product: products.find((item) => String(item.id) === id), quantity }))
    .filter((entry) => entry.product);

  if (!entries.length) {
    const emptyText = products.length
      ? 'Giỏ hàng đang trống. Bắt đầu với món phụ tùng bạn đang cần.'
      : 'Sản phẩm trong giỏ sẽ hiện ở đây sau khi danh mục tải xong.';
    cartItems.append(createElement('p', 'cart-empty', emptyText));
    cartTotal.textContent = formatPrice(0);
    return;
  }

  let total = 0;
  const fragment = document.createDocumentFragment();
  entries.forEach(({ product, quantity }) => {
    const amount = Number(product.price) * quantity;
    total += Number.isFinite(amount) ? amount : 0;

    const row = createElement('div', 'cart-row');
    const detail = createElement('div');
    detail.append(createElement('p', 'cart-row__name', product.name));
    detail.append(createElement('p', 'cart-row__meta', `${product.sku || 'Không có SKU'} · ${quantity} × ${formatPrice(product.price)}`));
    const actions = createElement('div', 'cart-row__actions');
    actions.append(createElement('span', 'cart-row__line-total', formatPrice(amount)));
    const remove = createElement('button', 'cart-row__remove', 'Xóa');
    remove.type = 'button';
    remove.dataset.removeFromCart = String(product.id);
    actions.append(remove);
    row.append(detail, actions);
    fragment.append(row);
  });

  cartItems.append(fragment);
  cartTotal.textContent = formatPrice(total);
}

function openCartIfRequested() {
  if (window.location.hash === '#cart-dialog' && !cartDialog.open) cartDialog.showModal();
}

function resetCheckoutView() {
  checkoutForm.reset();
  checkoutForm.hidden = true;
  checkoutError.hidden = true;
  checkoutResult.hidden = true;
  cartActions.hidden = false;
  checkoutOpen.hidden = false;
  cartItems.hidden = false;
  checkoutSubmit.disabled = false;
  checkoutSubmit.textContent = 'Đặt hàng';
}

checkoutOpen.addEventListener('click', () => {
  checkoutError.hidden = true;
  checkoutForm.hidden = false;
  cartActions.hidden = true;
  document.querySelector('#checkout-form input[name="customer_name"]').focus();
});

document.querySelector('#checkout-cancel').addEventListener('click', () => {
  checkoutForm.hidden = true;
  cartActions.hidden = false;
  checkoutError.hidden = true;
});

document.querySelector('#checkout-done').addEventListener('click', () => cartDialog.close());
cartDialog.addEventListener('close', resetCheckoutView);

checkoutForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  checkoutError.hidden = true;
  const items = Object.entries(cart)
    .filter(([id]) => products.some((product) => String(product.id) === id))
    .map(([productId, quantity]) => ({ product_id: productId, quantity }));
  if (!items.length) {
    checkoutError.textContent = 'Giỏ hàng chưa có sản phẩm để đặt.';
    checkoutError.hidden = false;
    return;
  }

  const formData = new FormData(checkoutForm);
  const payload = Object.fromEntries(formData.entries());
  payload.items = items;
  checkoutSubmit.disabled = true;
  checkoutSubmit.textContent = 'Đang xử lý…';
  try {
    const response = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Chưa thể tạo đơn hàng. Vui lòng thử lại.');

    cart = {};
    saveCart();
    checkoutForm.hidden = true;
    cartActions.hidden = true;
    cartItems.hidden = true;
    checkoutResultNote.textContent = `Mã đơn hàng ${result.data.invoice_code} · Tổng tiền ${formatPrice(result.data.total_amount)} · Thanh toán khi nhận hàng.`;
    checkoutResult.hidden = false;
  } catch (error) {
    checkoutError.textContent = error.message || 'Chưa thể tạo đơn hàng. Vui lòng thử lại.';
    checkoutError.hidden = false;
    checkoutSubmit.disabled = false;
    checkoutSubmit.textContent = 'Đặt hàng';
  }
});

async function loadProducts() {
  productGrid.setAttribute('aria-busy', 'true');
  showCatalogMessage('Đang tải những lựa chọn dành cho bạn...', 'loading');
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch('/api/products', { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    const data = Array.isArray(payload) ? payload : payload.data;
    if (!Array.isArray(data)) throw new Error('Dữ liệu sản phẩm không hợp lệ');

    products = data;
    loadError = false;
    isDemoCatalog = false;
    catalogNote.innerHTML = '<span class="status-dot"></span> Cập nhật theo danh mục cửa hàng';
    catalogNote.classList.remove('catalog-status__note--demo');
    renderCategoryFilters();
    renderProducts();
    renderCart();
    openCartIfRequested();
  } catch (error) {
    console.error('Không tải được danh mục sản phẩm:', error);
    if (isLocalPreview) {
      products = previewProducts;
      loadError = false;
      isDemoCatalog = true;
      catalogNote.innerHTML = '<span class="status-dot"></span> Đang xem dữ liệu mẫu · database chưa kết nối';
      catalogNote.classList.add('catalog-status__note--demo');
      renderCategoryFilters();
      renderProducts();
      renderCart();
      openCartIfRequested();
      return;
    }
    loadError = true;
    productGrid.setAttribute('aria-busy', 'false');
    renderProducts();
    renderCart();
    openCartIfRequested();
  } finally {
    window.clearTimeout(timeoutId);
  }
}

productGrid.addEventListener('click', (event) => {
  const button = event.target.closest('[data-add-to-cart]');
  if (!button || button.disabled) return;
  const id = button.dataset.addToCart;
  const product = products.find((item) => String(item.id) === id);
  if (!product) return;

  const stock = Math.max(0, Number(product.stock_quantity) || 0);
  const currentQuantity = cart[id] || 0;
  if (currentQuantity >= stock) {
    productSummary.textContent = `Bạn đã chọn đủ số lượng còn lại của “${product.name}”.`;
    return;
  }

  cart[id] = currentQuantity + 1;
  saveCart();
  button.classList.add('is-added');
  button.setAttribute('aria-label', `Đã thêm ${product.name} vào giỏ hàng`);
  window.setTimeout(() => {
    if (!button.isConnected) return;
    button.classList.remove('is-added');
    button.setAttribute('aria-label', `Thêm ${product.name} vào giỏ hàng`);
  }, 900);
});

categoryFilters.addEventListener('click', (event) => {
  const button = event.target.closest('[data-category]');
  if (!button) return;
  activeCategory = button.dataset.category;
  categoryFilters.querySelectorAll('[data-category]').forEach((filter) => {
    filter.classList.toggle('is-active', filter === button);
  });
  renderProducts();
});

cartItems.addEventListener('click', (event) => {
  const button = event.target.closest('[data-remove-from-cart]');
  if (!button) return;
  delete cart[button.dataset.removeFromCart];
  saveCart();
});

document.querySelector('#cart-button').addEventListener('click', () => {
  resetCheckoutView();
  renderCart();
  cartDialog.showModal();
});
document.querySelector('#close-cart').addEventListener('click', () => cartDialog.close());
cartDialog.addEventListener('click', (event) => {
  if (event.target === cartDialog) cartDialog.close();
});
document.querySelector('#continue-shopping').addEventListener('click', () => cartDialog.close());

searchInput.addEventListener('input', renderProducts);
sortSelect.addEventListener('change', renderProducts);

document.querySelectorAll('[data-search-term]').forEach((link) => {
  link.addEventListener('click', () => {
    const term = link.dataset.searchTerm || '';
    searchInput.value = term;
    activeCategory = 'all';
    renderCategoryFilters();
    renderProducts();
  });
});

renderCart();
loadProducts();
})();
