# CVthèque : mise en service

La CVthèque a deux pages :

- **`index.html`** : le formulaire public où les candidats déposent leur CV (le lien à partager) ;
- **`espace.html`** : l'espace privé de l'équipe, un vrai CRM de recruteur : tableau de bord et relances,
  pipeline par poste (Kanban), entreprises clientes et matching automatique des profils.

Le site est hébergé gratuitement sur **GitHub Pages**. Les CV et les fiches sont stockés dans
**Supabase** (base de données et fichiers privés), car GitHub Pages ne sait pas garder des données
privées.

Règle d'or : ne collez jamais dans une conversation le mot de passe de la base, ni la clé
`service_role` / `secret` de Supabase.

---

## 1. Créer le projet Supabase (5 minutes)

1. Allez sur **supabase.com** → **Start your project** → connectez-vous avec GitHub.
2. **New project** :
   - Name : `cvtheque` ;
   - Database Password : cliquez sur **Generate a password** et gardez-le pour vous ;
   - Region : **Europe (Paris)** ou **Europe (Frankfurt)**, les plus proches du Bénin ;
   - offre **Free**.
3. Attendez environ 2 minutes que le projet soit prêt.

## 2. Créer la base de données

1. Menu de gauche → **SQL Editor** → **New query**.
2. Copiez tout le contenu du fichier **`supabase/schema.sql`**, collez-le, cliquez sur **Run**.
3. Le message « Success. No rows returned » confirme que tout est en place (tables, sécurité,
   dossier privé des CV).

### 2 bis. Ajouter le module CRM

Toujours dans **SQL Editor** → **New query** : copiez tout le contenu de **`supabase/crm.sql`**, collez,
**Run**. Il ajoute les entreprises, les contacts, les relances, le pipeline par étapes et le tableau de
bord. Vous pouvez le relancer sans risque : il ne supprime aucune donnée.

### 2 ter. Ajouter les offres, l'espace entreprises et le lien recruteur

Même chose avec **`supabase/offres.sql`** (après `crm.sql`) : **New query**, coller, **Run**.

## 3. Créer votre compte d'accès

1. Menu de gauche → **Authentication** → **Sign In / Providers** : désactivez
   **Allow new users to sign up** (personne ne peut créer de compte tout seul).
2. **Authentication** → **Users** → **Add user** → **Create new user** : votre email, un mot de passe
   fort, cochez **Auto Confirm User**.
3. Retournez dans **SQL Editor** → **New query**, collez cette ligne en mettant votre email, puis **Run** :

   ```sql
   insert into public.equipe (user_id, email)
   select id, email from auth.users where email = 'votre@email.com';
   ```

Pour donner accès à la recruteuse plus tard, refaites les étapes 2 et 3 avec son email.

## 4. Relier le site à Supabase

Menu de gauche → **Project Settings** → **API Keys** (ou **API**) :

- **Project URL** (du type `https://abcdefgh.supabase.co`) ;
- la clé **anon** ou **publishable** (elle commence par `eyJ…` ou `sb_publishable_…`).

Ces deux valeurs sont faites pour être publiques : vous pouvez me les envoyer, ou les coller
vous-même dans `assets/config.js` (`supabaseUrl` et `supabaseCle`). N'envoyez **jamais** la clé
`service_role` ou `secret`.

Dans le même fichier, vous pouvez aussi renseigner le lien de votre chaîne WhatsApp
(`chaineWhatsapp`). Il sera proposé aux candidats après leur dépôt.

## 5. Mettre en ligne sur GitHub Pages

Dans le dépôt GitHub de la CVthèque : **Settings** → **Pages** → **Source : Deploy from a branch** →
branche **main**, dossier **/ (root)** → **Save**. Après 1 à 2 minutes, l'adresse s'affiche, du type
`https://didi-jobs-connect.github.io/cvtheque/`.

## 6. Les liens à utiliser

| Pour | Lien |
| --- | --- |
| Formulaire de dépôt (à partager) | `https://didi-jobs-connect.github.io/cvtheque/` |
| Même formulaire, depuis votre chaîne WhatsApp | `https://didi-jobs-connect.github.io/cvtheque/?source=chaine` |
| Même formulaire, pour les personnes que vous accompagnez | `https://didi-jobs-connect.github.io/cvtheque/?source=accompagnement` |
| Page des offres (à partager) | `https://didi-jobs-connect.github.io/cvtheque/offres.html` |
| Page entreprises « Vous recrutez ? » | `https://didi-jobs-connect.github.io/cvtheque/recruter.html` |
| Espace équipe (privé) | `https://didi-jobs-connect.github.io/cvtheque/espace.html` |

Le mot après `?source=` apparaît dans chaque fiche (« Provenance ») : vous savez d'où vient chaque CV.

---

## Au quotidien

- **Trouver des profils** : tapez des mots dans la recherche (« comptable Cotonou », « Sage »,
  « anglais »). Les accents sont facultatifs. Combinez avec les filtres de gauche.
- **Tableau de bord** : vos chiffres, les relances du jour et en retard (cochez quand c'est fait), le
  pipeline des postes ouverts et la provenance des CV.
- **Une entreprise vous confie un recrutement** : **Entreprises** → **Nouvelle entreprise** (et ses
  contacts), puis **Nouveau poste**. Notez chaque échange dans le **Journal** (appel, WhatsApp, rencontre…).
- **Trouver les candidats** : sur le poste, **Profils compatibles** classe la CVthèque sur 100 (domaine,
  intitulé, ville, expérience, contrat, disponibilité) → **Ajouter**. Ou **Chercher dans la CVthèque**
  pour filtrer vous-même.
- **Suivre le process** : glissez les cartes d'une colonne à l'autre (Sourcé → Contacté → Présenté au
  client → Entretien → Offre → Placé), ou changez l'étape dans la liste sur téléphone. Le statut de la
  fiche suit automatiquement.
- **Envoyer la shortlist** : **Message pour le client** copie la liste des candidats présentés avec un
  lien vers chaque CV (valable 7 jours), à coller dans WhatsApp ou un email.
- **Une offre vous est transmise** (WhatsApp, email…) : **Postes** → **Coller une offre reçue**. L'outil
  remplit le poste (intitulé, domaine, ville, contrat, expérience, salaire, date limite), le publie sur la
  page des offres et ajoute aussitôt les profils compatibles (score de 60 ou plus) de la CVthèque.
  Les candidats qui postulent en ligne arrivent dans la colonne « Sourcé » avec l'étiquette
  « A postulé en ligne ». « Partager sur WhatsApp » prépare l'annonce avec le lien pour postuler.
- **Une entreprise remplit la page « Vous recrutez ? »** : sa demande apparaît dans **Entreprises** →
  **Demandes reçues** (pastille orange sur l'onglet et alerte au tableau de bord). **Créer le poste**
  crée l'entreprise, son contact et le poste pré-rempli. Les tarifs affichés se modifient dans
  `assets/config.js` (rubrique `formules`).
- **Transmettre les profils à un recruteur** : sur le poste, **Lien recruteur** → **Créer le lien privé**
  puis **Envoyer sur WhatsApp**. Le recruteur voit les candidats passés à « Présenté au client » (et
  au-delà), ouvre leur CV (liens valables 30 jours) et répond « Je veux le/la rencontrer », « En
  réserve » ou « Pas retenu ». Son avis s'affiche sur la carte ; s'il veut rencontrer quelqu'un, une
  relance est créée pour vous. Il ne voit ni téléphone ni email. **Couper le lien** le désactive.
- **Ne rien oublier** : bouton **Relance** sur une fiche, un poste ou une entreprise (« rappeler jeudi »).
- **Une personne redépose son CV** (même téléphone ou même email) : sa fiche est mise à jour,
  l'ancien CV reste dans l'historique.
- **CV reçu sur WhatsApp** : **Ajouter une fiche**, puis joignez le fichier.
- **Exporter (Excel)** télécharge les fiches affichées (avec les filtres en cours).
- **Suppression** : si une personne demande le retrait de ses données, ouvrez sa fiche →
  **Supprimer définitivement** (la fiche et ses CV sont effacés).

## Transférer les candidats du site principal

Les candidats inscrits sur le site DIDI Jobs Connect qui ont coché « figurer dans la CVthèque »
peuvent être copiés ici, avec leur CV. Les autres ne sont pas transférés (pas d'accord).

1. Dépôt GitHub de la CVthèque → **Settings** → **Secrets and variables** → **Actions** →
   **New repository secret**, deux fois :
   - `SITE_DATABASE_URL` : l'adresse de la base du site (Netlify → projet → **Database** →
     connection string, elle commence par `postgresql://`) ;
   - `SUPABASE_SERVICE_ROLE_KEY` : Supabase → **Project Settings** → **API Keys** → clé
     **secret** (ou `service_role`).
2. Onglet **Actions** → « Transférer les candidats du site vers la CVthèque » → **Run workflow**
   avec « oui » (simulation) : le résultat donne les chiffres, sans rien écrire.
3. Relancez avec « non » pour transférer. Relançable sans risque : pas de doublon.
4. Ensuite, supprimez les deux secrets (Settings → Secrets) par prudence.

## Limites de l'offre gratuite Supabase

- 1 Go de fichiers, soit environ 3 000 à 5 000 CV, et 500 Mo de base de données (des dizaines de
  milliers de fiches). Au-delà, l'offre Pro coûte 25 $ par mois.
- Un projet gratuit **sans aucune activité pendant 7 jours** est mis en pause. Il suffit de le
  relancer depuis supabase.com (aucune donnée n'est perdue). En pratique, les dépôts et vos
  connexions régulières le maintiennent actif.
