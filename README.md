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

1. Héberger `dist/` sur un hébergeur statique (Cloudflare Pages, Netlify ou GitHub Pages).
2. Synchro : créer un projet Supabase (région Europe), exécuter le script affiché dans Réglages › Sécurité, puis saisir l'adresse et la clé publique du projet dans l'app.
