-- Schema PostgreSQL cho website phụ tùng xe máy và trang quản trị.
-- Có đúng 12 bảng. Chạy lại script an toàn; orders/order_items cũ sẽ được đổi tên
-- thành invoices/invoice_items và dữ liệu hiện có được giữ lại.

BEGIN;

-- Nâng cấp tên hai bảng hóa đơn cũ mà không xóa dữ liệu.
DO $$
BEGIN
    IF to_regclass('invoices') IS NULL AND to_regclass('orders') IS NOT NULL THEN
        ALTER TABLE orders RENAME TO invoices;
    END IF;

    IF to_regclass('invoice_items') IS NULL AND to_regclass('order_items') IS NOT NULL THEN
        ALTER TABLE order_items RENAME TO invoice_items;
    END IF;

    IF to_regclass('invoice_items') IS NOT NULL
       AND EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_schema = current_schema()
             AND table_name = 'invoice_items' AND column_name = 'order_id'
       )
       AND NOT EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_schema = current_schema()
             AND table_name = 'invoice_items' AND column_name = 'invoice_id'
       ) THEN
        ALTER TABLE invoice_items RENAME COLUMN order_id TO invoice_id;
    END IF;

    IF to_regclass('invoice_items') IS NOT NULL
       AND EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_schema = current_schema()
             AND table_name = 'invoice_items' AND column_name = 'price_at_time'
       )
       AND NOT EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_schema = current_schema()
             AND table_name = 'invoice_items' AND column_name = 'unit_price'
       ) THEN
        ALTER TABLE invoice_items RENAME COLUMN price_at_time TO unit_price;
    END IF;
END $$;

CREATE SEQUENCE IF NOT EXISTS invoice_code_seq;

-- 1. Tài khoản khách hàng và quản trị viên.
CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    full_name VARCHAR(200) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    phone VARCHAR(30),
    role VARCHAR(20) NOT NULL DEFAULT 'customer'
        CHECK (role IN ('customer', 'admin')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(30);
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 2. Danh mục sản phẩm.
CREATE TABLE IF NOT EXISTS categories (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL UNIQUE,
    slug VARCHAR(180),
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE categories ADD COLUMN IF NOT EXISTS slug VARCHAR(180);
ALTER TABLE categories ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE categories ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug) WHERE slug IS NOT NULL;

-- 3. Thương hiệu sản phẩm.
CREATE TABLE IF NOT EXISTS brands (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL UNIQUE,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Nhà cung cấp.
CREATE TABLE IF NOT EXISTS suppliers (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL UNIQUE,
    contact_name VARCHAR(200),
    email VARCHAR(255),
    phone VARCHAR(30),
    address TEXT,
    notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Sản phẩm. Khi admin xóa trên giao diện, đặt is_active = FALSE để giữ lịch sử.
CREATE TABLE IF NOT EXISTS products (
    id BIGSERIAL PRIMARY KEY,
    category_id BIGINT REFERENCES categories(id) ON DELETE SET NULL,
    brand_id BIGINT REFERENCES brands(id) ON DELETE SET NULL,
    supplier_id BIGINT REFERENCES suppliers(id) ON DELETE SET NULL,
    name VARCHAR(200) NOT NULL,
    sku VARCHAR(80) NOT NULL UNIQUE,
    price NUMERIC(14, 2) NOT NULL CHECK (price >= 0),
    cost_price NUMERIC(14, 2) CHECK (cost_price IS NULL OR cost_price >= 0),
    stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
    status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('draft', 'active', 'discontinued')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    image_url TEXT,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE products ADD COLUMN IF NOT EXISTS brand_id BIGINT REFERENCES brands(id) ON DELETE SET NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS supplier_id BIGINT REFERENCES suppliers(id) ON DELETE SET NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price NUMERIC(14, 2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active';
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_status_check;
ALTER TABLE products ADD CONSTRAINT products_status_check
    CHECK (status IN ('draft', 'active', 'discontinued'));

-- 6. Ảnh sản phẩm, cho phép mỗi mặt hàng có nhiều ảnh.
CREATE TABLE IF NOT EXISTS product_images (
    id BIGSERIAL PRIMARY KEY,
    product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    alt_text VARCHAR(255),
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Nhật ký nhập, xuất và điều chỉnh tồn kho.
CREATE TABLE IF NOT EXISTS inventory_transactions (
    id BIGSERIAL PRIMARY KEY,
    product_id BIGINT REFERENCES products(id) ON DELETE SET NULL,
    product_name VARCHAR(200) NOT NULL,
    sku VARCHAR(80),
    movement_type VARCHAR(20) NOT NULL
        CHECK (movement_type IN ('opening', 'purchase', 'sale', 'return', 'adjustment')),
    quantity_before INTEGER NOT NULL CHECK (quantity_before >= 0),
    quantity_change INTEGER NOT NULL,
    quantity_after INTEGER NOT NULL CHECK (quantity_after >= 0),
    reference_type VARCHAR(30),
    reference_id BIGINT,
    note TEXT,
    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (quantity_after = quantity_before + quantity_change)
);

-- 8. Hóa đơn. Thông tin người mua/giá được chụp tại thời điểm bán.
-- Xóa hóa đơn trên giao diện nên đặt deleted_at thay vì xóa vật lý để giữ lịch sử thanh toán.
CREATE TABLE IF NOT EXISTS invoices (
    id BIGSERIAL PRIMARY KEY,
    invoice_code VARCHAR(40) NOT NULL,
    user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    customer_name VARCHAR(200) NOT NULL,
    customer_email VARCHAR(255),
    customer_phone VARCHAR(30),
    subtotal NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
    discount_amount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
    tax_amount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
    shipping_fee NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (shipping_fee >= 0),
    total_amount NUMERIC(14, 2) NOT NULL CHECK (total_amount >= 0),
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('draft', 'pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded')),
    payment_status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (payment_status IN ('pending', 'partial', 'paid', 'refunded')),
    billing_address TEXT,
    shipping_address TEXT NOT NULL DEFAULT '',
    notes TEXT,
    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    issued_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS invoice_code VARCHAR(40);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS customer_name VARCHAR(200);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS customer_email VARCHAR(255);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(30);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS subtotal NUMERIC(14, 2) NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(14, 2) NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(14, 2) NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS shipping_fee NUMERIC(14, 2) NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) NOT NULL DEFAULT 'pending';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS billing_address TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS created_by BIGINT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS issued_at TIMESTAMPTZ;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE invoices ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE invoices ALTER COLUMN invoice_code SET DEFAULT (
    'HD-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' || LPAD(NEXTVAL('invoice_code_seq')::TEXT, 6, '0')
);

UPDATE invoices AS i
SET invoice_code = 'HD-OLD-' || LPAD(i.id::TEXT, 8, '0')
WHERE i.invoice_code IS NULL OR i.invoice_code = '';

UPDATE invoices AS i
SET customer_name = COALESCE(NULLIF(i.customer_name, ''), u.full_name, 'Khách lẻ'),
    customer_email = COALESCE(i.customer_email, u.email)
FROM users AS u
WHERE i.user_id = u.id AND (i.customer_name IS NULL OR i.customer_name = '');

UPDATE invoices SET customer_name = 'Khách lẻ'
WHERE customer_name IS NULL OR customer_name = '';
UPDATE invoices SET subtotal = total_amount
WHERE subtotal = 0 AND total_amount > 0;

ALTER TABLE invoices ALTER COLUMN invoice_code SET NOT NULL;
ALTER TABLE invoices ALTER COLUMN customer_name SET NOT NULL;
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS orders_user_id_fkey;
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_user_id_fkey;
ALTER TABLE invoices ADD CONSTRAINT invoices_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE invoices ADD CONSTRAINT invoices_status_check
    CHECK (status IN ('draft', 'pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'));
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_payment_status_check;
ALTER TABLE invoices ADD CONSTRAINT invoices_payment_status_check
    CHECK (payment_status IN ('pending', 'partial', 'paid', 'refunded'));
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_subtotal_check;
ALTER TABLE invoices ADD CONSTRAINT invoices_subtotal_check CHECK (subtotal >= 0);
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_discount_amount_check;
ALTER TABLE invoices ADD CONSTRAINT invoices_discount_amount_check CHECK (discount_amount >= 0);
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_tax_amount_check;
ALTER TABLE invoices ADD CONSTRAINT invoices_tax_amount_check CHECK (tax_amount >= 0);
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_shipping_fee_check;
ALTER TABLE invoices ADD CONSTRAINT invoices_shipping_fee_check CHECK (shipping_fee >= 0);
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_invoice_code ON invoices(invoice_code);

-- 9. Dòng hàng của hóa đơn; tên, SKU và đơn giá được giữ lại dù sản phẩm thay đổi/xóa.
CREATE TABLE IF NOT EXISTS invoice_items (
    id BIGSERIAL PRIMARY KEY,
    invoice_id BIGINT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    product_id BIGINT REFERENCES products(id) ON DELETE SET NULL,
    product_name VARCHAR(200) NOT NULL,
    sku VARCHAR(80),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(14, 2) NOT NULL CHECK (unit_price >= 0),
    discount_amount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
    line_total NUMERIC(14, 2) NOT NULL CHECK (line_total >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS product_name VARCHAR(200);
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS sku VARCHAR(80);
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS unit_price NUMERIC(14, 2) NOT NULL DEFAULT 0;
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(14, 2) NOT NULL DEFAULT 0;
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS line_total NUMERIC(14, 2) NOT NULL DEFAULT 0;
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE invoice_items AS ii
SET product_name = COALESCE(p.name, 'Sản phẩm đã xóa'),
    sku = COALESCE(ii.sku, p.sku)
FROM products AS p
WHERE ii.product_id = p.id AND (ii.product_name IS NULL OR ii.product_name = '');
UPDATE invoice_items SET product_name = 'Sản phẩm đã xóa'
WHERE product_name IS NULL OR product_name = '';
UPDATE invoice_items SET line_total = quantity * unit_price
WHERE line_total = 0 AND quantity * unit_price > 0;

ALTER TABLE invoice_items ALTER COLUMN product_name SET NOT NULL;
ALTER TABLE invoice_items ALTER COLUMN product_id DROP NOT NULL;
ALTER TABLE invoice_items DROP CONSTRAINT IF EXISTS order_items_product_id_fkey;
ALTER TABLE invoice_items DROP CONSTRAINT IF EXISTS invoice_items_product_id_fkey;
ALTER TABLE invoice_items ADD CONSTRAINT invoice_items_product_id_fkey
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;
ALTER TABLE invoice_items DROP CONSTRAINT IF EXISTS order_items_price_at_time_check;
ALTER TABLE invoice_items DROP CONSTRAINT IF EXISTS invoice_items_unit_price_check;
ALTER TABLE invoice_items ADD CONSTRAINT invoice_items_unit_price_check CHECK (unit_price >= 0);
ALTER TABLE invoice_items DROP CONSTRAINT IF EXISTS invoice_items_discount_amount_check;
ALTER TABLE invoice_items ADD CONSTRAINT invoice_items_discount_amount_check CHECK (discount_amount >= 0);
ALTER TABLE invoice_items DROP CONSTRAINT IF EXISTS invoice_items_line_total_check;
ALTER TABLE invoice_items ADD CONSTRAINT invoice_items_line_total_check CHECK (line_total >= 0);

-- 10. Các lần thanh toán cho hóa đơn (hỗ trợ thanh toán nhiều đợt).
CREATE TABLE IF NOT EXISTS payments (
    id BIGSERIAL PRIMARY KEY,
    invoice_id BIGINT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
    method VARCHAR(30) NOT NULL
        CHECK (method IN ('cash', 'bank_transfer', 'card', 'e_wallet', 'cod', 'other')),
    status VARCHAR(20) NOT NULL DEFAULT 'completed'
        CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
    transaction_code VARCHAR(120),
    note TEXT,
    paid_at TIMESTAMPTZ,
    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. Lịch sử đổi trạng thái hóa đơn để admin tra cứu.
CREATE TABLE IF NOT EXISTS invoice_status_history (
    id BIGSERIAL PRIMARY KEY,
    invoice_id BIGINT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    old_status VARCHAR(20),
    new_status VARCHAR(20) NOT NULL,
    note TEXT,
    changed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 12. Nhật ký thao tác quản trị, lưu dữ liệu thay đổi dưới dạng JSON.
CREATE TABLE IF NOT EXISTS admin_activity_logs (
    id BIGSERIAL PRIMARY KEY,
    admin_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(30) NOT NULL,
    entity_type VARCHAR(40) NOT NULL,
    entity_id BIGINT,
    details JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_brand_id ON products(brand_id);
CREATE INDEX IF NOT EXISTS idx_products_supplier_id ON products(supplier_id);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active, status);
CREATE INDEX IF NOT EXISTS idx_product_images_product_id ON product_images(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_product_created
    ON inventory_transactions(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_user_id ON invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status_created ON invoices(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_product_id ON invoice_items(product_id);
CREATE INDEX IF NOT EXISTS idx_payments_invoice_id ON payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_status_history_invoice_created
    ON invoice_status_history(invoice_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_activity_logs_created ON admin_activity_logs(created_at DESC);

COMMIT;
