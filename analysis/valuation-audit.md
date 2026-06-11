# Audit — valuation des positions & du portefeuille

Date: 2026-06-11. Périmètre: buy/sell, calcul de position, gestion du cash,
long/short, alignement valuation portefeuille ↔ positions+cash, idempotence,
effets de bord. Source de vérité = backend (cf. `backend-owns-semantic-contract`).

## Verdict global

La logique est **correcte, au niveau domaine, non hardcodée, et bien testée**.
Buy/sell, contrôle des fonds, agrégation multi-trades, moyenne pondérée
long/short, et valuation du portefeuille sont justes. Couverture de tests réelle
et sérieuse (transitions long↔short, round-trip cash-neutre property-based,
marge, concurrence par row-lock).

Aucun bug bloquant de correction du ledger. Les findings ci-dessous sont surtout
des **risques de robustesse / cohérence** que tu as explicitement demandé de
durcir (idempotence, alignement total).

---

## Points solides confirmés (à ne pas toucher)

- **Autorité de prix serveur.** `place_trade` exécute au dernier tick serveur
  (`SqlAlchemyLatestPriceProvider`), le prix client est *advisory* et jamais
  utilisé → impossible d'acheter bas / vendre haut depuis le front.
- **Atomicité & concurrence.** `get_by_user_id_for_update` (FOR UPDATE) + un
  seul `session.commit()` dans le routeur → read-modify-write cash/holdings
  sérialisé, pas de lost-update. Test d'intégration de concurrence présent.
- **Contrôle des fonds.** BUY rejeté si `cash < total` (`execute_trade`), doublé
  d'un contrôle de marge (`evaluate_margin`) en amont. Position entièrement
  fermée → holding supprimé (epsilon 1e-6, pas de position fantôme).
- **Long/short.** `_compute_new_avg` gère ouverture/extension, réduction (avg
  inchangé, P&L réalisé implicite dans le cash), et croisement de zéro (reset au
  prix de fill). Couvert par 8 tests dédiés + property tests.
- **Marge.** Le désengagement est toujours autorisé (`ceiling = max(limit,
  gross_before)`), exposition brute longs+shorts bornée par l'equity réelle.
- **Idempotence du snapshot** valeur-portefeuille (UPSERT par (portfolio, minute),
  collapse des tick-storms).
- **Alignement parfait pour les joueurs tickés**: engine `current_price` ==
  dernier tick == prix snapshot == prix du live-tail history. Même source.

---

## Findings

### F1 — [Moyen] `POST /api/trades` n'est PAS idempotent (double-submit)
`backend/src/api/routers/portfolio.py` + `TradeORM`.
Chaque appel débite le cash, met à jour le holding et insère un trade. Aucune
clé d'idempotence (pas de `Idempotency-Key`, pas de `client_trade_id`, pas de
contrainte d'unicité). Un retry réseau après un commit non acquitté = **un second
vrai trade**. C'est le point le plus directement lié à ta demande « workflow
idempotent, pas d'effet de bord ». Le worker snapshot est idempotent, mais
l'écriture du trade lui-même ne l'est pas.
→ Fix proposé: header `Idempotency-Key` (UUID client) → colonne unique sur
`trade` → sur replay, renvoyer l'outcome précédent au lieu de rejouer.

### F2 — [Moyen] Alignement front/back coïncidant pour les holdings non-tickés
Joueurs tickés: alignement exact (cf. plus haut).
Joueurs **non-tickés** détenus:
- Front (`compute_portfolio_totals`): prix = `valuation.current_price` = `base_value` (seed engine).
- Back (snapshot + live-tail history): prix = `average_buy_price`.
Égaux *aujourd'hui* seulement parce que `avg == base` au moment de l'achat (on a
acheté au starting price). Si `base_value` est re-seedé (refresh Transfermarkt)
après un achat, le KPI live (base_new) et la queue du graphe history (avg=base_old)
**divergent** — et le commentaire COHERENCE-INVARIANT dans
`portfolio_metrics.ts` (« mark at cost basis, matching backend snapshot »)
devient faux : le front ne tombe pas réellement sur le cost basis, il prend le
prix engine (jamais « missing » dans le repo de valuations).
→ Fix: choisir UNE source de fallback unique et la partager des deux côtés.
Le plus propre: le live-tail/snapshot back utilise la même sémantique
`EngineValuationProvider` que le front (base seed pour non-tické), OU le front
tombe explicitement sur `average_buy_price` comme le back. Pas les deux.

### F3 — [Faible] Preview front ≠ total exécuté (arrondis + prix)
`trade_service.simulate_trade` calcule `amount` arrondi à l'€M entier, shares
floorées à 0.1, et `cash_after` à partir de `amount`. Le back exécute
`total = shares × server_price` (tick 2 décimales). Le delta de cash réel diffère
du preview par l'arrondi et par tout mouvement de prix entre preview et exécution.
`insufficient_capital` est évalué côté client sur `amount` arrondi ; le vrai
garde-fou est serveur (cash + marge, 400 au rejet). **Sûr** mais le preview peut
induire en erreur juste à la limite du cash. Cohérence UX, pas sécurité.

### F4 — [Faible] Asymétrie marge vs contrôle cash si leverage > 1
À `max_gross_leverage = 1.0` (réglage actuel) les deux garde-fous concordent. Si
un jour > 1.0 : les longs restent plafonnés en dur par `cash < total`
(`execute_trade`) alors que les shorts profitent du levier → asymétrie. Soit
documenter « longs = cash only by design », soit relâcher le contrôle cash quand
la marge l'autorise. Latent, pas un bug aujourd'hui.

### F5 — [Faible / connu] Money en float
Domaine en `float` (`float(orm.cash)`), DB `Numeric(12,2)`. `round(...,2)` à
chaque mutation borne la dérive ; la neutralité cash du round-trip est
property-testée. Acceptable pour un simulateur, mais le float money est une
classe de risque connue. Decimal de bout en bout l'éliminerait (à arbitrer, pas
urgent).

### F6 — [Observation] L'ingest live ne matérialise pas les snapshots portefeuille
`materialize_for_player_ticks` est câblé uniquement dans les sinks
simulation/rehearsal + bootstrap, **pas** dans `sportmonks_inplay_poller`. En
live réel, aucun bucket d'historique ne s'accumule. Le live-tail recalcule le
point « maintenant » à la lecture donc le bord droit du graphe est toujours juste,
mais l'historique reste vide hors rehearsal. Attendu au stade prototype (le live
passe par le rehearsal, cf. `rehearsal-synthetic-debt`), à fermer avant prod réel.

### F7 — [Nit] `TradeRequestBody.shares` non borné
Pas de `Field(gt=0)` ni de borne haute ; on s'appuie sur `execute_trade`
(shares<=0 → 400) et la marge (énorme → rejeté). Ajouter `gt=0` pour un 422 propre
et de la défense en profondeur.

---

## Recommandation de priorisation
1. **F1** (idempotence trade) — le plus aligné avec ta demande explicite.
2. **F2** (unifier le fallback de prix non-tické) — durcit l'alignement « total ».
3. F7, F4, F3 — petits durcissements rapides.
4. F5, F6 — à arbitrer, dépendent du calendrier prod.

## État d'implémentation (2026-06-11)

- **F1 — FAIT.** Header `Idempotency-Key` (UUID client) → colonne
  `app.trade.idempotency_key` + UNIQUE `(portfolio_id, idempotency_key)`
  (migration `0033`, appliquée à la DB locale). Replay détecté sous le lock
  `FOR UPDATE` dans `place_trade` → renvoie le trade stocké sans rejouer. NULL
  exempté (chemin legacy). Front (`trades_api`) génère et envoie une clé par
  soumission (web + mobile via `@fundxi/core`). Tests: unit (replay + clés
  distinctes) + intégration (lookup, contrainte unique, NULL exemptés).
- **F2 — FAIT.** Nouvel `SqlAlchemyCurrentPriceProvider` (`tick ?? base`, même
  source que l'engine front) câblé dans le snapshot service + history live-tail.
  `SqlAlchemyLatestPriceProvider` (tick|None) inchangé pour le chemin trade (le
  rejet des non-priçables en dépend). Alignement front/back désormais par
  construction. Test d'intégration dédié.
- Vérif: ruff + pyright strict clean ; 410 tests backend verts (les 3 échecs
  `test_routers.py` sont pré-existants — données WC2022 replay/comments non
  chargées en local, confirmé par `git stash`) ; tsc + 137 vitest verts
  (core + web + mobile).
- **F7 — FAIT.** `TradeRequestBody.shares` exige `gt=0` → 422 propre avant toute
  mutation (la direction est portée par `kind`, jamais par le signe). Défense en
  profondeur (`execute_trade` garde son contrôle). Pas de borne haute (la marge
  plafonne la taille). Test DTO unitaire.
- **F3 — FAIT.** Le `amount` du preview = coût réel exécuté (`round-to-cent` de
  `shares × prix`), au lieu de l'arrondi €M entier → le `cash_after`/`shortfall`
  du preview réconcilie avec ce que le backend débite. Le flooring des shares
  plafonne toujours le coût au budget %. Partagé web+mobile via `@fundxi/core`.
  Tests + property-invariants mis à jour.
- **F4 — FAIT (doc-only).** Commentaires à `execute_trade` (au contrôle cash) +
  `config.max_gross_leverage` : les longs sont cash-only par design, le levier ne
  borne que les shorts. Zéro changement comportemental.
- **F8 — FAIT.** Source unique `portfolio_api.get_holding_metrics(player_id)`
  (réutilise `compute_holding_metrics` + même résolution de prix que la liste/le
  total). Web `YourPositionCard`, mobile `YourPosition` et le P&L de l'en-tête
  mobile la consomment → métriques per-joueur alignées web↔mobile **par
  construction** (plus de formule dupliquée ni de fallback `?? 0` divergent).
  +4 tests core.

### Garantie d'alignement web↔mobile (état actuel)
- **Total portefeuille** (value/cash/pnl/return) : `get_totals()` → core. Garanti.
- **Liste des holdings** (par ligne) : `get_holdings()` → core. Garanti.
- **Métriques de position per-joueur (P&L/market_value/return)** : les **4**
  surfaces (carte + ribbon, web ET mobile) passent par `get_holding_metrics()`
  → core. Garanti (F8 + complément `48880c0`). Vérifié par grep : plus aucun
  `get_holding` brut + calcul local dans les apps. Les deux ribbons affichent
  bien le KPI P&L (pas de gap de présence — mon affirmation initiale était
  erronée, basée sur un grep incomplet).
- Le **float ne cause pas de divergence web↔mobile** (même code core, IEEE-754
  déterministe). C'est un sujet précision backend↔affichage (= F5), pas parité.

- **F6 — FAIT.** Le poller inplay réel matérialise désormais les snapshots de
  valeur en fin de poll : l'ensemble des joueurs tickés est récupéré depuis les
  notifications price-tick (live + settlement + suspension + lineup-drop, même
  sujet → aucune source manquée). **Découplé du chemin live** : session isolée,
  APRÈS le commit des ticks, non-fatal (une erreur de snapshot ne coupe jamais
  les prix live ; auto-réparation au poll suivant, idempotent par minute). ts
  horloge réelle. Tests helper + câblage.
- **Reste ouvert (différé volontairement):** F5 (Decimal bout-en-bout — chantier
  transverse, pas un quick-win).

## Commits
- `8548918` feat(portfolio): idempotent trades + aligned un-ticked valuation (F1+F2)
- `a6f1fe0` feat(portfolio): reject non-positive trade shares at the boundary (F7)
- `33b42b7` fix(portfolio): trade preview amount = executed cost (F3)
- `810cf3a` docs(portfolio): clarify longs are cash-only, leverage bounds shorts (F4)
- `bd48404` refactor(portfolio): single-source per-player position metrics (F8)
- `15b4a74` feat(ingest): materialize portfolio-value snapshots from the live poller (F6)
