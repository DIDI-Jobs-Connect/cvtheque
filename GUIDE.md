# CVthèque : mise en service

La CVthèque a deux pages :

- **`index.html`** : le formulaire public où les candidats déposent leur CV (le lien à partager) ;
- **`espace.html`** : l'espace privé de l'équipe (fiches, recherche, notes, demandes des recruteurs).

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
| Espace équipe (privé) | `https://didi-jobs-connect.github.io/cvtheque/espace.html` |

Le mot après `?source=` apparaît dans chaque fiche (« Provenance ») : vous savez d'où vient chaque CV.

---

## Au quotidien

- **Trouver des profils** : tapez des mots dans la recherche (« comptable Cotonou », « Sage »,
  « anglais »). Les accents sont facultatifs. Combinez avec les filtres de gauche.
- **Une recruteuse vous demande des profils** : **Demandes** → **Nouvelle demande** →
  **Trouver des profils** → ouvrez une fiche → **Proposer pour cette demande**. Ensuite,
  **Copier le message pour la recruteuse** prépare un message avec la liste et un lien vers chaque
  CV (valable 7 jours), à coller dans WhatsApp ou un email.
- **Une personne redépose son CV** (même téléphone ou même email) : sa fiche est mise à jour,
  l'ancien CV reste dans l'historique.
- **CV reçu sur WhatsApp** : **Ajouter une fiche**, puis joignez le fichier.
- **Exporter (Excel)** télécharge les fiches affichées (avec les filtres en cours).
- **Suppression** : si une personne demande le retrait de ses données, ouvrez sa fiche →
  **Supprimer définitivement** (la fiche et ses CV sont effacés).

## Limites de l'offre gratuite Supabase

- 1 Go de fichiers, soit environ 3 000 à 5 000 CV, et 500 Mo de base de données (des dizaines de
  milliers de fiches). Au-delà, l'offre Pro coûte 25 $ par mois.
- Un projet gratuit **sans aucune activité pendant 7 jours** est mis en pause. Il suffit de le
  relancer depuis supabase.com (aucune donnée n'est perdue). En pratique, les dépôts et vos
  connexions régulières le maintiennent actif.
