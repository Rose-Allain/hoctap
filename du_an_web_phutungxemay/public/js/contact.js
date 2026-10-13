const store = window.RIDEFORM_STORE || {};
const emailLink = document.querySelector('#contact-email');
const phoneLink = document.querySelector('#contact-phone');
const addressText = document.querySelector('#contact-address');
const contactForm = document.querySelector('#contact-form');
const formStatus = document.querySelector('#contact-form-status');

if (store.email) {
  emailLink.href = `mailto:${store.email}`;
  emailLink.textContent = store.email;
} else {
  emailLink.textContent = 'Gửi thông tin qua biểu mẫu';
  emailLink.href = '#contact-form-section';
}

if (store.phone) {
  phoneLink.href = `tel:${store.phone.replace(/[^\d+]/g, '')}`;
  phoneLink.textContent = store.phone;
} else if (store.zaloUrl) {
  phoneLink.href = store.zaloUrl;
  phoneLink.target = '_blank';
  phoneLink.rel = 'noopener noreferrer';
  phoneLink.textContent = 'Nhắn Zalo với cửa hàng';
} else {
  phoneLink.textContent = 'Thông tin sẽ được cập nhật';
  phoneLink.removeAttribute('href');
}

addressText.textContent = store.address || 'Thông tin sẽ được cập nhật';

contactForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!store.email) {
    formStatus.textContent = 'Cửa hàng chưa cấu hình email nhận yêu cầu. Hãy cập nhật email trong public/js/store-config.js.';
    formStatus.classList.add('is-error');
    return;
  }

  const data = new FormData(contactForm);
  const subject = `RIDEFORM | ${data.get('topic')}`;
  const body = [
    `Họ và tên: ${data.get('name')}`,
    `Số điện thoại: ${data.get('phone')}`,
    `Email: ${data.get('email')}`,
    '',
    'Thông tin xe và câu hỏi:',
    data.get('message'),
  ].join('\n');

  window.location.href = `mailto:${store.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  formStatus.textContent = 'Đã mở ứng dụng email. Hãy kiểm tra nội dung và gửi thư để hoàn tất.';
  formStatus.classList.remove('is-error');
});
