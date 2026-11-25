-- Deux types de comptes dans l'espace pro :
--   • « entreprise » : une entreprise qui recrute pour elle-même ;
--   • « cabinet »    : un cabinet ou un recruteur partenaire.
-- À exécuter une fois dans Supabase → SQL Editor → New query → Run (après recruteurs.sql).
-- Les comptes déjà créés sont classés « cabinet » ; vous pouvez changer le type depuis l'espace équipe.

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
