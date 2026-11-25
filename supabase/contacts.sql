-- Coordonnées des candidats pour les recruteurs, APRÈS votre accord.
-- À exécuter une fois dans Supabase → SQL Editor → New query → Run (après recruteurs.sql).
--
-- Le recruteur voit le téléphone et l'email d'un candidat uniquement :
--   • quand vous lui avez accordé le CV (onglet « CV accordés ») ;
--   • ou quand vous l'avez présenté sur l'un de SES postes (étape Présenté, Entretien, Offre ou Placé).
-- Le catalogue anonyme et les liens privés par offre ne montrent toujours aucune coordonnée.
-- Pour retirer l'accès : refusez la demande de CV ou ramenez le candidat à une étape antérieure.

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
