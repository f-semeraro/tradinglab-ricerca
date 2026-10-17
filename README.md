# tradinglab-ricerca

Il laboratorio di ricerca di TradingLab: prova strategie di trading su un portafoglio di carta, un giro all'ora su GitHub Actions, e registra i risultati senza abbellirli.

**Repository pubblico, quindi senza segreti.** Non ci sono chiavi API, token, chat né credenziali. Gli endpoint di Kraken usati sono pubblici. Se un giorno servisse una chiave, va nei *Secrets* di GitHub e il codice la legge da lì: non va mai committata.

**Non è consulenza finanziaria.** Nessun ordine viene inviato a nessun exchange. Le operazioni sono simulate, con commissioni e slippage.

## Come funziona

Ogni ora il workflow [`laboratorio.yml`](.github/workflows/laboratorio.yml) lancia `scripts/giro.js`, che:

1. scarica le candele orarie chiuse di SOLEUR dall'endpoint pubblico di Kraken;
2. per ogni file in `strategie/`, fa avanzare il portafoglio di carta di quella strategia sulle candele che non ha ancora elaborato;
3. salva lo stato in `risultati/<strategia>/` e aggiorna `risultati/SINTESI.md`;
4. se qualcosa è cambiato, committa `risultati/`.

Ogni strategia ha il suo portafoglio e il suo benchmark «comprato e basta», fissato alla prima candela che ha elaborato.

## Struttura

| Percorso | Cosa contiene |
|---|---|
| `strategie/` | una configurazione per strategia. `rsi-base.json` è identica a quella del progetto principale |
| `laboratorio.json` | mercato, intervallo, capitale di partenza, fuso, giorni esclusi dal backtest |
| `risultati/` | stato di ogni strategia e sintesi, aggiornati a ogni giro |
| `report/` | report dei backtest, uno per strategia (sovrascritti a ogni esecuzione) |
| `registro/esperimenti.md` | una riga per ogni backtest, sola aggiunta |
| `dati/storico/` | candele per il backtest, in CSV |
| `lib/` | il nucleo di calcolo, copiato dal progetto principale, più i pezzi nuovi |
| `scripts/` | `giro.js` e `backtest.js`: la parte che parla con il mondo |
| `test/` | i test del nucleo e dei pezzi nuovi |

## Il nucleo puro

`indicatori.js`, `strategia.js`, `portafoglio.js`, `metriche.js` e `tempo.js` sono copie **identiche** di quelli del progetto principale (`tradinglab/lib`), con i rispettivi test. Sono funzioni pure: non leggono l'orologio, non leggono file né variabili d'ambiente, non usano la rete. Il tempo e il fuso si passano sempre da fuori.

Ci sono poi altri quattro file copiati per lo stesso motivo. `blocchi.js`, `benchmark.js` e `rischio.js` sono pure. `configurazione.js` non lo è: contiene l'unica lettura del file della strategia (`leggiStrategia`), e serve agli script per validarla. Il calcolo non la importa.

Il codice nuovo di questo repository segue la stessa regola: `simulazione.js` è pura, `kraken.js` è l'unico punto che parla con la rete, `persistenza.js` è l'unico che scrive su disco.

**Quando cambi uno dei file copiati nel progetto principale, ricopialo qui e fai girare i test in entrambi i posti.** Non c'è un controllo automatico che lo faccia per te.

## Il cursore

Ogni strategia salva l'ultima candela elaborata nel proprio stato, e il giro riparte da lì. Se il giro si interrompe a metà, lo stato dice la verità: una candela si conta una sola volta. Se mancano candele (il workflow è stato fermo più di 30 giorni, cioè più delle 720 candele che Kraken restituisce), il buco si registra in `stato.json` con il numero di candele mancanti, e non si riempie.

## Usarlo in locale

```bash
npm test
```

```bash
npm run backtest -- --usa-ultimo-anno --strategia rsi-base --da 2026-03-01 --a 2026-05-31 --nota "primo confronto"
```

Il backtest non tocca `risultati/`. Scrive `report/<strategia>.md` e aggiunge una riga a `registro/esperimenti.md`.

**L'ultimo anno è escluso per default** (`escludiUltimiGiorni` in `laboratorio.json`). Si include solo con `--usa-ultimo-anno`, scritto apposta nel comando.

`npm run giro` in locale scrive in `risultati/` del tuo clone. Di solito non serve: lo fa il workflow.

## Il protocollo

Si tara su una finestra di date (`--da`, `--a`) e si crede solo a quello che regge su un'altra finestra, non sovrapposta. Un risultato su una finestra sola non dice niente.

## Verifiche fatte

- **Motore di produzione contro laboratorio.** Stessi dati (SOLEUR a 60 minuti, da marzo ad agosto 2026), stesse configurazioni: `rsi-base` più le tredici varianti del progetto principale. Operazioni, curva del capitale e capitale finale coincidono in tutte; in totale sono 763 operazioni confrontate. Ripartire a metà attraverso il JSON dà lo stesso stato di una corsa sola.
- **Giro end-to-end**, con Kraken simulato: quattro giri in sequenza, il quarto senza novità, che non cambia niente. Un salto di 1000 candele produce un buco dichiarato di 280.
- **Backtest da riga di comando**: senza opzioni, con l'ultimo anno escluso, si ferma con un messaggio; date non valide e opzioni sconosciute si fermano con un messaggio.

## Limiti da tenere a mente

- **Sei mesi di dati** (marzo–agosto 2026), tutti dentro l'ultimo anno: senza `--usa-ultimo-anno` il backtest non ha niente da rigiocare. Il CSV è stato ricavato una volta dall'archivio del progetto principale; lo script di conversione non è in questo repository, quindi aggiornarlo richiede di rifarlo.
- **Nel periodo di prova il controllo di rischio non è mai scattato.** Il codice è lo stesso del progetto principale, ma nei dati non c'è stato un caso che lo attivasse.
- **La strategia `rsi-base` non è mai scattata** nel periodo: le sue tre condizioni insieme non si sono verificate.
- Le candele si elaborano a chiusura, e il prezzo di esecuzione è quello di chiusura. Il sistema dal vivo fa lo stesso, ma nessun ordine è reale.
- Il giro vede solo le ultime 720 candele che Kraken restituisce. Gli indicatori con memoria (le medie esponenziali) partono dalla prima candela della finestra.

## Pubblicazione

I risultati sono pubblici, compresi quelli negativi. Se una strategia perde, il registro lo dice. Non è un invito a seguire nulla.
