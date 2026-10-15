# Mon budget

App personnelle de suivi de budget (mobile + ordinateur), chiffrée de bout en bout.

## Développement

```sh
npm install
npm run dev        # serveur local
npx vitest run     # tests des calculs, de l'import et du chiffrement
npm run build      # version installable (PWA) dans dist/
npx vite build --mode artifact --outDir dist-artifact   # version d'essai publiée sur claude.ai
```

## Organisation

- `src/crypto/vault.ts` : chiffrement (AES-GCM 256, clé emballée par la phrase secrète via PBKDF2 600 000 itérations, et par la clé de secours).
- `src/domain/` : modèle de données et calculs purs (périodes de paie, budget, cagnottes, règles, prévisions, analyse).
- `src/import/` : lecture des relevés Boursobank, SG, Revolut (CSV) et OFX, doublons, virements internes.
- `src/sync/remote.ts` : synchro du coffre chiffré via Supabase (le serveur ne reçoit que des données chiffrées).
- `src/screens/` : écrans.

## Mise en ligne

L'app est publiée sur https://nimo-project.github.io/mon-budget/ à chaque envoi sur `main`
(`.github/workflows/deploy.yml`, GitHub Pages en source « GitHub Actions »).

Synchro : le projet Supabase (région Europe) est intégré via `.env` (adresse et clé publique, sans secret).
Le script de création de la table est dans `src/sync/remote.ts` (`SETUP_SQL`). Dans Supabase,
Authentication › URL Configuration › Site URL doit pointer vers l'adresse de l'app.
