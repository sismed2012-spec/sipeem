-- Migration 004: Enhance Municipios Table
-- Adds distrito, region, and estatus fields to support advanced administrative features.

-- 1. Add new columns
ALTER TABLE municipios ADD COLUMN IF NOT EXISTS distrito text;
ALTER TABLE municipios ADD COLUMN IF NOT EXISTS region text;
ALTER TABLE municipios ADD COLUMN IF NOT EXISTS estatus text NOT NULL DEFAULT 'activo';

-- 2. Add check constraint for estatus
-- Note: We drop it first to avoid duplicates if rerun
ALTER TABLE municipios DROP CONSTRAINT IF EXISTS municipios_estatus_check;
ALTER TABLE municipios ADD CONSTRAINT municipios_estatus_check 
  CHECK (estatus IN ('activo', 'inactivo'));

-- 3. Add index for performance on status/region filters (optional but recommended)
CREATE INDEX IF NOT EXISTS idx_municipios_estatus ON municipios(estatus);
CREATE INDEX IF NOT EXISTS idx_municipios_region ON municipios(region);
