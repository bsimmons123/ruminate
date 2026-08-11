create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists user_data (
  user_id uuid not null references users(id) on delete cascade,
  kind text not null check (kind in ('library', 'passage', 'review', 'settings')),
  item_id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, kind, item_id)
);

create index if not exists user_data_owner_kind on user_data(user_id, kind);

create table if not exists esv_requests (
  id bigserial primary key,
  requested_at timestamptz not null default now()
);
create index if not exists esv_requests_time on esv_requests(requested_at);

create table if not exists community_collections (
  id text primary key,
  title text not null,
  description text not null,
  curator text not null,
  category text not null,
  verse_ids jsonb not null default '[]'::jsonb,
  featured boolean not null default false,
  created_at timestamptz not null default now()
);

insert into community_collections(id,title,description,curator,category,verse_ids,featured) values
  ('community-anxious-heart','For the Anxious Heart','Promises to return to when your thoughts feel heavy.','Grace Community','Peace','["php-4-6-7","ps-46-10","matt-11-28","isa-41-10"]',true),
  ('community-first-verses','First Verses to Memorize','A welcoming starting point for building a Scripture-memory rhythm.','Selah Community','Foundations','["john-3-16","prov-3-5-6","ps-119-11","heb-11-1"]',true),
  ('community-courage','Courage for the Week','Words of courage, trust, and purpose for uncertain days.','The Way Fellowship','Courage','["josh-1-9","isa-41-10","rom-8-28","prov-3-5-6"]',false)
on conflict (id) do nothing;
