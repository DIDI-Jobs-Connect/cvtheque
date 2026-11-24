-- =============================================================================
-- CVthèque : module CRM (entreprises clientes, contacts, postes, pipeline, relances,
-- journal d'activité). À coller dans Supabase → SQL Editor → New query → Run, APRÈS schema.sql.
-- Peut être relancé sans risque. Les données existantes sont conservées.
-- =============================================================================

-- Entreprises clientes et leurs contacts.
create table if not exists public.entreprises (
  id uuid primary key default gen_random_uuid(),
  cree_le timestamptz not null default now(),
  nom text not null,
  secteur text,
  ville text,
  adresse text,
  site text,
  statut text not null default 'client' check (statut in ('prospect', 'client', 'inactif')),
  notes text
);
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises (id) on delete cascade,
  cree_le timestamptz not null default now(),
  nom text not null,
  fonction text,
  telephone text,
  email text
);
create index if not exists contacts_entreprise_idx on public.contacts (entreprise_id);

-- Postes à pourvoir : les demandes deviennent des postes rattachés à une entreprise.
alter table public.demandes add column if not exists entreprise_id uuid references public.entreprises (id) on delete set null;
alter table public.demandes add column if not exists contact_id uuid references public.contacts (id) on delete set null;
alter table public.demandes add column if not exists contrat text;
alter table public.demandes add column if not exists experience_min int;
alter table public.demandes add column if not exists salaire text;
alter table public.demandes add column if not exists nb_postes int not null default 1;
create index if not exists demandes_entreprise_idx on public.demandes (entreprise_id);

-- Pipeline : étapes d'un candidat sur un poste.
alter table public.demande_candidats add column if not exists modifie_le timestamptz not null default now();
alter table public.demande_candidats drop constraint if exists demande_candidats_etape_check;
update public.demande_candidats set etape = 'presente' where etape = 'propose';
update public.demande_candidats set etape = 'offre' where etape = 'retenu';
alter table public.demande_candidats alter column etape set default 'source';
alter table public.demande_candidats add constraint demande_candidats_etape_check
  check (etape in ('source', 'contacte', 'presente', 'entretien', 'offre', 'place', 'refuse'));

-- Journal d'activité : les notes deviennent typées et peuvent viser une entreprise ou un poste.
alter table public.notes add column if not exists type text not null default 'note';
alter table public.notes add column if not exists entreprise_id uuid references public.entreprises (id) on delete cascade;
alter table public.notes add column if not exists demande_id uuid references public.demandes (id) on delete cascade;
alter table public.notes alter column candidat_id drop not null;
alter table public.notes drop constraint if exists notes_type_check;
alter table public.notes add constraint notes_type_check check (type in ('note', 'appel', 'whatsapp', 'email', 'entretien', 'rencontre'));
create index if not exists notes_entreprise_idx on public.notes (entreprise_id, cree_le desc);

-- Relances : tâches datées liées à un candidat, une entreprise ou un poste.
create table if not exists public.relances (
  id uuid primary key default gen_random_uuid(),
  cree_le timestamptz not null default now(),
  titre text not null,
  echeance date not null default current_date,
  fait boolean not null default false,
  fait_le timestamptz,
  auteur text default (auth.jwt() ->> 'email'),
  candidat_id uuid references public.candidats (id) on delete cascade,
  entreprise_id uuid references public.entreprises (id) on delete cascade,
  demande_id uuid references public.demandes (id) on delete cascade
);
create index if not exists relances_echeance_idx on public.relances (fait, echeance);

alter table public.entreprises enable row level security;
alter table public.contacts enable row level security;
alter table public.relances enable row level security;
drop policy if exists entreprises_equipe on public.entreprises;
create policy entreprises_equipe on public.entreprises for all to authenticated using (public.est_equipe()) with check (public.est_equipe());
drop policy if exists contacts_equipe on public.contacts;
create policy contacts_equipe on public.contacts for all to authenticated using (public.est_equipe()) with check (public.est_equipe());
drop policy if exists relances_equipe on public.relances;
create policy relances_equipe on public.relances for all to authenticated using (public.est_equipe()) with check (public.est_equipe());

-- Chiffres du tableau de bord, en un seul appel.
create or replace function public.tableau_de_bord() returns jsonb
language sql stable security definer set search_path = '' as
$$
  select case when not public.est_equipe() then null else jsonb_build_object(
    'actifs', (select count(*) from public.candidats where statut <> 'archive'),
    'semaine', (select count(*) from public.candidats where cree_le > now() - interval '7 days'),
    'semaine_precedente', (select count(*) from public.candidats where cree_le between now() - interval '14 days' and now() - interval '7 days'),
    'postes_ouverts', (select count(*) from public.demandes where statut = 'ouverte'),
    'places_30j', (select count(*) from public.demande_candidats where etape = 'place' and modifie_le > now() - interval '30 days'),
    'en_cours', (select count(*) from public.demande_candidats dc join public.demandes d on d.id = dc.demande_id
                 where d.statut = 'ouverte' and dc.etape not in ('place', 'refuse')),
    'relances_retard', (select count(*) from public.relances where not fait and echeance < current_date),
    'relances_jour', (select count(*) from public.relances where not fait and echeance = current_date),
    'entreprises', (select count(*) from public.entreprises where statut <> 'inactif'),
    'sources', (select coalesce(jsonb_object_agg(s, n), '{}') from
      (select coalesce(nullif(source, ''), 'inconnue') s, count(*) n from public.candidats group by 1) x),
    'domaines', (select coalesce(jsonb_object_agg(domaine, n), '{}') from
      (select domaine, count(*) n from public.candidats where statut <> 'archive' group by domaine) y),
    'etapes', (select coalesce(jsonb_object_agg(etape, n), '{}') from
      (select dc.etape, count(*) n from public.demande_candidats dc join public.demandes d on d.id = dc.demande_id
       where d.statut = 'ouverte' group by dc.etape) z)
  ) end
$$;
revoke all on function public.tableau_de_bord() from public;
grant execute on function public.tableau_de_bord() to authenticated;
