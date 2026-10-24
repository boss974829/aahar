-- Private food & fitness journal. Meal content is ciphertext; user_id is the
-- authenticated account. Queries are always scoped to that id in server code.
create table if not exists vaults (
  user_id text primary key,
  wrap_cipher text not null,
  wrap_iv text not null,
  wrap_salt text not null,
  profile_cipher text,
  profile_iv text,
  updated_at timestamptz not null default now()
);

create table if not exists logs (
  id text primary key,
  user_id text not null,
  kind text not null,
  logged_on date not null,
  cipher text not null,
  iv text not null,
  created_at timestamptz not null default now(),
  constraint logs_kind_chk check (kind in ('meal', 'activity', 'weight'))
);

create index if not exists logs_user_day_idx on logs (user_id, logged_on desc);
