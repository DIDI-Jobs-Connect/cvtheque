-- Appels de présélection : la grille de notation de chaque candidat, poste par poste.
-- À exécuter une fois dans Supabase → SQL Editor → New query → Run (après contacts.sql).
--
-- Chaque appel est enregistré sur la ligne candidat × poste (demande_candidats.appel) :
-- critères bloquants, notes sur 5, total sur 30, note interne et commentaire pour le client.
-- Le client (lien privé ou espace pro) voit UNIQUEMENT le total et le commentaire pour le client,
-- jamais la note interne ni le détail des critères.

alter table public.demande_candidats add column if not exists appel jsonb;

-- Résumé visible par le client.
create or replace function public.evaluation_client(a jsonb) returns jsonb
language sql immutable set search_path = '' as
$$
  select case when a is null or a ->> 'total' is null then null
    else jsonb_build_object('total', (a ->> 'total')::int, 'commentaire', nullif(a ->> 'commentaire_client', ''), 'le', a ->> 'le') end
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
          'etape', dc.etape, 'avis', dc.avis_recruteur, 'commentaire', dc.avis_commentaire,
          'evaluation', public.evaluation_client(dc.appel)) order by dc.modifie_le desc)
        from public.demande_candidats dc join public.candidats c on c.id = dc.candidat_id
        where dc.demande_id = d.id and dc.etape in ('presente', 'entretien', 'offre', 'place')), '[]')
    ) order by d.statut, d.cree_le desc)
    from public.demandes d where d.recruteur_id = auth.uid()), '[]');
end;
$$;

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
        'etape', dc.etape, 'cv', dc.cv_partage, 'avis', dc.avis_recruteur, 'commentaire', dc.avis_commentaire,
        'evaluation', public.evaluation_client(dc.appel)
      ) order by dc.modifie_le desc)
      from public.demande_candidats dc join public.candidats c on c.id = dc.candidat_id
      where dc.demande_id = d.id and dc.etape in ('presente', 'entretien', 'offre', 'place')
    ), '[]')
  ) end
  from (select * from public.demandes where jeton_recruteur = j) d
  right join (select 1) x on true
$$;

revoke all on function public.evaluation_client(jsonb) from public;
revoke all on function public.mes_postes_recruteur() from public;
revoke all on function public.profils_recruteur(uuid) from public;
grant execute on function public.mes_postes_recruteur() to authenticated;
grant execute on function public.profils_recruteur(uuid) to anon, authenticated;
