const categoryGrid = document.querySelector('#category-grid');
const categoryStatus = document.querySelector('#category-status');
const categoryStyles = ['collection-card--brake', 'collection-card--care', 'collection-card--electric', 'collection-card--upgrade'];
const previewCategories = [
  { name: 'Phanh & truyền động', description: 'Bố thắng, đĩa phanh và các chi tiết truyền động.', search: 'phanh' },
  { name: 'Bảo dưỡng định kỳ', description: 'Lọc gió, dầu động cơ và phụ tùng chăm sóc xe.', search: 'bảo dưỡng' },
  { name: 'Điện & chiếu sáng', description: 'Những chi tiết điện và hệ thống chiếu sáng.', search: 'điện' },
  { name: 'Nâng cấp & cá tính', description: 'Hoàn thiện cảm giác lái và phong cách riêng.', search: 'nâng cấp' },
];

function createCategoryCard(category, index, isPreview) {
  const card = document.createElement('a');
  card.className = `collection-card ${categoryStyles[index % categoryStyles.length]}`;
  card.href = isPreview
    ? `/products/?q=${encodeURIComponent(category.search || category.name)}`
    : `/products/?category=${encodeURIComponent(category.name)}`;

  const number = document.createElement('span');
  number.className = 'collection-card__number';
  number.textContent = `${String(index + 1).padStart(2, '0')} / RIDEFORM CATEGORY`;

  const art = document.createElement('span');
  art.className = `collection-card__art ${index === 0 ? 'collection-card__art--disc' : index === 1 ? 'collection-card__art--care' : index === 2 ? 'collection-card__art--electric' : 'collection-card__art--upgrade'}`;
  art.textContent = String(index + 1).padStart(2, '0');

  const body = document.createElement('span');
  body.className = 'collection-card__body';
  const name = document.createElement('strong');
  name.textContent = category.name;
  const description = document.createElement('small');
  description.textContent = category.description || 'Khám phá các sản phẩm thuộc danh mục này.';
  body.append(name, description);

  const arrow = document.createElement('span');
  arrow.className = 'collection-card__arrow';
  arrow.textContent = '↗';

  card.append(number, art, body, arrow);
  return card;
}

function renderCategories(categories, options = {}) {
  const fragment = document.createDocumentFragment();
  categories.forEach((category, index) => fragment.append(createCategoryCard(category, index, options.preview)));
  categoryGrid.replaceChildren(fragment);
  categoryGrid.setAttribute('aria-busy', 'false');
  categoryStatus.querySelector('p').textContent = options.preview
    ? `${categories.length} danh mục gợi ý · dữ liệu minh họa`
    : `${categories.length} danh mục sản phẩm`;
  const note = categoryStatus.querySelector('.catalog-status__note');
  note.innerHTML = `<span class="status-dot"></span> ${options.preview ? 'Bản xem trước trên local' : `${options.productCount} sản phẩm trong danh mục`}`;
  note.classList.toggle('catalog-status__note--demo', Boolean(options.preview));
}

function showCategoryError() {
  categoryGrid.setAttribute('aria-busy', 'false');
  const message = document.createElement('div');
  message.className = 'catalog-message catalog-message--error';
  const text = document.createElement('p');
  text.textContent = 'Chưa tải được danh mục cửa hàng. Vui lòng thử lại sau.';
  const retry = document.createElement('button');
  retry.className = 'catalog-message__retry';
  retry.type = 'button';
  retry.textContent = 'Thử tải lại';
  retry.addEventListener('click', loadCategories);
  message.append(text, retry);
  categoryGrid.replaceChildren(message);
  categoryStatus.querySelector('p').textContent = 'Danh mục chưa sẵn sàng';
}

async function loadCategories() {
  categoryGrid.setAttribute('aria-busy', 'true');
  try {
    const response = await fetch('/api/products');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    const products = Array.isArray(payload) ? payload : payload.data;
    if (!Array.isArray(products)) throw new Error('Dữ liệu sản phẩm không hợp lệ');

    const grouped = new Map();
    products.forEach((product) => {
      if (!product.category_name) return;
      const group = grouped.get(product.category_name) || { name: product.category_name, count: 0 };
      group.count += 1;
      grouped.set(product.category_name, group);
    });

    if (!grouped.size && ['localhost', '127.0.0.1'].includes(window.location.hostname)) {
      renderCategories(previewCategories, { preview: true });
      return;
    }

    const categories = [...grouped.values()]
      .sort((a, b) => a.name.localeCompare(b.name, 'vi'))
      .map((category) => ({
        ...category,
        description: `${category.count} sản phẩm · xem lựa chọn trong danh mục`,
      }));
    if (!categories.length) {
      showCategoryError();
      return;
    }
    renderCategories(categories, { productCount: products.length });
  } catch (error) {
    console.error('Không tải được danh mục:', error);
    if (['localhost', '127.0.0.1'].includes(window.location.hostname)) {
      renderCategories(previewCategories, { preview: true });
    } else {
      showCategoryError();
    }
  }
}

loadCategories();
