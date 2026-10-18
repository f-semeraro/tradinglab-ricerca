# Conferma della regola B su altre crypto

Pre-registrazione: registro/esperimenti.md, sezione «test di conferma della regola B su altre crypto» (commit 80345e0). Periodo: domeniche dal 2021-01-03 al 2026-06-28, 286 settimane.
Giudice: rotazione circolare comune, 285 spostamenti (tutti tranne lo zero), senza seme. N = 1, alfa 0,05.
Costi: 0,30% per operazione, andata e ritorno.

## Risultato complessivo

| statistica osservata (somma netta, punti) | p | soglia | esito |
|---:|---:|---:|---|
| 1677,56 | 0,0105 | 0,05 | **passa** |

Risoluzione del p: il minimo raggiungibile con 285 spostamenti è 0,0035.

## Portafoglio a pesi uguali contro buy and hold

| portafoglio | rendimento totale | drawdown massimo |
|---|---:|---:|
| regola B | 241,58% | -30,20% |
| buy and hold a pesi uguali | 143,50% | -81,55% |

## Per moneta (solo informativo)

| moneta | operazioni | rendimento netto regola | buy and hold |
|---|---:|---:|---:|
| ETH | 26 | 168,81% | 78,77% |
| XRP | 39 | 224,76% | 417,60% |
| ZEC | 42 | 886,03% | 609,41% |
| ADA | 32 | 108,05% | -22,37% |
| LTC | 36 | 31,04% | -70,65% |
| BCH | 39 | 135,83% | -49,88% |
| XLM | 34 | 136,51% | 41,63% |

## Monete incluse ed escluse

| moneta | esito | domeniche prima del 4/1/2021 | domeniche senza prezzo nel periodo | motivo |
|---|---|---:|---:|---|
| ETH | inclusa | 283 | 0 | — |
| XRP | inclusa | 190 | 0 | — |
| SOL | esclusa | 0 | 24 | storia corta: 0 domeniche prima del 4/1/2021; 24 domeniche senza prezzo nel periodo |
| LINK | esclusa | 67 | 0 | storia corta: 67 domeniche prima del 4/1/2021 |
| ZEC | inclusa | 219 | 0 | — |
| DOGE | esclusa | 55 | 0 | storia corta: 55 domeniche prima del 4/1/2021 |
| ADA | inclusa | 119 | 0 | — |
| SUI | esclusa | 0 | 122 | storia corta: 0 domeniche prima del 4/1/2021; 122 domeniche senza prezzo nel periodo |
| LTC | inclusa | 376 | 0 | — |
| TRX | esclusa | 44 | 0 | storia corta: 44 domeniche prima del 4/1/2021 |
| NEAR | esclusa | 0 | 76 | storia corta: 0 domeniche prima del 4/1/2021; 76 domeniche senza prezzo nel periodo |
| UNI | esclusa | 12 | 0 | storia corta: 12 domeniche prima del 4/1/2021 |
| BCH | inclusa | 179 | 0 | — |
| AAVE | esclusa | 3 | 0 | storia corta: 3 domeniche prima del 4/1/2021 |
| XLM | inclusa | 182 | 0 | — |
| AVAX | esclusa | 0 | 51 | storia corta: 0 domeniche prima del 4/1/2021; 51 domeniche senza prezzo nel periodo |
| ALGO | esclusa | 50 | 0 | storia corta: 50 domeniche prima del 4/1/2021 |
| ATOM | esclusa | 89 | 0 | storia corta: 89 domeniche prima del 4/1/2021 |
| FIL | esclusa | 12 | 0 | storia corta: 12 domeniche prima del 4/1/2021 |

## Scostamenti dal metodo

(a) Test di conferma su altre crypto, non replica di Liu e Tsyvinski. (b) Giudice: rotazione circolare comune, al posto della permutazione del test su Bitcoin. (c) Portafoglio a pesi uguali, senza ribilanciamento.

## Controlli successivi all'esecuzione

Questi controlli non erano previsti dalla pre-registrazione. Non cambiano il verdetto, che resta quello del risultato complessivo.

- **Convenzione sul bordo del periodo.** Una moneta, LTC, ha una posizione già aperta il 3 gennaio 2021. Contarla come operazione, con ingresso alla prima domenica del periodo, dà una statistica di 1677,56 punti; non contarla dà 1669,07. Il p è 0,0105 in entrambi i casi.
- **Spostamento 285.** Con la rotazione circolare, lo spostamento 285 equivale a uno spostamento di una settimana all'indietro. Le operazioni cadono quindi sulla settimana stessa del segnale, i cui rendimenti hanno generato il segnale: la statistica è 8841 punti. È un allineamento non casuale, che gonfia la distribuzione nulla. Escluso questo spostamento, il p diventa circa 0,0070: il test passa comunque.
- **Mediana della distribuzione nulla:** 274,3 punti, contro 1677,56 osservati.
- **Concentrazione per moneta della somma netta:** ZEC 26,5%, XLM 22,9%, XRP 21,3%, ADA 10,5%, ETH 7,6%, BCH 7,5%, LTC 3,7%. Le prime tre monete pesano circa il 71%.

---

Simulazione su carta. Nessuna operazione reale, nessuna chiave, nessuna consulenza.
