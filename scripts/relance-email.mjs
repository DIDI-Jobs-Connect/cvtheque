// Relance par email des candidats de la CVthèque qui n'ont pas encore de CV.
// Chaque personne ne reçoit l'email qu'une fois (une note « Relance CV envoyée par email » est
// ajoutée à sa fiche). Le journal n'affiche que des chiffres.
//
// Secrets : SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, EMAIL_FROM (ex. « DIDI Jobs Connect <contact@domaine.com> »)
// Options : ESSAI = "oui" (compter sans envoyer), MAXIMUM = nombre d'emails par lancement (offre gratuite Resend : 100 / jour)
import { createClient } from "@supabase/supabase-js";
import { appendFileSync } from "node:fs";

const nettoyer = (v) => (v || "").trim().replace(/^["']|["']$/g, "").trim();
const SUPABASE_URL = nettoyer(process.env.SUPABASE_URL);
const CLE = nettoyer(process.env.SUPABASE_SERVICE_ROLE_KEY);
const RESEND = nettoyer(process.env.RESEND_API_KEY);
const FROM = nettoyer(process.env.EMAIL_FROM);
const ESSAI = (process.env.ESSAI || "oui").toLowerCase() !== "non";
const MAXIMUM = Math.max(1, Math.min(500, Number(process.env.MAXIMUM) || 90));
const LIEN = "https://didi-jobs-connect.github.io/cvtheque/?source=relance-email";
const MARQUE = "Relance CV envoyée par email";
const erreur = (m) => console.error(process.env.GITHUB_ACTIONS ? `::error::${m}` : m);

for (const [k, v] of Object.entries({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: CLE, ...(ESSAI ? {} : { RESEND_API_KEY: RESEND, EMAIL_FROM: FROM }) })) {
  if (!v) { erreur(`Secret manquant : ${k}`); process.exit(1); }
}
const sb = createClient(SUPABASE_URL, CLE, { auth: { persistSession: false } });
const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// Candidats sans CV, avec un email, pas archivés.
const cibles = [];
for (let debut = 0; ; debut += 1000) {
  const { data, error } = await sb.from("candidats").select("id, prenom, email, domaine").is("cv_chemin", null).neq("statut", "archive").not("email", "is", null).range(debut, debut + 999);
  if (error) { erreur(`Lecture impossible : ${error.message}`); process.exit(1); }
  cibles.push(...data);
  if (data.length < 1000) break;
}
const { data: deja, error: e2 } = await sb.from("notes").select("candidat_id").eq("texte", MARQUE);
if (e2) { erreur(`Lecture impossible : ${e2.message}`); process.exit(1); }
const dejaRelances = new Set(deja.map((n) => n.candidat_id));
const aRelancer = cibles.filter((c) => !dejaRelances.has(c.id) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email));
const lot = aRelancer.slice(0, MAXIMUM);

function email(c) {
  const prenom = (c.prenom || "").trim();
  const texte = `Bonjour ${prenom},

Vous êtes inscrit(e) sur DIDI Jobs Connect et votre profil est déjà dans notre CVthèque. Il manque une seule chose : votre CV.

Les entreprises nous confient leurs recrutements chaque semaine, et nous leur proposons en priorité les dossiers complets. Ajoutez votre CV en 3 minutes :
${LIEN}

Utilisez la même adresse email ou le même numéro que sur le site : votre fiche sera simplement complétée.

L'équipe DIDI Jobs Connect

Vous ne souhaitez plus figurer dans la CVthèque ? Répondez simplement « retrait » à cet email.`;
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.55;color:#0b1026;max-width:560px">
<p>Bonjour ${esc(prenom)},</p>
<p>Vous êtes inscrit(e) sur DIDI Jobs Connect et votre profil est déjà dans notre CVthèque. Il manque une seule chose : <b>votre CV</b>.</p>
<p>Les entreprises nous confient leurs recrutements chaque semaine, et nous leur proposons en priorité les dossiers complets.</p>
<p style="margin:24px 0"><a href="${LIEN}" style="background:#4263f0;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold">Ajouter mon CV (3 minutes)</a></p>
<p>Utilisez la même adresse email ou le même numéro que sur le site : votre fiche sera simplement complétée.</p>
<p>L'équipe DIDI Jobs Connect</p>
<p style="font-size:12px;color:#5a6280;margin-top:28px">Vous ne souhaitez plus figurer dans la CVthèque ? Répondez simplement « retrait » à cet email.</p></div>`;
  return { from: FROM, to: [c.email], subject: `${prenom ? prenom + ", il" : "Il"} manque votre CV pour vous proposer aux recruteurs`, text: texte, html };
}

let envoyes = 0, echecs = 0;
if (!ESSAI) {
  // Envoi par paquets de 50 (API « batch » de Resend), avec une pause entre les paquets.
  for (let i = 0; i < lot.length; i += 50) {
    const paquet = lot.slice(i, i + 50);
    const r = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" },
      body: JSON.stringify(paquet.map(email)),
    });
    if (!r.ok) {
      echecs += paquet.length;
      const corps = await r.text().catch(() => "");
      erreur(`Resend a refusé un paquet (${r.status}) : ${corps.slice(0, 200)}`);
      if (r.status === 401 || r.status === 403 || r.status === 422) break;
      continue;
    }
    envoyes += paquet.length;
    await sb.from("notes").insert(paquet.map((c) => ({ candidat_id: c.id, auteur: "Relance automatique", type: "email", texte: MARQUE })));
    await new Promise((ok) => setTimeout(ok, 1200));
  }
}

const resume = [
  `## ${ESSAI ? "Simulation de la relance (aucun email envoyé)" : "Relance par email terminée"}`,
  "",
  "| | Nombre |", "| --- | ---: |",
  `| Fiches sans CV avec un email | ${cibles.length} |`,
  `| Déjà relancées par email | ${cibles.length - aRelancer.length} |`,
  `| Restant à relancer | ${aRelancer.length} |`,
  `| ${ESSAI ? "Seraient envoyés lors de ce lancement" : "Emails envoyés"} (maximum ${MAXIMUM}) | **${ESSAI ? lot.length : envoyes}** |`,
  ...(ESSAI ? [] : [`| Échecs | ${echecs} |`]),
  "",
  aRelancer.length > lot.length ? `Il en restera ${aRelancer.length - lot.length} : relancez demain (limite de l'offre gratuite Resend : 100 emails par jour).` : "",
].join("\n");
console.log(resume);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, resume + "\n");
if (echecs) process.exitCode = 1;
