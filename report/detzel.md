# Test di Detzel, Liu, Strauss, Zhou e Zhu (2021): medie mobili su Bitcoin

Pre-registrazione: registro/esperimenti.md, sezione «test di Detzel, Liu, Strauss, Zhou e Zhu (2021) su XBTUSD», scritta il 18 ottobre 2026 prima dei dati.

**Verdetto (test principale):** non passa. p 0,48523 contro soglia 0,05; rendimento netto totale -29,37%.

**Test secondario (replica):** nessuna esposizione passa. Non decide il verdetto.

## Test principale: media a 7 giorni, dal 1 aprile 2022 al 28 giugno 2026

Giudice: rotazione circolare delle esposizioni, 1489 spostamenti (s = 31…1519), senza seme. N = 1, alfa 0,05, soglia 0,05. Il minimo raggiungibile di p è 0,00067. Periodo: 1550 giorni.

Costi: 0,15% per lato e per unità di variazione di esposizione, cioè 0,30% per operazione intera.

| esposizione | cambi all'anno | giorni dentro | rendimento totale | rendimento annuo | drawdown massimo | vantaggio sul buy and hold (p.b. al giorno) | costo di pareggio per lato | statistica (p.b. al giorno) | p | esito |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| L = 1 settimana | 81,5 | 50,32% | -29,37% | -7,87% | -52,67% | -5,94 | non definito | -0,76 | 0,48523 | non passa |

Buy and hold nello stesso periodo: rendimento totale 30,29%, annuo 6,43%, drawdown massimo -66,19%.

Anno per anno (solo informativo; il primo e l'ultimo anno sono parziali):

| anno | L = 1 settimana | buy and hold |
|---|---:|---:|
| 2022 | -52,60% | -63,75% |
| 2023 | 56,22% | 155,57% |
| 2024 | 41,43% | 121,04% |
| 2025 | -17,92% | -6,29% |
| 2026 | -17,82% | -32,11% |

XBTEUR (solo confronto, nessun giudizio):

| esposizione | giorni dentro | rendimento totale | buy and hold |
|---|---:|---:|---:|
| L = 1 settimana | 51,23% | -33,65% | 26,76% |

## Test secondario: replica delle sei esposizioni, dal 1 gennaio 2021 al 28 giugno 2026

Giudice: rotazione circolare delle esposizioni, 1944 spostamenti (s = 31…1974), senza seme. N = 6, alfa 0,05, soglia 0,00833. Il minimo raggiungibile di p è 0,00051. Periodo: 2005 giorni.

| esposizione | cambi all'anno | giorni dentro | rendimento totale | rendimento annuo | drawdown massimo | vantaggio sul buy and hold (p.b. al giorno) | costo di pareggio per lato | statistica (p.b. al giorno) | p | esito |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| L = 1 settimana | 81,6 | 51,02% | -35,95% | -7,80% | -78,59% | -8,38 | non definito | -0,21 | 0,58663 | non passa |
| L = 2 settimane | 53,2 | 50,72% | 50,63% | 7,75% | -62,36% | -4,08 | non definito | 4,09 | 0,24113 | non passa |
| L = 4 settimane | 33,2 | 50,57% | 113,36% | 14,80% | -51,73% | -2,33 | non definito | 5,84 | 0,15424 | non passa |
| L = 10 settimane | 17,1 | 53,77% | 209,78% | 22,87% | -59,17% | -0,27 | 0,09% | 7,90 | 0,08329 | non passa |
| L = 20 settimane | 9,8 | 55,16% | 381,86% | 33,17% | -35,31% | 1,97 | 0,91% | 10,14 | 0,03753 | non passa |
| combinazione EW (media delle cinque) | 38,9 | 52,25% | 116,48% | 15,11% | -55,77% | -2,62 | non definito | 5,55 | 0,09512 | non passa |

Buy and hold nello stesso periodo: rendimento totale 104,81%, annuo 13,95%, drawdown massimo -76,67%.

Costo per lato che azzera il vantaggio, confronto con la tabella 6 dello studio (versione 2018, riassunta da CXO Advisory). Il nostro è definito come nella pre-registrazione: il confronto è indicativo.

| esposizione | qui | studio |
|---|---:|---:|
| L = 1 settimana | non definito | 1,38% |
| L = 2 settimane | non definito | 2,12% |
| L = 4 settimane | non definito | 3,13% |
| L = 10 settimane | 0,09% | 5,75% |
| L = 20 settimane | 0,91% | 6,85% |
| combinazione EW (media delle cinque) | non definito | non riportato |

Anno per anno (solo informativo; il primo e l'ultimo anno sono parziali):

| anno | L = 1 settimana | L = 2 settimane | L = 4 settimane | L = 10 settimane | L = 20 settimane | combinazione EW (media delle cinque) | buy and hold |
|---|---:|---:|---:|---:|---:|---:|---:|
| 2021 | 20,36% | 18,86% | 43,93% | 75,39% | 76,55% | 49,55% | 59,13% |
| 2022 | -64,29% | -40,27% | -41,67% | -47,78% | -10,78% | -42,42% | -64,19% |
| 2023 | 56,22% | 48,37% | 81,97% | 115,53% | 95,93% | 79,68% | 155,57% |
| 2024 | 41,43% | 65,55% | 47,96% | 58,44% | 86,04% | 61,53% | 121,04% |
| 2025 | -17,92% | -12,88% | -7,19% | 7,39% | -6,71% | -7,05% | -6,29% |
| 2026 | -17,82% | -0,85% | 1,70% | -7,76% | -10,04% | -6,81% | -32,11% |

XBTEUR (solo confronto, nessun giudizio):

| esposizione | giorni dentro | rendimento totale | buy and hold |
|---|---:|---:|---:|
| L = 1 settimana | 52,07% | -36,04% | 120,29% |
| L = 2 settimane | 50,92% | 25,80% | 120,29% |
| L = 4 settimane | 50,97% | 83,95% | 120,29% |
| L = 10 settimane | 54,56% | 210,87% | 120,29% |
| L = 20 settimane | 54,66% | 316,43% | 120,29% |
| combinazione EW (media delle cinque) | 52,64% | 96,77% | 120,29% |

## Scostamenti dal metodo

(a) Equazione 16 dello studio: S_t · r_t; qui S_t si applica a r_(t+1), l'unica versione eseguibile. (b) Liquidità a rendimento zero; lo studio usa il tasso privo di rischio. (c) Prezzi Kraken invece di CoinDesk; il test principale è su 2022–2026, fuori dal campione dello studio e da quello di Wei e colleghi. (d) Esclusione entro 30 giorni dallo zero: scelta di questo test. (e) Vantaggio sul buy and hold misurato come rendimento netto medio giornaliero: la definizione dello studio potrebbe differire. (f) La regola di Wei e colleghi è letta come segno del rapporto logaritmico con la media a 7 giorni. (g) Nella nulla i costi sono quelli della serie circolare; nella serie osservata la posizione è piatta ai bordi.

«Non definito» vuol dire che la regola non ha un costo positivo di pareggio: il vantaggio è già negativo a costo zero, o la regola non cambia più del buy and hold.

---

Simulazione su carta. Nessuna operazione reale, nessuna chiave, nessuna consulenza.
