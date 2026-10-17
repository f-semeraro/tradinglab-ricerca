# Registro degli esperimenti

Sola aggiunta: ogni backtest aggiunge una riga e non riscrive mai quelle precedenti.
Il risultato è sempre confrontato col «comprato e basta» sullo stesso periodo.

## Pre-registrazione: replica fuori campione di Shen, Urquhart e Wang (2022)

Scritta il 17 ottobre 2026, prima di qualsiasi esecuzione sui dati. I file dell'archivio Kraken non sono ancora presenti in `dati/archivio/`.

**Fonte.** Shen, D., Urquhart, A. e Wang, P. (2022), «Bitcoin intraday time-series momentum», *Financial Review* 57(2), 319–344, doi:10.1111/fire.12290. Il metodo è verificato sul PDF del committente (paragrafi 2, 3.4 e 3.7, tabelle 1 e 8). Tabella 1: sessione Kraken BTC/USD dalle 9:15 alle 17:00 EST, dati 2014–2020. Tabella 8, senza leva: costo di pareggio di 3, 7 e 10 punti base per le tre strategie, con profitto medio per operazione di 0,028%, 0,061% e 0,096%. Con leva 10:1 i profitti sono 0,284%, 0,607% e 0,957%.

**Coppia e periodo.** Coppia principale XBTUSD su Kraken. XBTEUR è solo un confronto, fuori dal giudizio. Periodo dal 1 gennaio 2021 al 30 giugno 2026. Lo studio usa dati fino al 31 dicembre 2020, quindi tutto il periodo è fuori campione. Non c'è un anno di verifica separato: il test si fa una volta sola sull'intero periodo.

**Dati.** Candele a 15 minuti dall'archivio Kraken, in locale in `dati/archivio/`, non nel repository. Il prezzo all'ora X è la chiusura della candela che termina a X.

**Sessione.** Dalle 9:15 alle 17:00, ora di New York (fuso America/New_York con ora legale). *Scostamento dichiarato:* lo studio scrive «EST». Uso il fuso con ora legale, perché le 17:00 sono la pausa dei futures CME, che segue l'ora locale. È un'interpretazione.

**Definizioni**, per ogni giorno t:
- rONFH = P(9:45, t) / P(17:00, t−1) − 1
- rSLH = P(16:30, t) / P(16:00, t) − 1
- rLH = P(17:00, t) / P(16:30, t) − 1, il rendimento dell'operazione.

**Varianti** (tre, dalle equazioni 7 e 8 dello studio):
1. *Inizio sessione:* lungo se rONFH > 0, corto altrimenti.
2. *Penultima mezz'ora:* lungo se rSLH < 0, corto altrimenti.
3. *Combinata* (equazione 8): lungo se rONFH > 0 e rSLH < 0; corto se rONFH < 0 e rSLH > 0; altrimenti fuori.

**Due versioni per ogni variante.**
- *Replica:* lungo e corto, al lordo, come nello studio. Serve a vedere se l'effetto esiste ancora. Non viene giudicata.
- *Eseguibile:* solo il lato lungo, altrimenti fuori. Costi come `strategie/rsi-base.json`: 0,10% per lato più 0,05% di slippage, quindi 0,30% andata e ritorno. Questa versione passa o non passa.

**Giudice.** Permutazione con N = 3 e alfa 0,05. I momenti decisionali sono le 16:30 di ogni giorno in cui la variante ha tutti i prezzi che le servono: sono i giorni eleggibili, e quelli senza prezzi si saltano e si contano. Si rimescolano i giorni in cui si opera, tra quelli eleggibili, tenendo uguale il numero di operazioni; nella replica si conservano anche i segni (lungo o corto). La statistica è la somma dei rendimenti netti per operazione. Le permutazioni sono 10.000, con seme fisso 20261018. Passa solo con p ≤ alfa/N = 0,0167 e risultato netto positivo.

**Scostamenti dal metodo dichiarati.** (a) Fuso con ora legale, al posto di «EST». (b) I giorni con candele mancanti si saltano e si contano. (c) Il periodo 2021–2026 non si sovrappone al campione dello studio (2013–2020): il confronto con la tabella 8 è sul campione completo, e l'anno per anno è solo informativo.

**Previsione.** Al netto la strategia perde: il costo di pareggio dello studio, 3-10 punti base, è sotto i 30 punti base di andata e ritorno che usiamo. Al lordo la domanda è aperta.

**Criterio di successo.** Una variante passa solo con p ≤ 0,0167 e risultato netto positivo dopo i costi. Ogni altro esito non passa.

**Report.** Per ogni variante e versione: numero di operazioni, rendimento medio per operazione in punti base, lordo e netto; costo di pareggio, cioè il rendimento medio lordo; p; esito; anno per anno, solo informativo; confronto con la tabella 8 sul campione completo. Una riga per variante nel registro.

| data (UTC) | strategia | coppia | impronta | periodo | operazioni | capitale | vs comprato e basta | drawdown | nota |
|---|---|---|---|---|---:|---:|---:|---:|---|
| 2026-10-17 15:11 | rsi-base | XXBTZEUR | 1863e747c0 | 27 ott 2024, 02:00 → 16 ott 2025, 02:00 | 0 | 100,00 € (0,00%) | -8,30 punti | 0,00% | passo 1: pipeline su 20 coppie, solo finestra di ricerca |
| 2026-10-17 15:11 | rsi-base | XETHZEUR | 1863e747c0 | 27 ott 2024, 02:00 → 16 ott 2025, 02:00 | 0 | 100,00 € (0,00%) | -13,84 punti | 0,00% | passo 1: pipeline su 20 coppie, solo finestra di ricerca |
| 2026-10-17 15:11 | rsi-base | XXRPZEUR | 1863e747c0 | 27 ott 2024, 02:00 → 16 ott 2025, 02:00 | 0 | 100,00 € (0,00%) | -98,43 punti | 0,00% | passo 1: pipeline su 20 coppie, solo finestra di ricerca |
| 2026-10-17 15:11 | rsi-base | SOLEUR | 1863e747c0 | 27 ott 2024, 02:00 → 16 ott 2025, 02:00 | 0 | 100,00 € (0,00%) | 30,03 punti | 0,00% | passo 1: pipeline su 20 coppie, solo finestra di ricerca |
| 2026-10-17 15:11 | rsi-base | LINKEUR | 1863e747c0 | 27 ott 2024, 02:00 → 16 ott 2025, 02:00 | 0 | 100,00 € (0,00%) | -13,47 punti | 0,00% | passo 1: pipeline su 20 coppie, solo finestra di ricerca |
| 2026-10-17 15:11 | rsi-base | XZECZEUR | 1863e747c0 | 27 ott 2024, 02:00 → 16 ott 2025, 02:00 | 0 | 100,00 € (0,00%) | -313,35 punti | 0,00% | passo 1: pipeline su 20 coppie, solo finestra di ricerca |
| 2026-10-17 15:11 | rsi-base | XDGEUR | 1863e747c0 | 27 ott 2024, 02:00 → 16 ott 2025, 02:00 | 0 | 100,00 € (0,00%) | 53,70 punti | 0,00% | passo 1: pipeline su 20 coppie, solo finestra di ricerca |
| 2026-10-17 15:11 | rsi-base | ADAEUR | 1863e747c0 | 27 ott 2024, 02:00 → 16 ott 2025, 02:00 | 0 | 100,00 € (0,00%) | 17,41 punti | 0,00% | passo 1: pipeline su 20 coppie, solo finestra di ricerca |
| 2026-10-17 15:11 | rsi-base | SUIEUR | 1863e747c0 | 27 ott 2024, 02:00 → 16 ott 2025, 02:00 | 0 | 100,00 € (0,00%) | 40,43 punti | 0,00% | passo 1: pipeline su 20 coppie, solo finestra di ricerca |
| 2026-10-17 15:11 | rsi-base | XLTCZEUR | 1863e747c0 | 27 ott 2024, 02:00 → 16 ott 2025, 02:00 | 0 | 100,00 € (0,00%) | 5,40 punti | 0,00% | passo 1: pipeline su 20 coppie, solo finestra di ricerca |
| 2026-10-17 15:11 | rsi-base | TRXEUR | 1863e747c0 | 27 ott 2024, 02:00 → 16 ott 2025, 02:00 | 0 | 100,00 € (0,00%) | -42,32 punti | 0,00% | passo 1: pipeline su 20 coppie, solo finestra di ricerca |
| 2026-10-17 15:11 | rsi-base | NEAREUR | 1863e747c0 | 27 ott 2024, 02:00 → 16 ott 2025, 02:00 | 0 | 100,00 € (0,00%) | 65,32 punti | 0,00% | passo 1: pipeline su 20 coppie, solo finestra di ricerca |
| 2026-10-17 15:11 | rsi-base | UNIEUR | 1863e747c0 | 27 ott 2024, 02:00 → 16 ott 2025, 02:00 | 0 | 100,00 € (0,00%) | 35,36 punti | 0,00% | passo 1: pipeline su 20 coppie, solo finestra di ricerca |
| 2026-10-17 15:11 | rsi-base | BCHEUR | 1863e747c0 | 27 ott 2024, 02:00 → 16 ott 2025, 02:00 | 0 | 100,00 € (0,00%) | -4,94 punti | 0,00% | passo 1: pipeline su 20 coppie, solo finestra di ricerca |
| 2026-10-17 15:11 | rsi-base | AAVEEUR | 1863e747c0 | 27 ott 2024, 02:00 → 16 ott 2025, 02:00 | 0 | 100,00 € (0,00%) | -24,06 punti | 0,00% | passo 1: pipeline su 20 coppie, solo finestra di ricerca |
| 2026-10-17 15:12 | rsi-base | XXLMZEUR | 1863e747c0 | 27 ott 2024, 02:00 → 16 ott 2025, 02:00 | 0 | 100,00 € (0,00%) | -42,68 punti | 0,00% | passo 1: pipeline su 20 coppie, solo finestra di ricerca |
| 2026-10-17 15:12 | rsi-base | AVAXEUR | 1863e747c0 | 27 ott 2024, 02:00 → 16 ott 2025, 02:00 | 0 | 100,00 € (0,00%) | 45,70 punti | 0,00% | passo 1: pipeline su 20 coppie, solo finestra di ricerca |
| 2026-10-17 15:12 | rsi-base | ALGOEUR | 1863e747c0 | 27 ott 2024, 02:00 → 16 ott 2025, 02:00 | 0 | 100,00 € (0,00%) | 9,47 punti | 0,00% | passo 1: pipeline su 20 coppie, solo finestra di ricerca |
| 2026-10-17 15:12 | rsi-base | ATOMEUR | 1863e747c0 | 27 ott 2024, 02:00 → 16 ott 2025, 02:00 | 0 | 100,00 € (0,00%) | 48,48 punti | 0,00% | passo 1: pipeline su 20 coppie, solo finestra di ricerca |
| 2026-10-17 15:12 | rsi-base | FILEUR | 1863e747c0 | 27 ott 2024, 02:00 → 16 ott 2025, 02:00 | 0 | 100,00 € (0,00%) | 69,09 punti | 0,00% | passo 1: pipeline su 20 coppie, solo finestra di ricerca |
| 2026-10-17 23:04 | shen-inizio | XBTUSD | 1e0000e7bd | 1 gen 2021 → 30 giu 2026 | 1026 | — | pareggio -2,2 p.b. · p 7.85e-1 | — | Shen et al. 2022, inizio: eseguibile non passa; replica lorda -0,9 p.b., p 7.94e-1 |
| 2026-10-17 23:04 | shen-penultima | XBTUSD | 1e0000e7bd | 1 gen 2021 → 30 giu 2026 | 957 | — | pareggio -0,7 p.b. · p 2.81e-1 | — | Shen et al. 2022, penultima: eseguibile non passa; replica lorda 0,7 p.b., p 2.76e-1 |
| 2026-10-17 23:04 | shen-combinata | XBTUSD | 1e0000e7bd | 1 gen 2021 → 30 giu 2026 | 532 | — | pareggio -2,6 p.b. · p 7.68e-1 | — | Shen et al. 2022, combinata: eseguibile non passa; replica lorda -0,2 p.b., p 5.56e-1 |
