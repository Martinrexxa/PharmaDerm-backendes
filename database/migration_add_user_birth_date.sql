-- Migration: add birth_date to public.users
-- Execute in Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- Safe to run multiple times (IF NOT EXISTS / IF NOT EXISTS logic).

ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS birth_date DATE;

-- Optional index for age-range queries
CREATE INDEX IF NOT EXISTS idx_users_birth_date ON public.users (birth_date);
