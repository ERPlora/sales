-- Inserta cabecera. sale_number YYYYMMDD-NNNN se calcula leyendo el contador
-- (recién incrementado) en la MISMA transacción (sin read-back desde el guest).
-- Padding portable: erp_pad(valor, ancho) (ADR-0007) → printf/lpad por dialecto en el shim.
INSERT INTO sales_sale (
    id, hub_id, sale_number, status,
    subtotal, tax_amount, tax_breakdown, discount_amount, discount_percent, total, gift_total,
    payment_method_id, payment_method_name, amount_tendered, change_due,
    customer_id, customer_name, employee_id, notes, source_module, channel, table_id,
    order_id, staff_id, appointment_id,
    is_deleted, created_by, updated_by, created_at, updated_at
) VALUES (
    :sale_id, :hub_id,
    :day || '-' || erp_pad((
        SELECT last_number FROM sales_sale_counter WHERE hub_id = :hub_id AND day = :day
    ), 4),
    :status,
    :subtotal, :tax_amount, :tax_breakdown, :discount_amount, :discount_percent, :total, :gift_total,
    :payment_method_id, :payment_method_name, :amount_tendered, :change_due,
    :customer_id, :customer_name, :current_user_id, :notes, :source_module, :channel, :table_id,
    :order_id, :staff_id, :appointment_id,
    0, :current_user_id, :current_user_id, :now, :now
);
