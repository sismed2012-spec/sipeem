-- Fix: Make legacy column optional for backward compatibility during normalization
ALTER TABLE historial_electoral ALTER COLUMN partido_ganador DROP NOT NULL;
