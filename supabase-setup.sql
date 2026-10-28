-- Marea Infernal: ranking global.
-- Pegar en Supabase -> SQL Editor -> Run (se puede correr mas de una vez).

create table if not exists public.scores (
  id         uuid primary key default gen_random_uuid(),
  name       text        not null default 'Anónimo',
  score      integer     not null,
  wave       integer     not null,
  level      integer     not null default 1,
  kills      integer     not null default 0,
  loot       integer     not null default 0,
  ash        integer     not null default 0,
  boss       boolean     not null default false,
  victory    boolean     not null default false,  -- true = supero el Desafio final
  created_at timestamptz not null default now(),

  -- limites de cordura: frenan los valores absurdos mandados desde fuera del juego
  constraint scores_name_len  check (char_length(name) between 1 and 14),
  constraint scores_score_rng check (score between 0 and 10000000),
  constraint scores_wave_rng  check (wave  between 0 and 500),
  constraint scores_level_rng check (level between 0 and 1000),
  constraint scores_kills_rng check (kills between 0 and 1000000),
  constraint scores_loot_rng  check (loot  between 0 and 1000000),
  constraint scores_ash_rng   check (ash   between 0 and 100000000)
);

-- tablas ya creadas antes de existir `victory`: agrega la columna (no toca los datos existentes)
alter table public.scores add column if not exists victory boolean not null default false;
-- jefes derrotados en la partida
alter table public.scores add column if not exists bosses integer not null default 0;
-- clase jugada (id del arma: bow, staff o axe)
alter table public.scores add column if not exists weapon text not null default '';
alter table public.scores drop constraint if exists scores_weapon_len;
alter table public.scores add constraint scores_weapon_len check (char_length(weapon) <= 10);
alter table public.scores drop constraint if exists scores_bosses_rng;
alter table public.scores add constraint scores_bosses_rng check (bosses between 0 and 1000);

-- dificultad de la partida: easy, normal o hard. Las partidas anteriores a las dificultades quedan como 'hard' (la original)
alter table public.scores add column if not exists difficulty text not null default 'hard';
alter table public.scores drop constraint if exists scores_difficulty_chk;
alter table public.scores add constraint scores_difficulty_chk check (difficulty in ('easy', 'normal', 'hard'));

create index if not exists scores_score_idx on public.scores (score desc);
-- el ranking se lee por dificultad: indice para "top por dificultad"
create index if not exists scores_diff_score_idx on public.scores (difficulty, score desc);

alter table public.scores enable row level security;

-- cualquiera puede LEER el ranking y AGREGAR una partida; nadie puede editar ni borrar
drop policy if exists "scores_read"   on public.scores;
drop policy if exists "scores_insert" on public.scores;
create policy "scores_read"   on public.scores for select to anon, authenticated using (true);
create policy "scores_insert" on public.scores for insert to anon, authenticated with check (true);

grant select, insert on public.scores to anon, authenticated;
