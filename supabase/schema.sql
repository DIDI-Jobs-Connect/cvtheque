-- =============================================================================
-- CVthèque : base de données Supabase
-- À coller dans Supabase → SQL Editor → New query → Run. Peut être relancé sans risque.
-- Sécurité : les visiteurs ne peuvent que déposer un CV (fonction deposer_cv + envoi du
-- fichier dans le dossier « depots/ »). Lire, chercher, modifier : réservé aux comptes
-- listés dans la table equipe.
-- =============================================================================

create extension if not exists unaccent with schema extensions;

-- Recherche sans accents : « comptabilite » trouve « comptabilité ».
create or replace function public.sans_accents(t text) returns text
language sql immutable parallel safe set search_path = '' as
$$ select extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(t, '')) $$;

-- Membres de l'équipe autorisés à consulter la CVthèque.
create table if not exists public.equipe (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  ajoute_le timestamptz not null default now()
);

create or replace function public.est_equipe() returns boolean
language sql stable security definer set search_path = '' as
$$ select exists (select 1 from public.equipe where user_id = auth.uid()) $$;

create table if not exists public.candidats (
  id uuid primary key default gen_random_uuid(),
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  prenom text not null,
  nom text not null,
  telephone text,
  telephone_chiffres text,
  email text,
  ville text,
  pays text not null default 'Bénin',
  postes text not null,
  domaine text not null,
  contrats text[] not null default '{}',
  niveau text,
  experience int check (experience between 0 and 60),
  disponibilite text,
  pretentions text,
  langues text,
  competences text,
  linkedin text,
  message text,
  cv_chemin text,
  cv_nom text,
  anciens_cv jsonb not null default '[]',
  source text,
  consentement_le timestamptz,
  statut text not null default 'nouveau'
    check (statut in ('nouveau', 'qualifie', 'propose', 'entretien', 'place', 'archive')),
  note int check (note between 0 and 5),
  etiquettes text[] not null default '{}',
  recherche tsvector generated always as (
    to_tsvector('french'::regconfig, public.sans_accents(
      coalesce(prenom, '') || ' ' || coalesce(nom, '') || ' ' || coalesce(postes, '') || ' ' ||
      coalesce(domaine, '') || ' ' || coalesce(competences, '') || ' ' || coalesce(ville, '') || ' ' ||
      coalesce(niveau, '') || ' ' || coalesce(langues, '') || ' ' || coalesce(message, '')
    ))
  ) stored
);
create index if not exists candidats_recherche_idx on public.candidats using gin (recherche);
create index if not exists candidats_domaine_idx on public.candidats (domaine);
create index if not exists candidats_statut_idx on public.candidats (statut);
create index if not exists candidats_cree_idx on public.candidats (cree_le desc);
create index if not exists candidats_email_idx on public.candidats (lower(email));
create index if not exists candidats_tel_idx on public.candidats (telephone_chiffres);

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  candidat_id uuid not null references public.candidats (id) on delete cascade,
  auteur text default (auth.jwt() ->> 'email'),
  texte text not null,
  cree_le timestamptz not null default now()
);
create index if not exists notes_candidat_idx on public.notes (candidat_id, cree_le desc);

-- Demandes de profils (besoins des recruteurs) et candidats proposés pour chacune.
create table if not exists public.demandes (
  id uuid primary key default gen_random_uuid(),
  cree_le timestamptz not null default now(),
  titre text not null,
  client text,
  domaine text,
  ville text,
  details text,
  echeance date,
  statut text not null default 'ouverte' check (statut in ('ouverte', 'pourvue', 'fermee'))
);

create table if not exists public.demande_candidats (
  demande_id uuid not null references public.demandes (id) on delete cascade,
  candidat_id uuid not null references public.candidats (id) on delete cascade,
  etape text not null default 'propose' check (etape in ('propose', 'retenu', 'refuse')),
  ajoute_le timestamptz not null default now(),
  primary key (demande_id, candidat_id)
);

-- Accès : équipe uniquement, pour toutes les tables.
alter table public.equipe enable row level security;
alter table public.candidats enable row level security;
alter table public.notes enable row level security;
alter table public.demandes enable row level security;
alter table public.demande_candidats enable row level security;

drop policy if exists equipe_lecture on public.equipe;
create policy equipe_lecture on public.equipe for select to authenticated using (public.est_equipe());
drop policy if exists candidats_equipe on public.candidats;
create policy candidats_equipe on public.candidats for all to authenticated using (public.est_equipe()) with check (public.est_equipe());
drop policy if exists notes_equipe on public.notes;
create policy notes_equipe on public.notes for all to authenticated using (public.est_equipe()) with check (public.est_equipe());
drop policy if exists demandes_equipe on public.demandes;
create policy demandes_equipe on public.demandes for all to authenticated using (public.est_equipe()) with check (public.est_equipe());
drop policy if exists demande_candidats_equipe on public.demande_candidats;
create policy demande_candidats_equipe on public.demande_candidats for all to authenticated using (public.est_equipe()) with check (public.est_equipe());

create or replace function public.chiffres_tel(t text) returns text
language sql immutable set search_path = '' as
$$ select nullif(regexp_replace(regexp_replace(coalesce(t, ''), '\D', '', 'g'), '^(00)?229', ''), '') $$;

-- Dépôt public d'un CV. Si la personne est déjà dans la CVthèque (même email ou même
-- téléphone), sa fiche est mise à jour et l'ancien CV reste consultable dans l'historique.
create or replace function public.deposer_cv(d jsonb) returns text
language plpgsql security definer set search_path = '' as
$$
declare
  v_email text := lower(nullif(trim(d ->> 'email'), ''));
  v_tel text := public.chiffres_tel(d ->> 'telephone');
  v_cv text := nullif(d ->> 'cv_chemin', '');
  v_id uuid;
  v_ancien text;
  v_ancien_nom text;
  v_contrats text[];
begin
  if coalesce((d ->> 'consentement')::boolean, false) is not true then
    raise exception 'consentement requis';
  end if;
  if length(trim(coalesce(d ->> 'prenom', ''))) < 1 or length(trim(coalesce(d ->> 'nom', ''))) < 1
     or length(trim(coalesce(d ->> 'postes', ''))) < 2 or length(trim(coalesce(d ->> 'domaine', ''))) < 2 then
    raise exception 'champs obligatoires manquants';
  end if;
  if v_tel is null and v_email is null then
    raise exception 'telephone ou email requis';
  end if;
  if v_cv is null or v_cv !~ '^depots/[0-9a-f-]{36}\.(pdf|doc|docx)$' then
    raise exception 'cv invalide';
  end if;
  select coalesce(array_agg(x), '{}') into v_contrats
    from jsonb_array_elements_text(coalesce(d -> 'contrats', '[]')) x;

  select id, cv_chemin, cv_nom into v_id, v_ancien, v_ancien_nom from public.candidats
   where (v_email is not null and lower(email) = v_email) or (v_tel is not null and telephone_chiffres = v_tel)
   order by modifie_le desc limit 1;

  if v_id is null then
    insert into public.candidats (prenom, nom, telephone, telephone_chiffres, email, ville, pays, postes, domaine,
      contrats, niveau, experience, disponibilite, pretentions, langues, competences, linkedin, message,
      cv_chemin, cv_nom, source, consentement_le)
    values (left(trim(d ->> 'prenom'), 80), left(trim(d ->> 'nom'), 80), left(d ->> 'telephone', 40), v_tel,
      left(v_email, 160), left(d ->> 'ville', 80), coalesce(nullif(left(d ->> 'pays', 60), ''), 'Bénin'),
      left(d ->> 'postes', 300), left(d ->> 'domaine', 80), v_contrats, left(d ->> 'niveau', 60),
      nullif(d ->> 'experience', '')::int, left(d ->> 'disponibilite', 60), left(d ->> 'pretentions', 80),
      left(d ->> 'langues', 160), left(d ->> 'competences', 1000), left(d ->> 'linkedin', 300),
      left(d ->> 'message', 1000), v_cv, left(d ->> 'cv_nom', 200), left(d ->> 'source', 60), now());
    return 'nouveau';
  end if;

  update public.candidats set
    modifie_le = now(), prenom = left(trim(d ->> 'prenom'), 80), nom = left(trim(d ->> 'nom'), 80),
    telephone = coalesce(left(d ->> 'telephone', 40), telephone), telephone_chiffres = coalesce(v_tel, telephone_chiffres),
    email = coalesce(left(v_email, 160), email), ville = left(d ->> 'ville', 80),
    pays = coalesce(nullif(left(d ->> 'pays', 60), ''), pays), postes = left(d ->> 'postes', 300),
    domaine = left(d ->> 'domaine', 80), contrats = v_contrats, niveau = left(d ->> 'niveau', 60),
    experience = nullif(d ->> 'experience', '')::int, disponibilite = left(d ->> 'disponibilite', 60),
    pretentions = left(d ->> 'pretentions', 80), langues = left(d ->> 'langues', 160),
    competences = left(d ->> 'competences', 1000), linkedin = left(d ->> 'linkedin', 300),
    message = left(d ->> 'message', 1000), cv_chemin = v_cv, cv_nom = left(d ->> 'cv_nom', 200),
    anciens_cv = case when v_ancien is null then anciens_cv
      else anciens_cv || jsonb_build_object('chemin', v_ancien, 'nom', v_ancien_nom, 'remplace_le', now()) end,
    consentement_le = now()
  where id = v_id;
  insert into public.notes (candidat_id, auteur, texte) values (v_id, 'CVthèque', 'Fiche et CV mis à jour par la personne elle-même.');
  return 'mis_a_jour';
end;
$$;

revoke all on function public.deposer_cv(jsonb) from public;
grant execute on function public.deposer_cv(jsonb) to anon, authenticated;

-- Statistiques rapides pour le tableau de bord de l'équipe.
create or replace function public.stats_cvtheque() returns jsonb
language sql stable security definer set search_path = '' as
$$
  select case when not public.est_equipe() then null else jsonb_build_object(
    'total', (select count(*) from public.candidats where statut <> 'archive'),
    'semaine', (select count(*) from public.candidats where cree_le > now() - interval '7 days'),
    'demandes', (select count(*) from public.demandes where statut = 'ouverte'),
    'domaines', (select coalesce(jsonb_object_agg(domaine, n), '{}') from
      (select domaine, count(*) n from public.candidats where statut <> 'archive' group by domaine) s)
  ) end
$$;
revoke all on function public.stats_cvtheque() from public;
grant execute on function public.stats_cvtheque() to authenticated;

-- Fichiers : dossier privé « cv » (PDF ou Word, 5 Mo maximum).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cv', 'cv', false, 5242880, array[
  'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists cv_depot_public on storage.objects;
create policy cv_depot_public on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'cv' and name ~ '^depots/[0-9a-f-]{36}\.(pdf|doc|docx)$');
drop policy if exists cv_equipe_lecture on storage.objects;
create policy cv_equipe_lecture on storage.objects for select to authenticated
  using (bucket_id = 'cv' and public.est_equipe());
drop policy if exists cv_equipe_ajout on storage.objects;
create policy cv_equipe_ajout on storage.objects for insert to authenticated
  with check (bucket_id = 'cv' and public.est_equipe());
drop policy if exists cv_equipe_suppression on storage.objects;
create policy cv_equipe_suppression on storage.objects for delete to authenticated
  using (bucket_id = 'cv' and public.est_equipe());
