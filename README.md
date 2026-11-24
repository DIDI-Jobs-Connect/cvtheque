# CVthèque

CVthèque et CRM de recrutement : un formulaire public où les candidats déposent leur CV
(`index.html`) et un espace privé pour l'équipe (`espace.html`) : tableau de bord et relances,
pipeline Kanban par poste, entreprises clientes et contacts, journal des échanges, matching
automatique des profils, recherche et filtres.

- Site statique (HTML, CSS, JavaScript sans compilation), hébergé sur GitHub Pages.
- Données et fichiers dans Supabase : base PostgreSQL avec règles d'accès (RLS) et dossier de
  fichiers privé. Le public peut seulement déposer ; tout le reste est réservé aux comptes de la
  table `equipe`.
- Mise en service pas à pas : [GUIDE.md](GUIDE.md). Base de données : [supabase/schema.sql](supabase/schema.sql)
  puis [supabase/crm.sql](supabase/crm.sql).
