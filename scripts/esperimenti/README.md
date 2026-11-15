# Esperimenti eseguiti

Gli script di questa cartella hanno prodotto i risultati scritti in `registro/esperimenti.md` e in `report/`. Ognuno è stato pre-registrato, eseguito una volta sola e non si può rilanciare: la sua guardia legge il registro e si ferma.

**Sono un registro, non uno strumento.** Restano come erano al momento dell'esecuzione, con i loro aiuti scritti sul posto, perché devono poter dire che cosa è stato calcolato. Dopo l'esecuzione sono cambiati solo i percorsi, quando sono stati spostati qui da `scripts/`. Per un test nuovo non si copia uno di questi: si parte dai moduli condivisi di `lib/`, come spiega il README principale.

| script | che cosa ha testato | report |
|---|---|---|
| `shen.js` | replica di Shen, Urquhart e Wang (2022), momentum infragiornaliero | `report/shen-replica.md` |
| `liu.js` | replica di Liu e Tsyvinski (2021), varianti A, B e C su Bitcoin | `report/liu-replica.md` |
| `liu-b-informativa.js` | verifica informativa della regola B prima della prova in avanti | riga nel registro |
| `conferma-crypto.js` | regola B su altre sette monete | `report/conferma-crypto.md` |
| `detzel.js` | Detzel, Liu, Strauss, Zhou e Zhu (2021), medie mobili su Bitcoin | `report/detzel.md` |
| `detzel-140-indietro.js` | media a 140 giorni sul periodo 2018–2020 | `report/detzel-140-indietro.md` |
| `b-universo-2020.js` | regola B sull'universo scelto con i dati fino al 2020 | `report/b-universo-2020.md` |
| `b-indietro-2018.js` | regola B sul ciclo 2018–2020 | `report/b-indietro-2018.md` |
| `b-indietro-2018-estensione.js` | secondo tentativo sul ciclo 2018–2020 | `report/b-indietro-2018-estensione.md` |
| `b-giornaliera.js` | variante «B giornaliera» della regola B | `report/b-giornaliera.md` |

I dati che leggono sono in `dati/archivio/`, che resta in locale e non è nel repository.
