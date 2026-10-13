const cartButton = document.querySelector('#cart-button');
const cartCount = document.querySelector('#cart-count');
const mobileMenuButton = document.querySelector('#mobile-menu-button');
const mobileNav = document.querySelector('#mobile-nav');

function updateCartCount() {
  if (!cartCount) return;
  try {
    const saved = JSON.parse(localStorage.getItem('rideform-cart-v1') || '{}');
    const count = saved && typeof saved === 'object' && !Array.isArray(saved)
      ? Object.values(saved).reduce((sum, quantity) => sum + (Number.isInteger(quantity) && quantity > 0 ? quantity : 0), 0)
      : 0;
    cartCount.textContent = String(count);
  } catch (_error) {
    cartCount.textContent = '0';
  }
}

if (mobileMenuButton && mobileNav) {
  mobileMenuButton.addEventListener('click', () => {
    const expanded = mobileMenuButton.getAttribute('aria-expanded') === 'true';
    mobileMenuButton.setAttribute('aria-expanded', String(!expanded));
    mobileMenuButton.setAttribute('aria-label', expanded ? 'Mở menu' : 'Đóng menu');
    mobileNav.hidden = expanded;
  });

  mobileNav.addEventListener('click', (event) => {
    if (!event.target.closest('a')) return;
    mobileNav.hidden = true;
    mobileMenuButton.setAttribute('aria-expanded', 'false');
    mobileMenuButton.setAttribute('aria-label', 'Mở menu');
  });
}

if (cartButton && !document.querySelector('#cart-dialog')) {
  cartButton.addEventListener('click', () => {
    window.location.href = '/products/#cart-dialog';
  });
}

document.querySelectorAll('#current-year').forEach((node) => {
  node.textContent = String(new Date().getFullYear());
});

updateCartCount();
window.addEventListener('storage', (event) => {
  if (event.key === 'rideform-cart-v1') updateCartCount();
});
