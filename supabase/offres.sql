-- =============================================================================
-- CVthèque : offres publiques, demandes des entreprises, lien privé des recruteurs.
-- À exécuter APRÈS schema.sql et crm.sql (SQL Editor → New query → coller → Run).
-- Peut être relancé sans risque : rien n'est supprimé.
-- =============================================================================

-- ---------- Offres publiques et lien recruteur sur chaque poste ----------
alter table public.demandes add column if not exists publique boolean not null default false;
alter table public.demandes add column if not exists afficher_entreprise boolean not null default false;
alter table public.demandes add column if not exists publiee_le timestamptz;
alter table public.demandes add column if not exists jeton_recruteur uuid unique;
alter table public.demandes add column if not exists jeton_cree_le timestamptz;

alter table public.demande_candidats add column if not exists origine text not null default 'equipe';
alter table public.demande_candidats add column if not exists cv_partage text;
alter table public.demande_candidats add column if not exists avis_recruteur text;
alter table public.demande_candidats add column if not exists avis_commentaire text;
alter table public.demande_candidats add column if not exists avis_le timestamptz;
alter table public.demande_candidats drop constraint if exists demande_candidats_avis_check;
alter table public.demande_candidats add constraint demande_candidats_avis_check
  check (avis_recruteur is null or avis_recruteur in ('rencontrer', 'reserve', 'non'));

-- Liste des offres visibles sur la page publique (sans aucune donnée interne).
create or replace function public.offres_publiques() returns jsonb
language sql stable security definer set search_path = '' as
$$
  select coalesce(jsonb_agg(o order by o.publiee_le desc), '[]') from (
    select d.id, d.titre, d.domaine, d.ville, d.contrat, d.experience_min, d.salaire, d.nb_postes,
           d.details, d.echeance, coalesce(d.publiee_le, d.cree_le) as publiee_le,
           case when d.afficher_entreprise then e.nom end as entreprise
      from public.demandes d left join public.entreprises e on e.id = d.entreprise_id
     where d.publique and d.statut = 'ouverte' and (d.echeance is null or d.echeance >= current_date)
  ) o
$$;
revoke all on function public.offres_publiques() from public;
grant execute on function public.offres_publiques() to anon, authenticated;

-- Dépôt public d'un CV, éventuellement en réponse à une offre (offre_id) :
-- la personne est alors ajoutée directement au pipeline du poste.
create or replace function public.deposer_cv(d jsonb) returns text
language plpgsql security definer set search_path = '' as
$$
declare
  v_email text := lower(nullif(trim(d ->> 'email'), ''));
  v_tel text := public.chiffres_tel(d ->> 'telephone');
  v_cv text := nullif(d ->> 'cv_chemin', '');
  v_offre uuid;
  v_titre text;
  v_id uuid;
  v_ancien text;
  v_ancien_nom text;
  v_contrats text[];
  v_resultat text;
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
  if coalesce(d ->> 'offre_id', '') ~ '^[0-9a-f-]{36}$' then
    select id, titre into v_offre, v_titre from public.demandes
     where id = (d ->> 'offre_id')::uuid and publique and statut = 'ouverte';
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
      left(d ->> 'message', 1000), v_cv, left(d ->> 'cv_nom', 200), left(d ->> 'source', 60), now())
    returning id into v_id;
    v_resultat := 'nouveau';
  else
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
    v_resultat := 'mis_a_jour';
  end if;

  if v_offre is not null then
    insert into public.demande_candidats (demande_id, candidat_id, etape, origine)
    values (v_offre, v_id, 'source', 'candidature')
    on conflict (demande_id, candidat_id) do update set origine = 'candidature', modifie_le = now();
    insert into public.notes (candidat_id, demande_id, auteur, type, texte)
    values (v_id, v_offre, 'CVthèque', 'note', 'A postulé à l''offre « ' || v_titre || ' ».');
  end if;
  return v_resultat;
end;
$$;
revoke all on function public.deposer_cv(jsonb) from public;
grant execute on function public.deposer_cv(jsonb) to anon, authenticated;

-- ---------- Demandes des entreprises (page « Vous recrutez ? ») ----------
create table if not exists public.demandes_entreprises (
  id uuid primary key default gen_random_uuid(),
  cree_le timestamptz not null default now(),
  entreprise text not null,
  secteur text,
  ville text,
  contact_nom text not null,
  fonction text,
  telephone text not null,
  email text,
  poste text not null,
  nb_postes int not null default 1,
  contrat text,
  experience_min int,
  budget text,
  echeance date,
  details text,
  formule text,
  statut text not null default 'nouvelle' check (statut in ('nouvelle', 'contactee', 'convertie', 'refusee')),
  demande_id uuid references public.demandes (id) on delete set null
);
create index if not exists demandes_entreprises_idx on public.demandes_entreprises (statut, cree_le desc);
alter table public.demandes_entreprises enable row level security;
drop policy if exists demandes_entreprises_equipe on public.demandes_entreprises;
create policy demandes_entreprises_equipe on public.demandes_entreprises for all to authenticated
  using (public.est_equipe()) with check (public.est_equipe());

create or replace function public.deposer_demande_entreprise(d jsonb) returns text
language plpgsql security definer set search_path = '' as
$$
begin
  if length(trim(coalesce(d ->> 'entreprise', ''))) < 2 or length(trim(coalesce(d ->> 'contact_nom', ''))) < 2
     or length(trim(coalesce(d ->> 'poste', ''))) < 2 or public.chiffres_tel(d ->> 'telephone') is null then
    raise exception 'champs obligatoires manquants';
  end if;
  -- Garde-fou contre les envois en rafale.
  if (select count(*) from public.demandes_entreprises where cree_le > now() - interval '10 minutes') > 20 then
    raise exception 'trop de demandes, réessayez plus tard';
  end if;
  insert into public.demandes_entreprises (entreprise, secteur, ville, contact_nom, fonction, telephone, email,
    poste, nb_postes, contrat, experience_min, budget, echeance, details, formule)
  values (left(trim(d ->> 'entreprise'), 160), left(d ->> 'secteur', 120), left(d ->> 'ville', 80),
    left(trim(d ->> 'contact_nom'), 120), left(d ->> 'fonction', 120), left(d ->> 'telephone', 40),
    left(lower(nullif(trim(d ->> 'email'), '')), 160), left(trim(d ->> 'poste'), 200),
    greatest(1, least(99, coalesce(nullif(d ->> 'nb_postes', '')::int, 1))), left(d ->> 'contrat', 60),
    nullif(d ->> 'experience_min', '')::int, left(d ->> 'budget', 120),
    nullif(d ->> 'echeance', '')::date, left(d ->> 'details', 3000), left(d ->> 'formule', 80));
  return 'ok';
end;
$$;
revoke all on function public.deposer_demande_entreprise(jsonb) from public;
grant execute on function public.deposer_demande_entreprise(jsonb) to anon, authenticated;

-- ---------- Lien privé des recruteurs ----------
-- Le recruteur voit seulement les candidats présentés sur SON offre, sans téléphone ni email
-- (vous restez l'intermédiaire), et les liens de CV préparés par l'équipe.
create or replace function public.profils_recruteur(j uuid) returns jsonb
language sql stable security definer set search_path = '' as
$$
  select case when d.id is null then null else jsonb_build_object(
    'titre', d.titre, 'ville', d.ville, 'contrat', d.contrat, 'statut', d.statut,
    'entreprise', (select nom from public.entreprises where id = d.entreprise_id),
    'profils', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'prenom', c.prenom, 'nom', c.nom, 'postes', c.postes, 'domaine', c.domaine,
        'ville', c.ville, 'experience', c.experience, 'niveau', c.niveau, 'competences', c.competences,
        'langues', c.langues, 'disponibilite', c.disponibilite, 'pretentions', c.pretentions,
        'etape', dc.etape, 'cv', dc.cv_partage, 'avis', dc.avis_recruteur, 'commentaire', dc.avis_commentaire
      ) order by dc.modifie_le desc)
      from public.demande_candidats dc join public.candidats c on c.id = dc.candidat_id
      where dc.demande_id = d.id and dc.etape in ('presente', 'entretien', 'offre', 'place')
    ), '[]')
  ) end
  from (select * from public.demandes where jeton_recruteur = j) d
  right join (select 1) x on true
$$;
revoke all on function public.profils_recruteur(uuid) from public;
grant execute on function public.profils_recruteur(uuid) to anon, authenticated;

create or replace function public.avis_recruteur(j uuid, candidat uuid, avis text, commentaire text) returns text
language plpgsql security definer set search_path = '' as
$$
declare
  v_demande uuid;
  v_titre text;
  v_nom text;
begin
  if avis not in ('rencontrer', 'reserve', 'non') then raise exception 'avis invalide'; end if;
  select d.id, d.titre into v_demande, v_titre from public.demandes d where d.jeton_recruteur = j;
  if v_demande is null then raise exception 'lien invalide'; end if;
  update public.demande_candidats set avis_recruteur = avis, avis_commentaire = left(commentaire, 1000),
         avis_le = now(), modifie_le = now()
   where demande_id = v_demande and candidat_id = candidat and etape in ('presente', 'entretien', 'offre', 'place');
  if not found then raise exception 'profil introuvable'; end if;
  select prenom || ' ' || nom into v_nom from public.candidats where id = candidat;
  insert into public.notes (candidat_id, demande_id, auteur, type, texte)
  values (candidat, v_demande, 'Recruteur', 'note', 'Avis du recruteur sur « ' || v_titre || ' » : '
    || case avis when 'rencontrer' then 'veut le/la rencontrer' when 'reserve' then 'à garder en réserve' else 'non retenu' end
    || coalesce(' — ' || nullif(left(commentaire, 1000), ''), ''));
  if avis = 'rencontrer' then
    insert into public.relances (titre, echeance, candidat_id, demande_id, auteur)
    values ('Organiser l''entretien de ' || v_nom || ' (demandé par le recruteur)', current_date, candidat, v_demande, 'Recruteur');
  end if;
  return 'ok';
end;
$$;
revoke all on function public.avis_recruteur(uuid, uuid, text, text) from public;
grant execute on function public.avis_recruteur(uuid, uuid, text, text) to anon, authenticated;

-- ---------- Tableau de bord : nouvelles demandes et candidatures ----------
create or replace function public.tableau_de_bord() returns jsonb
language sql stable security definer set search_path = '' as
$$
  select case when not public.est_equipe() then null else jsonb_build_object(
    'actifs', (select count(*) from public.candidats where statut <> 'archive'),
    'semaine', (select count(*) from public.candidats where cree_le > now() - interval '7 days'),
    'semaine_precedente', (select count(*) from public.candidats where cree_le between now() - interval '14 days' and now() - interval '7 days'),
    'postes_ouverts', (select count(*) from public.demandes where statut = 'ouverte'),
    'offres_publiques', (select count(*) from public.demandes where statut = 'ouverte' and publique),
    'candidatures_7j', (select count(*) from public.demande_candidats where origine = 'candidature' and ajoute_le > now() - interval '7 days'),
    'demandes_entreprises', (select count(*) from public.demandes_entreprises where statut = 'nouvelle'),
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
