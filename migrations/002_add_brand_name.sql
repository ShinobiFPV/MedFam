-- Add brand name to medications (e.g. "Tylenol" alongside the generic name "Acetaminophen")

ALTER TABLE medications ADD COLUMN brand_name TEXT;
