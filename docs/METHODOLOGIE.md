# Méthodologie — Lecture de plans de béton armé par agents IA de vision

Synthèse des recherches menées pour concevoir les prompts de l'agent
orchestrateur et des sous-agents de calque de Kastor. Les sources sont listées
en fin de document.

## 1. Conventions graphiques des plans de coffrage et de fondations français

**Principe général du plan de coffrage** : c'est une vue de dessus du niveau,
obtenue par coupe horizontale conventionnelle passant au-dessus des ouvertures —
on représente le plancher « brut » avant coulage, vu de dessus (certains bureaux
d'études dessinent le plancher haut vu « en plafond » depuis le niveau
inférieur : les deux conventions coexistent, la mention « PLANCHER HAUT … » dans
le cartouche lève l'ambiguïté). Toutes les cotes sont des cotes **brutes** (sans
enduits ni finitions). Références normatives : NF P 02-001 / NF E 04-520
(traits), NF P 06-001, NF EN ISO 9431 (cartouche), DTU 20.1 (maçonnerie
chaînée), DTU 21, Eurocode 2.

**Conventions de traits (transverses à tous les éléments)** :

- **Trait continu fort/renforcé** : contours des éléments COUPÉS par le plan de
  coupe (murs, voiles, poteaux) et arêtes vues principales.
- **Trait continu moyen/fin** : parties vues mais non coupées (bord de dalle,
  semelle vue de dessus).
- **Trait interrompu (tirets)** : éléments CACHÉS — situés sous le plan de coupe
  ou au-dessus : poutres sous dalle, semelles sous dallage, longrines enterrées,
  retombées, ouvertures dans les murs coupés, décrochements de sous-face.
- **Trait mixte fin (axe)** : axes des files de poteaux, axes de
  poutres/nervures, axes de symétrie.
- **Poché noir ou gris / hachures** : sections coupées ; le béton armé est
  souvent poché (grisé/noirci), la maçonnerie hachurée en oblique. Attention :
  selon les BE, les poteaux peuvent être pochés noirs, grisés, hachurés ou
  simplement en trait fort — lire la légende d'abord.

**Éléments et reconnaissance visuelle** :

- **Semelles filantes (SF, SF1, SF2…)** : sur le plan de fondations, elles
  apparaissent comme un **double trait parallèle** (souvent interrompu ou fin
  car élément enterré/caché sous le mur) qui longe et déborde symétriquement de
  part et d'autre des murs porteurs : trois à quatre lignes parallèles au total
  (bords de semelle + faces du mur). Repérées SF + numéro, cotées en largeur x
  hauteur (ex. SF 50x25). *Piège* : confondre le débord de semelle avec une
  double cloison ou une isolation ; la semelle suit TOUS les murs porteurs, y
  compris les refends intérieurs — ne pas quantifier seulement le périmètre.
- **Semelles isolées (SI, S, M pour massif)** : **rectangles ou carrés centrés
  sous les poteaux**, en trait fin ou interrompu, avec le poteau (petit
  rectangle poché) au centre et souvent les deux axes en trait mixte croisés au
  centre. Repérage SI1/S1/M1 + dimensions (ex. 100x100x30). *Piège* : plusieurs
  semelles identiques repérées par le même numéro ; le comptage doit se faire
  sur le plan, pas sur la nomenclature.
- **Longrines (LG, L)** : poutres enterrées reliant semelles isolées/têtes de
  pieux ; en plan, **deux traits parallèles rapprochés (souvent interrompus car
  sous dallage)** entre deux massifs. Repérage LG1 (ex. LG 20x50). *Piège* :
  les distinguer des semelles filantes (la longrine relie des points d'appui
  ponctuels, la SF suit un mur) et des réseaux/canalisations en pointillés.
- **Bêches** : nervures d'ancrage périphériques sous dallage (épaississement de
  rive) ; représentées par un double trait le long de la rive du dallage,
  souvent avec un détail en coupe. *Piège* : facilement confondues avec la SF
  de rive.
- **Chaînages horizontaux (CH, CHV, CHR = chaînage rampant/renforcé)** : sur
  les plans de plancher/arase, ils courent **en tête de tous les murs
  porteurs** ; représentés soit par un trait d'axe le long du mur, soit repérés
  par étiquette « CH 3HA8 » avec flèche. Les **jonctions de chaînage**
  (équerres, U de liaison en angle et en Té) sont parfois symbolisées aux
  angles. *Piège* : le CH est rarement dessiné explicitement — il est implicite
  sur tout mur porteur périphérique et de refend ; le quantifier au linéaire de
  murs porteurs du niveau, plus les équerres aux angles/jonctions.
- **Raidisseurs verticaux / chaînages verticaux (R, RV, CV)** et leurs
  **attentes (ATT, ATTR, AC, ATTCV)** : petits **carrés (≈15x15 ou 20x20)
  insérés dans l'épaisseur des murs**, souvent pochés ou marqués d'une
  croix/point, aux **angles saillants et rentrants, aux jonctions de murs et de
  part et d'autre des grandes ouvertures** (DTU 20.1 : espacement max ~4-5 m).
  Sur le plan de fondations, le symbole (point noir, croix ou petit carré avec
  repère « ATT » ou « AR ») marque les **attentes** en U ou en équerre scellées
  dans la semelle. **Attentes de poteaux (ATTP, AP)** : mêmes symboles au droit
  des futurs poteaux BA. *Pièges* : symboles minuscules à l'échelle du plan
  (invisibles sans zoom) ; distinguer attente de raidisseur (dans un mur
  maçonné) et attente de poteau BA (élément porteur isolé).
- **Poteaux (P1, P2…)** : petits **rectangles/carrés/cercles pochés noirs,
  grisés ou hachurés** (élément coupé), avec repère P + numéro et section
  (ex. P1 20x20). *Pièges* : un poteau noyé dans un mur ne se voit que par un
  léger épaississement ou changement de poché ; un poteau circulaire peut être
  confondu avec un regard/symbole de niveau.
- **Linteaux (LT, L)** : au-dessus des ouvertures ; en vue de dessus,
  l'ouverture est en **trait interrompu** dans le mur coupé, le linteau est
  repéré LT + numéro avec flèche, ou implicite (à quantifier au droit de chaque
  ouverture). *Piège* : les linteaux apparaissent sur le plan du niveau où sont
  les baies, pas sur le plan de fondations.
- **Poutres (Pou, N pour nervure)** : deux traits parallèles — **continus forts
  si la poutre est vue** (saillante), **interrompus si en retombée sous la
  dalle** (cachée) ; l'axe en trait mixte est fréquent. Repérage : numéro +
  section « largeur x hauteur » (ex. 1(20x50)). Poutrelles de plancher
  hourdis : simples traits d'axe parallèles régulièrement espacés avec un sens
  de portée fléché. *Piège* : le sens de portée du plancher (flèche double)
  n'est pas une cote ; ne pas compter les poutrelles préfabriquées comme des
  poutres BA coulées en place.
- **Dalles/planchers** : épaisseur donnée par symbole cerclé (ex. « DP20 » =
  dalle pleine 20 cm ; « 16+4 » = hourdis 16 + table 4 cm). **Trémies /
  réservations** : rectangles barrés d'une ou deux diagonales en trait fin.
- **Nomenclatures/légendes** : tableaux en marge (liste des semelles, poteaux,
  aciers) et légende des symboles — toujours à lire en premier ; les
  conventions varient d'un BE à l'autre.

## 2. Cartouche, échelles et calibration des distances

- **Cartouche** (en bas à droite, NF EN ISO 9431) : désignation du plan,
  projet, BE, **échelle** (1/50 le plus courant en coffrage ; 1/100 pour
  l'ensemble), **indice de révision** (A, B, C… — toujours vérifier qu'on lit
  le dernier indice), date, numéro de plan, niveau concerné.
- **Lignes de cote** : cotations en cm ou m (usage BTP : cm pour les sections
  « 20x50 », m pour les grandes dimensions « 12.45 » ; parfois mm — déduire
  l'unité de l'ordre de grandeur). Organisation en lignes hiérarchisées à
  l'extérieur du plan : cotes de détail, cotes d'axes, décrochements, **cote
  totale d'ensemble**.
- **Calibration pour l'IA** : ne JAMAIS mesurer via l'échelle nominale seule
  (les PDF/scans sont redimensionnés). Méthode robuste : repérer une **cote
  totale écrite** et la distance en pixels correspondante → facteur
  pixels/mètre ; vérifier avec une deuxième cote perpendiculaire. La somme des
  cotes partielles doit égaler la cote totale — utiliser cette redondance comme
  autotest.

## 3. Types de plans d'un dossier béton armé et ce qu'on y quantifie

- **Plan de fondations** : semelles filantes, semelles isolées, longrines,
  bêches, attentes de raidisseurs/poteaux.
- **Plancher haut du vide sanitaire** : chaînages, jonctions, raidisseurs et
  attentes, poteaux, linteaux, longrines, bêches, poutres.
- **Plancher haut du RDC** : chaînages, jonctions, raidisseurs, attentes,
  poteaux, linteaux, bêches, poutres, relevées.
- **Plancher haut d'étage** : chaînages (dont rampants CHR), jonctions,
  raidisseurs, poteaux, linteaux, poutres.
- Chaque plan quantifie les éléments **du niveau qu'il coiffe** : un raidisseur
  de l'étage a son attente sur le plancher inférieur — croiser deux niveaux
  successifs pour la continuité des attentes.

## 4. Bonnes pratiques d'extraction par LLM de vision

- **Lire d'abord cartouche + légende + nomenclatures**, puis classifier.
- **Tuiles + zoom hiérarchique** : rendre les PDF à 200-300 DPI minimum ; les
  détails de quelques pixels sont perdus par les encodeurs vision. Le découpage
  en tuiles avec chevauchement de 10-20 % évite de couper repères et cotes.
- **Coordonnées normalisées** (0-1000) et **sortie JSON structurée**
  systématiques.
- **Séparer les tâches** : une passe par type d'élément (l'approche
  sous-agents de Kastor) donne de meilleurs résultats qu'une question globale.
  Compter en énumérant (liste avec positions), jamais en demandant un nombre
  sec.
- **Erreurs fréquentes** (benchmarks sur dessins techniques : les meilleurs
  modèles plafonnent vers 77-80 % d'exactitude) : hallucination de cotes,
  fusion de mesures identiques répétées, cote assignée au mauvais élément,
  omission de sections entières du plan, confusion vus/cachés, confusion
  d'unités cm/m, texte pivoté mal lu.
- **Vérifications croisées** : somme des cotes partielles = cote totale ;
  distance mesurée ≈ cote écrite (en cas d'écart, faire confiance à la cote
  écrite) ; cohérence plan/nomenclature ; cohérence inter-niveaux ; signaler
  les zones illisibles plutôt que deviner. D'où le principe Kastor :
  **l'IA propose, l'humain valide** dans l'éditeur de calques.

## 5. Modèles multimodaux sur OpenRouter (état août 2026)

- **anthropic/claude-opus-5**, **anthropic/claude-sonnet-5** — très bons en
  raisonnement structuré sur documents.
- **google/gemini-2.5-pro** (défaut de Kastor) et la famille Gemini Flash
  récente — historiquement les plus précis des benchmarks sur dessins
  d'ingénierie (~80 %), entrée native PDF/image.
- **openai/gpt-5.6-sol** / **openai/gpt-5.6-luna**.
- **qwen/qwen3-vl-235b-a22b-instruct**, **qwen/qwen3-vl-32b-instruct** — OCR
  documentaire économique.
- Recommandation : modèle frontier pour l'analyse ; le modèle est configurable
  dans Kastor (variable `OPENROUTER_MODEL` et réglage dans l'interface).

## Sources

- https://fr.wikipedia.org/wiki/Plan_de_coffrage
- https://www.4geniecivil.com/2025/02/comment-dessiner-et-lire-un-plan-de.html
- https://cours-genie-civil.com/comment-dessiner-plan-de-fondation-guide-complet/
- https://cours-genie-civil.com/comment-lire-un-plan-de-coffrage-guide-complet-pour-les-professionnels-du-btp/
- https://www.abc-maconnerie.com/lecture-plan/ferraillage/fondation.html
- https://www.abc-maconnerie.com/lecture-plan/execution/poteaux-poutres.html
- http://bgrec.free.fr/Mooc/Cours/CM3%20-%20CONS2%20-%20Cours.pdf
- https://www.biblioconstruction.com/2024/04/les-plans-de-coffrage.html
- https://structalis.fr/services/beton-arme/plan-coffrage
- https://www.geniecivilstore.com/2017/12/le-plan-de-coffrage.html
- https://www.domindo.fr/chainage-vertical-horizontal
- https://www.monequerre.fr/poteaux-raidisseurs-en-maconnerie-definition/
- https://www.techniques-ingenieur.fr/base-documentaire/construction-et-travaux-publics-th3/techniques-du-batiment-construire-en-beton-arme-43805210/les-fondations-par-semelles-filantes-tba1262/
- https://www.groupemaison.com/decryptage-questce-que-le-cartouche-dun-plan-et-comment-linterpreter-correctement/
- https://blog.hamil.fr/2017/11/21/normes-de-dessin-darchitecture-1ere-partie/
- https://www.llamaindex.ai/insights/best-ai-for-engineering-drawings
- https://www.businesswaretech.com/blog/benchmark-testing-ai-models-on-engineering-drawings
- https://www.coforge.com/what-we-know/blog/the-promise-and-pitfalls-implementing-llms-for-engineering-diagram-dimension-extraction
- https://arxiv.org/pdf/2411.03707
- https://openrouter.ai/collections/vision-models
