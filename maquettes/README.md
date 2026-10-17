# Faillite ! : maquettes (référence pour le développement)

Maquettes produites avec Claude Design le 17/10/2026. Chaque fichier `.dc.html` est un écran : HTML + styles inline, lisible directement comme référence de mise en page. Le bloc `<script type="text/x-dc">` en bas de certains fichiers contient la logique d'interaction de la maquette (sélection, vote), pas du code de production.

Lien de la maquette en ligne : https://claude.ai/artifact/UiaRxDrVcAJRMxQV9UD1yY

## Écrans

| Fichier | Écran | Taille |
|---|---|---|
| `Main.dc.html` | Hôte · tour en cours, carte à choix unique (jauge en alerte) | 1920×1080 |
| `Hote-Curseur.dc.html` | Hôte · tour en cours, carte curseur (retraites 62–66) | 1920×1080 |
| `Hote-Resultat.dc.html` | Hôte · résultat du vote | 1920×1080 |
| `Hote-Accueil.dc.html` | Hôte · accueil (QR, code de salle, participants, 30/20 tours) | 1920×1080 |
| `Hote-Fin.dc.html` | Hôte · fin de partie (jauges vs « sans intervention ») | 1920×1080 |
| `Mobile-Rejoindre.dc.html` | Téléphone · saisie du pseudo | 390×844 |
| `Mobile-Vote.dc.html` | Téléphone · vote choix unique (interactif) | 390×844 |
| `Mobile-Enregistre.dc.html` | Téléphone · vote enregistré | 390×844 |
| `Mobile-Curseur.dc.html` | Téléphone · vote curseur (interactif) | 390×844 |
| `Mobile-Resultat.dc.html` | Téléphone · résultat | 390×844 |
| `Composants.dc.html` | Palette, typos, icônes des jauges, composants | 1920×1500 |

`canvas.json` : disposition des écrans sur le canevas (non nécessaire au développement).

## Style

- Fond `#15131C`, surfaces `#221F2B` / `#2C2838`, traits `#3A3547`, texte `#F6F1E7`, texte secondaire `#D9D2E3` / `#B4ADBF`.
- Couleur d'action unique : moutarde `#FFD23F` (année, minuteur, votes, boutons).
- Impacts : ▼▼ `#FF4D5E` · ▼ `#FF9A3C` · – `#8C8698` · ▲ `#A6E36B` · ▲▲ `#2ED47A` (texte foncé `#15131C` sur la pastille, toujours flèche + couleur).
- Typos (Google Fonts) : Bricolage Grotesque 700–800 (titres, année, chiffres), DM Sans 400–700 (texte).
- Icônes des jauges : SVG inline au trait 2 px (voir `Composants.dc.html`).

## Règles d'affichage retenues

- Les impacts sont des pastilles (bulles) ; seules les jauges touchées sont affichées sur une option.
- La durée de l'effet n'est pas une bulle : texte « EFFET SUR 1 AN » / « EFFET SUR PLUSIEURS ANNÉES » sous le titre de l'option.
- Jauge en alerte (< 35) : cadre rouge, légère pulsation, mention de l'événement à venir. Repère vertical du seuil sur chaque barre.
- Pendant le vote, le grand écran montre le nombre de votants, jamais la répartition.
- Les chiffres et textes de cartes dans les maquettes sont des exemples fictifs.
