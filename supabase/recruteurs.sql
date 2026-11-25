-- =============================================================================
-- CVthèque : espace recruteurs (comptes validés par l'équipe, accès aux CV sur accord).
-- À exécuter APRÈS schema.sql, crm.sql et offres.sql (SQL Editor → New query → Run).
-- Peut être relancé sans risque : rien n'est supprimé.
--
-- Principe : un recruteur ne lit JAMAIS les tables directement. Il passe par des fonctions
-- qui ne renvoient que ce qu'il a le droit de voir :
--   - la CVthèque anonyme (sans nom, sans contact, sans CV) ;
--   - les candidats présentés sur SES postes, ou dont l'équipe lui a accordé le CV.
-- Le téléphone et l'email des candidats ne lui sont jamais transmis.
-- =============================================================================

create table if not exists public.recruteurs (
  user_id uuid primary key references auth.users (id) on delete cascade,
  cree_le timestamptz not null default now(),
  email text not null,
  nom text not null,
  entreprise text not null,
  fonction text,
  telephone text,
  entreprise_id uuid references public.entreprises (id) on delete set null,
  statut text not null default 'en_attente' check (statut in ('en_attente', 'valide', 'suspendu')),
  valide_le timestamptz
);

create table if not exists public.acces_cv (
  id uuid primary key default gen_random_uuid(),
  cree_le timestamptz not null default now(),
  recruteur_id uuid not null references public.recruteurs (user_id) on delete cascade,
  candidat_id uuid not null references public.candidats (id) on delete cascade,
  message text,
  statut text not null default 'demande' check (statut in ('demande', 'accorde', 'refuse')),
  decide_le timestamptz,
  unique (recruteur_id, candidat_id)
);
create index if not exists acces_cv_statut_idx on public.acces_cv (statut, cree_le desc);

alter table public.demandes add column if not exists recruteur_id uuid references public.recruteurs (user_id) on delete set null;
alter table public.demandes_entreprises add column if not exists recruteur_id uuid references public.recruteurs (user_id) on delete set null;

alter table public.recruteurs enable row level security;
alter table public.acces_cv enable row level security;
drop policy if exists recruteurs_equipe on public.recruteurs;
create policy recruteurs_equipe on public.recruteurs for all to authenticated using (public.est_equipe()) with check (public.est_equipe());
drop policy if exists acces_cv_equipe on public.acces_cv;
create policy acces_cv_equipe on public.acces_cv for all to authenticated using (public.est_equipe()) with check (public.est_equipe());

create or replace function public.est_recruteur() returns boolean
language sql stable security definer set search_path = '' as
$$ select exists (select 1 from public.recruteurs where user_id = auth.uid() and statut = 'valide') $$;

-- Le recruteur peut-il voir ce candidat en entier (nom, profil, CV) ?
create or replace function public.recruteur_voit(c uuid) returns boolean
language sql stable security definer set search_path = '' as
$$
  select public.est_recruteur() and (
    exists (select 1 from public.acces_cv where recruteur_id = auth.uid() and candidat_id = c and statut = 'accorde')
    or exists (select 1 from public.demande_candidats dc join public.demandes d on d.id = dc.demande_id
               where d.recruteur_id = auth.uid() and dc.candidat_id = c
                 and dc.etape in ('presente', 'entretien', 'offre', 'place'))
  )
$$;

-- Fichiers : le recruteur ne peut ouvrir que le CV des candidats qu'il a le droit de voir.
create or replace function public.cv_visible_recruteur(chemin text) returns boolean
language sql stable security definer set search_path = '' as
$$ select exists (select 1 from public.candidats c where c.cv_chemin = chemin and public.recruteur_voit(c.id)) $$;
drop policy if exists cv_recruteur_lecture on storage.objects;
create policy cv_recruteur_lecture on storage.objects for select to authenticated
  using (bucket_id = 'cv' and public.cv_visible_recruteur(name));

-- ---------- Compte ----------
create or replace function public.mon_compte_recruteur() returns jsonb
language sql stable security definer set search_path = '' as
$$
  select case when public.est_equipe() then jsonb_build_object('equipe', true)
    else (select to_jsonb(r) - 'entreprise_id' from public.recruteurs r where r.user_id = auth.uid()) end
$$;

create or replace function public.inscrire_recruteur(d jsonb) returns text
language plpgsql security definer set search_path = '' as
$$
begin
  if auth.uid() is null then raise exception 'connexion requise'; end if;
  if length(trim(coalesce(d ->> 'nom', ''))) < 2 or length(trim(coalesce(d ->> 'entreprise', ''))) < 2 then
    raise exception 'champs obligatoires manquants';
  end if;
  insert into public.recruteurs (user_id, email, nom, entreprise, fonction, telephone)
  values (auth.uid(), coalesce(auth.jwt() ->> 'email', ''), left(trim(d ->> 'nom'), 120), left(trim(d ->> 'entreprise'), 160),
          left(d ->> 'fonction', 120), left(d ->> 'telephone', 40))
  on conflict (user_id) do update set nom = excluded.nom, entreprise = excluded.entreprise,
    fonction = excluded.fonction, telephone = excluded.telephone;
  return 'ok';
end;
$$;

-- ---------- CVthèque anonyme ----------
create or replace function public.catalogue_recruteur(q text default '', dom text default '', page int default 0) returns jsonb
language plpgsql stable security definer set search_path = '' as
$$
declare
  resultat jsonb;
  requete tsquery;
begin
  if not public.est_recruteur() then raise exception 'accès réservé aux recruteurs validés'; end if;
  if length(trim(coalesce(q, ''))) > 1 then
    requete := websearch_to_tsquery('french'::regconfig, public.sans_accents(q));
  end if;
  select jsonb_build_object(
    'total', (select count(*) from public.candidats c
               where c.statut not in ('archive', 'place') and (dom = '' or dom is null or c.domaine = dom)
                 and (requete is null or c.recherche @@ requete)),
    'profils', coalesce(jsonb_agg(p), '[]')) into resultat
  from (
    select c.id, c.domaine, c.postes, c.ville, c.experience, c.niveau, left(c.competences, 300) as competences,
           c.langues, c.disponibilite, c.contrats, (c.cv_chemin is not null) as a_un_cv,
           (select a.statut from public.acces_cv a where a.recruteur_id = auth.uid() and a.candidat_id = c.id) as acces
      from public.candidats c
     where c.statut not in ('archive', 'place') and (dom = '' or dom is null or c.domaine = dom)
       and (requete is null or c.recherche @@ requete)
     order by c.modifie_le desc
     limit 30 offset greatest(0, coalesce(page, 0)) * 30
  ) p;
  return resultat;
end;
$$;

create or replace function public.demander_cv(candidat uuid, message text default '') returns text
language plpgsql security definer set search_path = '' as
$$
declare
  v_nom text;
  v_postes text;
begin
  if not public.est_recruteur() then raise exception 'accès réservé aux recruteurs validés'; end if;
  select r.entreprise into v_nom from public.recruteurs r where r.user_id = auth.uid();
  select c.postes into v_postes from public.candidats c where c.id = candidat and c.statut <> 'archive';
  if v_postes is null then raise exception 'profil introuvable'; end if;
  insert into public.acces_cv (recruteur_id, candidat_id, message)
  values (auth.uid(), candidat, left(message, 1000))
  on conflict (recruteur_id, candidat_id) do nothing;
  if found then
    insert into public.relances (titre, echeance, candidat_id, auteur)
    values ('Demande de CV de ' || v_nom || ' (' || left(v_postes, 60) || ')', current_date, candidat, 'Espace recruteur');
  end if;
  return 'ok';
end;
$$;

-- ---------- Profils accessibles et postes du recruteur ----------
create or replace function public.profils_accessibles() returns jsonb
language plpgsql stable security definer set search_path = '' as
$$
begin
  if not public.est_recruteur() then raise exception 'accès réservé aux recruteurs validés'; end if;
  return coalesce((
    select jsonb_agg(x order by x.depuis desc) from (
      select c.id, c.prenom, c.nom, c.postes, c.domaine, c.ville, c.experience, c.niveau, c.competences,
             c.langues, c.disponibilite, c.pretentions, c.cv_chemin, c.cv_nom, c.telephone, c.email,
             coalesce(a.decide_le, a.cree_le) as depuis
        from public.acces_cv a join public.candidats c on c.id = a.candidat_id
       where a.recruteur_id = auth.uid() and a.statut = 'accorde'
    ) x), '[]');
end;
$$;

create or replace function public.mes_postes_recruteur() returns jsonb
language plpgsql stable security definer set search_path = '' as
$$
begin
  if not public.est_recruteur() then raise exception 'accès réservé aux recruteurs validés'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', d.id, 'titre', d.titre, 'ville', d.ville, 'contrat', d.contrat, 'statut', d.statut, 'cree_le', d.cree_le,
      'profils', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', c.id, 'prenom', c.prenom, 'nom', c.nom, 'postes', c.postes, 'domaine', c.domaine, 'ville', c.ville,
          'experience', c.experience, 'niveau', c.niveau, 'competences', c.competences, 'langues', c.langues,
          'disponibilite', c.disponibilite, 'pretentions', c.pretentions, 'cv_chemin', c.cv_chemin, 'cv_nom', c.cv_nom, 'telephone', c.telephone, 'email', c.email,
          'etape', dc.etape, 'avis', dc.avis_recruteur, 'commentaire', dc.avis_commentaire) order by dc.modifie_le desc)
        from public.demande_candidats dc join public.candidats c on c.id = dc.candidat_id
        where dc.demande_id = d.id and dc.etape in ('presente', 'entretien', 'offre', 'place')), '[]')
    ) order by d.statut, d.cree_le desc)
    from public.demandes d where d.recruteur_id = auth.uid()), '[]');
end;
$$;

create or replace function public.avis_recruteur_compte(demande uuid, candidat uuid, avis text, commentaire text) returns text
language plpgsql security definer set search_path = '' as
$$
declare
  v_titre text;
  v_nom text;
begin
  if not public.est_recruteur() then raise exception 'accès réservé aux recruteurs validés'; end if;
  if avis not in ('rencontrer', 'reserve', 'non') then raise exception 'avis invalide'; end if;
  select titre into v_titre from public.demandes where id = demande and recruteur_id = auth.uid();
  if v_titre is null then raise exception 'poste introuvable'; end if;
  update public.demande_candidats set avis_recruteur = avis, avis_commentaire = left(commentaire, 1000), avis_le = now(), modifie_le = now()
   where demande_id = demande and candidat_id = candidat and etape in ('presente', 'entretien', 'offre', 'place');
  if not found then raise exception 'profil introuvable'; end if;
  select prenom || ' ' || nom into v_nom from public.candidats where id = candidat;
  insert into public.notes (candidat_id, demande_id, auteur, type, texte)
  values (candidat, demande, 'Recruteur', 'note', 'Avis du recruteur sur « ' || v_titre || ' » : '
    || case avis when 'rencontrer' then 'veut le/la rencontrer' when 'reserve' then 'à garder en réserve' else 'non retenu' end
    || coalesce(' — ' || nullif(left(commentaire, 1000), ''), ''));
  if avis = 'rencontrer' then
    insert into public.relances (titre, echeance, candidat_id, demande_id, auteur)
    values ('Organiser l''entretien de ' || v_nom || ' (demandé par le recruteur)', current_date, candidat, demande, 'Recruteur');
  end if;
  return 'ok';
end;
$$;

-- Demande de profils envoyée depuis l'espace recruteur : rattachée au compte.
create or replace function public.deposer_demande_entreprise(d jsonb) returns text
language plpgsql security definer set search_path = '' as
$$
begin
  if length(trim(coalesce(d ->> 'entreprise', ''))) < 2 or length(trim(coalesce(d ->> 'contact_nom', ''))) < 2
     or length(trim(coalesce(d ->> 'poste', ''))) < 2 or public.chiffres_tel(d ->> 'telephone') is null then
    raise exception 'champs obligatoires manquants';
  end if;
  if (select count(*) from public.demandes_entreprises where cree_le > now() - interval '10 minutes') > 20 then
    raise exception 'trop de demandes, réessayez plus tard';
  end if;
  insert into public.demandes_entreprises (entreprise, secteur, ville, contact_nom, fonction, telephone, email,
    poste, nb_postes, contrat, experience_min, budget, echeance, details, formule, recruteur_id)
  values (left(trim(d ->> 'entreprise'), 160), left(d ->> 'secteur', 120), left(d ->> 'ville', 80),
    left(trim(d ->> 'contact_nom'), 120), left(d ->> 'fonction', 120), left(d ->> 'telephone', 40),
    left(lower(nullif(trim(d ->> 'email'), '')), 160), left(trim(d ->> 'poste'), 200),
    greatest(1, least(99, coalesce(nullif(d ->> 'nb_postes', '')::int, 1))), left(d ->> 'contrat', 60),
    nullif(d ->> 'experience_min', '')::int, left(d ->> 'budget', 120),
    nullif(d ->> 'echeance', '')::date, left(d ->> 'details', 3000), left(d ->> 'formule', 80),
    case when public.est_recruteur() then auth.uid() end);
  return 'ok';
end;
$$;

revoke all on function public.est_recruteur() from public;
revoke all on function public.recruteur_voit(uuid) from public;
revoke all on function public.cv_visible_recruteur(text) from public;
revoke all on function public.mon_compte_recruteur() from public;
revoke all on function public.inscrire_recruteur(jsonb) from public;
revoke all on function public.catalogue_recruteur(text, text, int) from public;
revoke all on function public.demander_cv(uuid, text) from public;
revoke all on function public.profils_accessibles() from public;
revoke all on function public.mes_postes_recruteur() from public;
revoke all on function public.avis_recruteur_compte(uuid, uuid, text, text) from public;
revoke all on function public.deposer_demande_entreprise(jsonb) from public;
grant execute on function public.est_recruteur(), public.recruteur_voit(uuid), public.cv_visible_recruteur(text),
  public.mon_compte_recruteur(), public.inscrire_recruteur(jsonb), public.catalogue_recruteur(text, text, int),
  public.demander_cv(uuid, text), public.profils_accessibles(), public.mes_postes_recruteur(),
  public.avis_recruteur_compte(uuid, uuid, text, text) to authenticated;
grant execute on function public.deposer_demande_entreprise(jsonb) to anon, authenticated;

-- ---------- Tableau de bord de l'équipe : comptes et demandes de CV à traiter ----------
create or replace function public.a_traiter_recruteurs() returns jsonb
language sql stable security definer set search_path = '' as
$$
  select case when not public.est_equipe() then null else jsonb_build_object(
    'comptes', (select count(*) from public.recruteurs where statut = 'en_attente'),
    'demandes_cv', (select count(*) from public.acces_cv where statut = 'demande')
  ) end
$$;
revoke all on function public.a_traiter_recruteurs() from public;
grant execute on function public.a_traiter_recruteurs() to authenticated;

-- ---------- Types de comptes (entreprise / cabinet), identique à types-comptes.sql ----------
alter table public.recruteurs add column if not exists type_compte text not null default 'cabinet';
alter table public.recruteurs drop constraint if exists recruteurs_type_compte_check;
alter table public.recruteurs add constraint recruteurs_type_compte_check check (type_compte in ('entreprise', 'cabinet'));

create or replace function public.inscrire_recruteur(d jsonb) returns text
language plpgsql security definer set search_path = '' as
$$
declare
  v_type text := case when d ->> 'type_compte' in ('entreprise', 'cabinet') then d ->> 'type_compte' else 'cabinet' end;
begin
  if auth.uid() is null then raise exception 'connexion requise'; end if;
  if length(trim(coalesce(d ->> 'nom', ''))) < 2 or length(trim(coalesce(d ->> 'entreprise', ''))) < 2 then
    raise exception 'champs obligatoires manquants';
  end if;
  insert into public.recruteurs (user_id, email, nom, entreprise, fonction, telephone, type_compte)
  values (auth.uid(), coalesce(auth.jwt() ->> 'email', ''), left(trim(d ->> 'nom'), 120), left(trim(d ->> 'entreprise'), 160),
          left(d ->> 'fonction', 120), left(d ->> 'telephone', 40), v_type)
  on conflict (user_id) do update set nom = excluded.nom, entreprise = excluded.entreprise,
    fonction = excluded.fonction, telephone = excluded.telephone,
    type_compte = case when d ->> 'type_compte' in ('entreprise', 'cabinet') then excluded.type_compte else recruteurs.type_compte end;
  return 'ok';
end;
$$;
