# La variante «B giornaliera» della regola B, con controllo giornaliero dell'ingresso

Pre-registrazione: registro/esperimenti.md, sezione «variante «B giornaliera» della regola B», commit 32c7415. Il test A non è indipendente da liu-b: l'idea nasce dai suoi risultati sugli stessi periodi.

**Verdetto:** non passa. Per passare servono entrambi i test, ciascuno con p ≤ 0,025 e somma netta positiva.

**Correzione dopo l'esecuzione.** La prima versione del calcolo ribilanciava il portafoglio ogni giorno, mentre la pre-registrazione prevede pesi uguali senza ribilanciamento. Sono corrette le righe di portafoglio e buy and hold, la tabella anno per anno e il file JSON. Prima della correzione: A portafoglio 371,84% (annuo 32,72%, drawdown -39,19%), buy and hold 111,35%; B portafoglio 125,00% (annuo 38,47%, drawdown -34,12%), buy and hold 55,34%. Il giudizio non cambia: usa le operazioni e i loro rendimenti netti, non la curva. Liu-b non è toccato.

| test | strategia | rendimento totale | rendimento annuo | drawdown massimo | operazioni all'anno per moneta | p | esito |
|---|---|---:|---:|---:|---:|---:|---|
| A · universo 2020 | portafoglio giornaliero | 327,89% | 30,37% | -36,29% | 11,3 | 0,00051 | **passa** |
| A · universo 2020 | buy and hold, stesse monete | 54,05% | 8,20% | -84,07% | — | — | — |
| A · universo 2020 | liu-b, stesse monete | 238,07% | 24,89% | -26,24% | 6,3 | 0,00360 (informativo) | informativo |
| B · ciclo 2018–2020 | portafoglio giornaliero | 97,00% | 31,28% | -33,19% | 10,9 | 0,03044 | non passa |
| B · ciclo 2018–2020 | buy and hold, stesse monete | 80,18% | 26,66% | -72,55% | — | — | — |
| B · ciclo 2018–2020 | liu-b, stesse monete | 76,60% | 25,64% | -18,26% | 6,1 | 0,05738 (informativo) | informativo |

## Giudizio

- A (universo 2020): 1945 spostamenti (esclusi entro 28 giorni dallo zero), p minimo 0,00051, somma netta per operazione 3437,76 punti.
- B (ciclo 2018–2020): 853 spostamenti (esclusi entro 28 giorni dallo zero), p minimo 0,00117, somma netta per operazione 441,14 punti.

## Per moneta (solo come informazione)

### A · universo 2020

| moneta | operazioni | giorni dentro | rendimento giornaliero | buy and hold | liu-b | buy and hold liu-b |
|---|---:|---:|---:|---:|---:|---:|
| ADAEUR | 58 | 27,67% | 238,25% | -22,36% | 108,05% | -22,37% |
| BCHEUR | 67 | 28,02% | -6,27% | -49,88% | 135,83% | -49,88% |
| DASHEUR | 68 | 30,42% | -0,57% | -59,64% | 37,31% | -59,64% |
| EOSEUR | 57 | 25,67% | 44,88% | -81,04% | 83,62% | -81,04% |
| ETCEUR | 52 | 23,78% | 710,51% | 18,27% | 1149,06% | 18,25% |
| ETHEUR | 53 | 21,73% | 260,84% | 78,79% | 168,81% | 78,77% |
| GNOEUR | 66 | 28,37% | 254,67% | 29,89% | 417,94% | 29,87% |
| LTCEUR | 68 | 29,17% | -68,64% | -70,65% | 19,67% | -70,65% |
| QTUMEUR | 61 | 27,97% | 1501,49% | -67,33% | 169,05% | -67,34% |
| REPEUR | 53 | 40,21% | -82,85% | -95,20% | -61,07% | -95,20% |
| XLMEUR | 58 | 26,22% | 601,82% | 41,67% | 101,85% | 41,63% |
| XMREUR | 64 | 25,57% | -51,65% | 150,19% | -20,28% | 150,19% |
| XRPEUR | 72 | 31,82% | 492,10% | 417,66% | 224,76% | 417,60% |
| XTZEUR | 57 | 24,83% | 304,37% | -88,97% | 150,41% | -88,97% |
| ZECEUR | 71 | 35,46% | 719,44% | 609,42% | 886,03% | 609,41% |

Anno per anno (solo come informazione):

| anno | giornaliera | buy and hold | liu-b |
|---|---:|---:|---:|
| 2021 | 227,73% | 213,99% | 123,22% |
| 2022 | -5,97% | -69,26% | 13,75% |
| 2023 | 8,15% | 58,30% | -0,39% |
| 2024 | 67,92% | 74,10% | 49,99% |
| 2025 | -7,75% | -11,71% | 1,46% |
| 2026 | -17,11% | -34,41% | -12,12% |

### B · ciclo 2018–2020

| moneta | operazioni | giorni dentro | rendimento giornaliero | buy and hold | liu-b | buy and hold liu-b |
|---|---:|---:|---:|---:|---:|---:|
| XBTEUR | 29 | 28,13% | 108,27% | 291,38% | 84,79% | 291,37% |
| LTCEUR | 33 | 35,05% | 146,49% | 51,30% | -20,07% | 51,29% |
| ETCEUR | 21 | 22,31% | 53,96% | -65,39% | 10,65% | -65,39% |
| ETHEUR | 26 | 24,62% | 79,30% | 43,41% | 231,01% | 43,39% |

Anno per anno (solo come informazione):

| anno | giornaliera | buy and hold | liu-b |
|---|---:|---:|---:|
| 2018 | -5,64% | -60,19% | -8,49% |
| 2019 | 30,13% | 44,45% | 26,40% |
| 2020 | 60,44% | 213,30% | 52,68% |

## Scostamenti dal metodo

Quelli dichiarati nella pre-registrazione, lettere da (a) a (f): (a) il test A non è indipendente da liu-b; (b) il test B include ETH; (c) l'esclusione entro 28 giorni dallo zero è scelta di questo test; (d) nella nulla le operazioni hanno durata variabile; (e) liu-b usa il motore settimanale dei test precedenti; (f) giorni senza candela e monete tolte dal listino seguono le regole della pre-registrazione.

---

Simulazione su carta. Nessuna operazione reale, nessuna chiave, nessuna consulenza.
