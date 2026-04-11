-- Migration 003: Harmonize Role Model
-- Replaces 'analista' with 'admin' and updates the check constraint.

-- 1. Remove the old constraint (using the name from migration 001)
-- In migration 001 it was inline: rol text ... CHECK (rol IN (...))
-- Postgres usually names it 'usuarios_rol_check'
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_rol_check;

-- 2. Add the new hardened constraint
ALTER TABLE usuarios ADD CONSTRAINT usuarios_rol_check 
  CHECK (rol IN ('operador', 'admin', 'director'));

-- 3. Cleanup: Migrate any existing 'analista' data to 'admin'
UPDATE usuarios SET rol = 'admin' WHERE rol = 'analista';
