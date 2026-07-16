-- QR promocional del tiquet (reseñas Google, redes sociales, web del negocio).
-- Se añaden a la config singleton `sales_settings` (creada en 001_init):
--   receipt_marketing_url  → URL del QR promocional; vacía = no se pinta nada.
--   receipt_marketing_text → leyenda sobre el QR (p.ej. «Escanea y déjanos una reseña»).
ALTER TABLE sales_settings ADD COLUMN receipt_marketing_url  TEXT NOT NULL DEFAULT '';
ALTER TABLE sales_settings ADD COLUMN receipt_marketing_text TEXT NOT NULL DEFAULT '';
