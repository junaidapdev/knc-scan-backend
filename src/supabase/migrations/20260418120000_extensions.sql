-- Kayan Sweets V1 — Chunk 1 Migration 00: Postgres extensions
-- Applied first; every subsequent migration may assume these are available.

create extension if not exists "pgcrypto";  -- gen_random_uuid()
create extension if not exists "citext";    -- case-insensitive text (admin emails)
