# Replica fuori campione: Liu e Tsyvinski (2021)

Coppia giudicata: XBTUSD. Confronto, fuori dal giudizio: XBTEUR. Periodo: settimane da lunedì 4 gennaio 2021 a domenica 28 giugno 2026.
Giudizio: permutazione delle operazioni tra le settimane del periodo, 10000 ricollocazioni, seme 20261019, N = 3, alfa 0.05, soglia p = 0.0167.
Costi: 30,0 punti base per operazione, andata e ritorno.

## Risultati

| variante | operazioni | settimane dentro | lordo medio (p.b.) | netto medio (p.b.) | rendimento totale | drawdown massimo | p | esito |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| A | 75 | 50,35% | 188,1 | 158,1 | 91,17% | -53,76% | 3.66e-1 | non passa |
| B | 26 | 13,64% | 494,4 | 464,4 | 183,30% | -21,52% | 1.60e-2 | **passa** |
| C | 22 | 31,12% | 667,9 | 637,9 | 132,44% | -40,62% | 6.68e-2 | non passa |
| buy and hold | 1 | 100% | — | — | 79,28% | -75,17% | — | confronto |

## Anno per anno (solo informativo)

| anno | A: ops, rendimento | B: ops, rendimento | C: ops, rendimento | buy and hold |
|---|---:|---:|---:|---:|
| 2021 | 14, 54,92% | 6, 140,80% | 5, 63,99% | 53,55% |
| 2022 | 14, -42,00% | 3, -13,41% | 3, -34,91% | -66,88% |
| 2023 | 13, 54,25% | 6, 14,89% | 6, 18,74% | 151,06% |
| 2024 | 14, 43,42% | 6, 36,71% | 4, 95,94% | 121,47% |
| 2025 | 14, 0,65% | 4, -6,73% | 3, -0,73% | -6,09% |
| 2026 | 6, -4,29% | 1, -7,11% | 1, -5,57% | -32,39% |

## Confronto XBTEUR (fuori dal giudizio)

| variante | operazioni | lordo medio (p.b.) | rendimento totale |
|---|---:|---:|---:|
| A | 77 | 161,8 | 66,63% |
| B | 25 | 591,6 | 245,14% |
| C | 21 | 859,0 | 226,84% |

## Scostamenti dal metodo

(a) Il percentile di B e C usa tutti i dati Kraken dal 2013, non il campione CoinDesk dal 2011. (b) Il periodo non si sovrappone al campione dello studio. (c) Le soglie della tabella 15 usano l'intero campione; qui solo il passato. (d) Le permanenze iniziate prima del periodo entrano alla prima domenica del periodo. (e) Nessuna domenica senza prezzo nel periodo.

---

Simulazione su carta. Nessuna operazione reale, nessuna chiave, nessuna consulenza.

## Verifica informativa del p

Pianificata prima dell'esecuzione: seme 20261020, 100.000 permutazioni per A, B e C. Solo informativa: il verdetto pre-registrato non cambia, qualunque sia il risultato.

Eseguita il 2026-10-17 23:39, con seme 20261020 e 100000 permutazioni, come pianificato.

| variante | p (100.000 perm.) | errore standard Monte Carlo | soglia | esito informativo | verdetto pre-registrato |
|---|---:|---:|---:|---|---|
| A | 3.62e-1 | 1.52e-3 | 0.0167 | non passa | non passa (invariato) |
| B | 1.66e-2 | 4.04e-4 | 0.0167 | passa | passa (invariato) |
| C | 6.50e-2 | 7.80e-4 | 0.0167 | non passa | non passa (invariato) |

Il verdetto pre-registrato non cambia, qualunque sia il risultato: B passa con p 0,0160 su 10.000 permutazioni e seme 20261019, come scritto nei risultati sopra. Questa sezione misura solo quanto il p dipende dal caso.
