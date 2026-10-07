# BẢN ĐẶC TẢ WEBSITE

## 1. Tên website và mục đích

**Tên website:** Phụ tùng Honda Tâm

**Mục đích:** Giới thiệu cửa hàng Phụ tùng Honda Tâm và các sản phẩm phụ tùng, nhớt, linh kiện dành cho xe Honda. Website giúp khách hàng xem thông tin sản phẩm và tìm thông tin liên hệ của cửa hàng. Website là trang tĩnh, không có chức năng đặt hàng, thanh toán hoặc đăng nhập.

## 2. Đối tượng người dùng

Người đi xe Honda cần tìm phụ tùng hoặc sản phẩm phù hợp và thợ sửa xe có nhu cầu tham khảo sản phẩm.

## 3. Danh sách trang

| Trang | Tên file | Nội dung chính |
|---|---|---|
| Trang chủ | `index.html` | Giới thiệu website, một số sản phẩm nổi bật và thông tin liên hệ cửa hàng. |
| Sản phẩm | `san-pham.html` | Danh sách sản phẩm dành cho xe Honda, gồm nhớt và phụ tùng/linh kiện. |
| Giới thiệu | `gioi-thieu.html` | Giới thiệu ngắn gọn, thực tế về cửa hàng và các sản phẩm cửa hàng cung cấp; không tự tạo câu chuyện cá nhân. |
| Liên hệ | `lien-he.html` | Hiển thị địa chỉ, số điện thoại và email bằng placeholder cho đến khi có thông tin chính xác. |

## 4. Bố cục chung

Các trang dùng chung header, menu điều hướng và footer. Header đặt logo bên trái, menu bên phải.

Trang chủ có phần giới thiệu website với tiêu đề, mô tả ngắn và nút xem sản phẩm; tiếp theo là lưới 4 sản phẩm nổi bật; cuối trang là footer có thông tin cửa hàng và liên hệ.

Trang Sản phẩm hiển thị danh sách sản phẩm dạng lưới. Mỗi sản phẩm có hình ảnh, tên, mô tả ngắn và giá. Thông tin sản phẩm cụ thể sẽ được bổ sung khi có dữ liệu.

Trang Giới thiệu và Liên hệ giữ chung header, menu và footer, với phần nội dung phù hợp cho từng trang. Menu liên kết đến cả bốn trang.

## 5. Phong cách

- **Phong cách:** Hiện đại, đơn giản, chuyên nghiệp, dễ nhìn và có nhiều khoảng trắng.
- **Bảng màu giao diện tối đã chọn:**
  - Đỏ: `#D71920` — dùng cho nút bấm và điểm nhấn.
  - Đỏ sáng: `#FF5A54` — dùng cho liên kết và tiêu đề nhấn trên nền tối.
  - Nền chính: `#111111`.
  - Nền thẻ: `#171717`.
  - Chữ chính: `#F5F5F5`.
  - Chữ phụ: `#CCCCCC`.
- **Font chữ:** Arial hoặc sans-serif mặc định của hệ thống.

## 6. Yêu cầu hiển thị

Website dùng HTML5 và CSS3 thuần, không dùng framework, thư viện, công cụ build hoặc JavaScript nếu không thật sự cần. Tất cả các trang dùng chung `public/css/style.css`.

Giao diện phải hiển thị tốt trên máy tính và điện thoại. Nội dung tự co giãn, xếp lại hợp lý trên màn hình nhỏ, chữ dễ đọc và không bị tràn ngang. Hình ảnh cần có văn bản thay thế phù hợp.