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

## Pre-registrazione: replica fuori campione di Liu e Tsyvinski, «Risks and Returns of Cryptocurrency»

Scritta il 18 ottobre 2026, prima di qualsiasi esecuzione sui dati di questo test. Il test è singolo, come quello su Shen et al.

**Fonte.** Liu, Y. e Tsyvinski, A., «Risks and Returns of Cryptocurrency», NBER working paper w24877. Il testo è stato verificato sul PDF del NBER, letto in locale: paragrafi 2 e 4.1, tabelle 14–17. Dal testo: coefficiente settimanale di 0,19 a una settimana, 0,22 a due, 0,21 a tre e 0,09 a quattro (tabella 14); quinto più alto 11,22% e più basso 2,60% a una settimana, differenza 8,62 (tabella 15); differenza 4,35 dal 2013 (tabella 16); senza anticipazioni, con soglie sui primi due anni, l'effetto resta (tabella 17). Il committente cita la pubblicazione su *Review of Financial Studies* (2021): non l'ho verificata.

**Correzione alla richiesta.** Il committente scriveva che il coefficiente è più debole a due e tre settimane. Il testo dice il contrario: 0,22 e 0,21, più alti dello 0,19 a una settimana. La previsione tiene conto del testo.

**Coppia e periodo.** Coppia principale XBTUSD su Kraken. XBTEUR è solo un confronto, fuori dal giudizio. Periodo giudicato: da lunedì 4 gennaio 2021 a domenica 28 giugno 2026, cioè le settimane complete. I dati da luglio 2026 restano da parte. Lo studio usa dati CoinDesk dal 1 gennaio 2011 al 31 maggio 2018, quindi il periodo giudicato è fuori dal suo campione.

**Dati.** Candele giornaliere (1440 minuti) dall'archivio Kraken, in locale in `dati/archivio/`, non nel repository. Il prezzo di domenica è la chiusura della candela giornaliera di domenica.

**Settimana.** Da lunedì 00:00 a domenica 24:00 UTC. Rendimento settimanale: chiusura di domenica / chiusura della domenica precedente − 1.

**Varianti** (tre, tutte solo lunghe, altrimenti fuori):
1. *A, segno:* si tiene XBTUSD la settimana successiva se la settimana appena chiusa ha rendimento positivo.
2. *B, quinto più alto, 1 settimana:* si tiene la settimana successiva se la settimana appena chiusa supera l'80° percentile dei rendimenti settimanali precedenti. Il percentile è calcolato solo sul passato, su tutte le settimane dal primo dato Kraken (ottobre 2013), con interpolazione lineare (metodo R7). Non include mai la settimana appena chiusa né dati futuri.
3. *C, quinto più alto, 3 settimane:* stesso segnale di B, ma si resta dentro per 3 settimane. Un nuovo segnale mentre si è dentro fa ripartire il conteggio.

**Operazioni.** Una permanenza è un periodo continuo di settimane con la posizione aperta, e conta come un'operazione. Si entra alla chiusura di domenica prima della prima settimana, si esce alla chiusura di domenica dell'ultima. Restare dentro più settimane non costa.

**Costi.** 0,30% per operazione: 0,10% per lato più 0,05% di slippage per lato, pagati all'ingresso e all'uscita. Lo stesso modello di `strategie/rsi-base.json`.

**Giudice.** Giudice a permutazione generale del laboratorio, con N = 3 e alfa 0,05. Le operazioni vere, con la loro durata in settimane, si ricollocano a caso tra le settimane del periodo, senza sovrapposizioni. La statistica è la somma dei rendimenti netti per operazione. Permutazioni: 10.000, con seme fisso 20261019. Passa solo con p ≤ alfa/N = 0,0167 e somma dei rendimenti netti positiva.

**Confronto.** Buy and hold di XBTUSD nello stesso periodo, con lo stesso costo di andata e ritorno (0,30%). Per ogni variante, rendimento totale e drawdown massimo sulla curva settimanale.

**Scostamenti dal metodo dichiarati.**
(a) Per B e C il percentile usa tutti i dati Kraken dal 2013, non il campione CoinDesk dello studio dal 2011.
(b) Il periodo giudicato non si sovrappone al campione dello studio (2011–2018).
(c) Le soglie della tabella 15 usano l'intero campione; qui usano solo il passato, come nell'approccio della tabella 17.
(d) Una permanenza iniziata prima del periodo viene tagliata: entra alla prima domenica del periodo, pagando il costo di ingresso.
(e) Le settimane con dati mancanti si saltano e si contano.

**Previsione.** Nessuna previsione netta. Ci aspettiamo un effetto più debole che nello studio: nello studio la differenza si dimezza già dal 2013, e il campione include anni di salita fortissima, in cui anche dopo le settimane peggiori il rendimento era positivo. Se qualcosa passa, è più probabile che riduca i crolli che batta il buy and hold.

**Criterio di successo.** Una variante passa solo con p ≤ 0,0167 e somma dei rendimenti netti positiva.

**Report.** Per ogni variante: numero di operazioni, percentuale di settimane dentro, rendimento medio per operazione lordo e netto in punti base, rendimento totale e drawdown massimo, buy and hold nello stesso periodo, p ed esito, e anno per anno. Una riga per variante nel registro.

## Pre-registrazione: test di conferma della regola B su altre crypto

Scritta il 18 ottobre 2026, prima di qualsiasi calcolo sui dati di questo test. La regola è quella di B nella replica di Liu e Tsyvinski (quinto più alto, una settimana), senza modifiche.

**Universo.** Le coppie in EUR di `laboratorio.json`, tolto il Bitcoin (XXBTZEUR): 19 coppie. Nei file dell'archivio Kraken si chiamano ETHEUR, XRPEUR, SOLEUR, LINKEUR, ZECEUR, XDGEUR, ADAEUR, SUIEUR, LTCEUR, TRXEUR, NEAREUR, UNIEUR, BCHEUR, AAVEEUR, XLMEUR, AVAXEUR, ALGOEUR, ATOMEUR, FILEUR. I dati sono le candele giornaliere (1440) dell'archivio Kraken completo, già in locale, non nel repository.

**Regola di inclusione.** Una moneta entra se ha almeno 104 domeniche con prezzo, dalla prima candela giornaliera disponibile fino a domenica 3 gennaio 2021 compresa, perché il percentile ne ha bisogno. Entra anche se nel periodo ha al massimo il 2% di domeniche senza prezzo (cioè non più di 5 su 287). Le monete escluse sono elencate nel report con il motivo.

**Periodo.** Come nella replica: da lunedì 4 gennaio 2021 a domenica 28 giugno 2026, cioè 286 settimane.

**Regola.** Identica a B: rendimento da domenica a domenica (UTC); segnale se la settimana appena chiusa supera l'80° percentile, metodo R7, di tutte le settimane precedenti della stessa moneta, dal primo dato disponibile; dentro una settimana; solo lunga, altrimenti fuori; costi 0,10% per lato più 0,05% di slippage, cioè 0,30% per operazione. Ogni moneta ha un proprio portafoglio indipendente.

**Portafoglio.** Pesi uguali e nessun ribilanciamento: ogni moneta parte con 1/N del capitale, e il portafoglio è la somma delle quote. Il confronto è con il buy and hold a pesi uguali delle stesse monete: 1/N in ciascuna, senza ribilanciamento, con lo stesso costo di entrata e uscita di 0,30%.

**Giudice.** Un'unica ipotesi, N = 1, alfa 0,05: «la regola B batte il caso sulle altre crypto». La statistica è la somma dei rendimenti netti per operazione su tutte le monete. La distribuzione nulla è una rotazione circolare comune: la serie delle settimane dentro di ogni moneta si sposta di s settimane, con ritorno all'inizio, e lo stesso s vale per tutte le monete. Una permanenza che attraversa la fine del periodo è una sola operazione, con rendimento composto dalle settimane reali che copre. Si provano tutti gli spostamenti s = 1, …, 285 (cioè tutti tranne lo zero), senza seme. p = (numero di spostamenti con statistica ≥ quella osservata, più 1) / (numero di spostamenti, più 1). Passa solo con p ≤ 0,05 e somma netta positiva.

**Previsione.** Probabilmente non passa. Lo studio trova un momentum meno significativo su Ethereum che su Bitcoin, e su Bitcoin B è passata esattamente sul confine: p 0,0166 con 100.000 permutazioni. Se passa, è la prima prova indipendente a favore della regola.

**Scostamenti dal metodo.** (a) L'universo è di altre crypto: è un test di conferma, non una replica. (b) Il giudice è una rotazione circolare comune, al posto della permutazione del test su Bitcoin. (c) Il portafoglio è a pesi uguali, con monete indipendenti.

**Report.** Il risultato complessivo con p ed esito; il portafoglio di B a pesi uguali contro il buy and hold a pesi uguali, con rendimento totale e drawdown massimo; per ogni moneta, solo come informazione, operazioni, rendimento netto e buy and hold. Una riga nel registro.

## Pre-registrazione: test di Detzel, Liu, Strauss, Zhou e Zhu (2021) su XBTUSD, con la media a 7 giorni come test principale

Scritta il 18 ottobre 2026, prima di qualsiasi calcolo sui dati di questo test. Nulla è stato ancora letto né calcolato. Il test principale decide il verdetto; la replica delle sei esposizioni è secondaria.

**Motivo del disegno.** Il disegno è cambiato prima dei dati, dopo la lettura integrale di due studi critici. Wei, Kyriakou, Sermpinis e Stasinakis (2024), *International Journal of Finance & Economics* 29(4), 4073–4104, doi:10.1002/ijfe.2863: su 12 criptovalute, dal 2015 a marzo 2022 secondo il committente, con correzione rigorosa per i test multipli su regole tecniche. L'abstract riporta 7.846 regole; il committente scrive 7.851, da verificare sul testo letto. Tra le regole tecniche solo il rapporto logaritmico tra prezzo e media mobile di breve periodo regge nel campione e fuori. L'indice di hashrate, fondamentale, regge anch'esso e non è nel test. Il test principale verifica quella regola su dati successivi a quelli dello studio.

**Test principale.**
- Regola: per ogni giorno t, b_t è il logaritmo naturale della chiusura di t (UTC). La media ma_t è la media di b sugli ultimi 7 giorni, oggi compreso. Il segnale è 1 se b_t > ma_t, altrimenti 0: il segno del rapporto logaritmico tra prezzo e media. Solo lunga.
- Esposizione: l'esposizione del giorno d è il segnale del giorno d−1.
- Dati: candele giornaliere (1440 minuti) di XBTUSD dall'archivio Kraken, in locale in `dati/archivio/`, non nel repository. Nessuna mancanza nel periodo, come verificato sul file.
- Periodo giudicato: dal 1 aprile 2022 al 28 giugno 2026, W = 1550 giorni. Il periodo inizia dopo l'ultimo dato di Wei e colleghi. La posizione del 31 marzo 2022 entra alla chiusura di quel giorno. Le candele dal 29 giugno 2026 non vengono lette.
- N = 1, alfa 0,05: soglia 0,05.

**Test secondario: replica delle sei esposizioni.** Periodo dal 1 gennaio 2021 al 28 giugno 2026, W = 2005 giorni. Cinque medie logaritmiche su 7L giorni (L = 1, 2, 4, 10, 20 settimane, cioè 7, 14, 28, 70, 140 giorni) e la combinazione EW, media a pesi uguali delle cinque: valori 0; 0,2; 0,4; 0,6; 0,8; 1. N = 6, alfa 0,05: soglia 0,0083. La variante di 7 giorni compare in entrambi i test, e il periodo del test principale è contenuto in quello secondario: i due test non sono indipendenti. Il verdetto che conta è quello del test principale.

**Costi.** 0,10% per lato più 0,05% di slippage per lato: 0,15% per unità di variazione di esposizione, quindi 0,30% per operazione intera. Per EW la variazione è in proporzione. La posizione è piatta prima del primo giorno del periodo e dopo il 28 giugno 2026: l'entrata iniziale e l'uscita finale pagano il costo, come nella replica di Liu e Tsyvinski, lettera (d).

**Statistica.** Rendimento netto medio giornaliero: M = (1/W) · [Σ e_d · r_d − c · T], con r_d = C_d / C_(d−1) − 1, c = 0,15% per lato, e T la somma dei cambi di esposizione sul periodo, entrata iniziale e uscita finale comprese. Rendimento netto totale: composto giorno per giorno, Π(1 + e_d · r_d − c · |Δe_d|), con l'uscita finale come fattore (1 − c · e) alla chiusura dell'ultimo giorno.

**Giudice (comune ai due test).** Rotazione circolare della serie delle esposizioni rispetto ai rendimenti, senza seme. Lo spostamento s sposta le esposizioni di s giorni in avanti, con ritorno all'inizio, e lascia i rendimenti. I costi della nulla sono quelli della serie circolare: una permanenza che attraversa la fine del periodo è una sola operazione. Si escludono gli spostamenti entro 30 giorni dallo zero in entrambe le direzioni. Decisione presa adesso, prima dei dati: spostare all'indietro farebbe guardare alla regola il futuro; in avanti la regola seguirebbe ancora la stessa tendenza. p = (numero di spostamenti con M_s ≥ M osservata, più 1) / (numero di spostamenti, più 1). Passa solo con p ≤ alfa/N e rendimento netto totale positivo.
- Test principale: W = 1550, spostamenti s = 31…1519, cioè 1489; p = (k+1)/1490. Passa con p ≤ 0,05 se k ≤ 73.
- Test secondario: W = 2005, spostamenti s = 31…1974, cioè 1944; p = (k+1)/1945. Passa con p ≤ 0,00833 se k ≤ 15.

**Costo di pareggio.** Costo per lato c al quale il vantaggio sul buy and hold è zero. Il vantaggio è M(regola) − M(buy and hold), con il buy and hold a esposizione 1 per tutto il periodo. È lineare in c: c* = Σ(e_d − 1) · r_d / (T − 2). Non definito se T − 2 ≤ 0 o se c* ≤ 0. Riportato per entrambi i test.

**XBTEUR.** Solo confronto, per entrambi i periodi: stessa regola, rendimento totale e buy and hold. Nessun p, nessun esito.

**Previsione.**
- Test principale: Wei e colleghi trovano predittività fuori campione, ma con significatività modesta (al 10%, secondo il committente). Nello studio di Detzel la media a 7 giorni cambia posizione circa 64 volte l'anno: a 0,15% per cambio, i costi pesano intorno ai 10 punti l'anno (64 × 0,15% ≈ 9,6%). L'esito è incerto. Se passa, ci aspettiamo più riduzione del drawdown che rendimento in più rispetto al buy and hold.
- Medie mobili e momentum hanno rendimenti correlati oltre 0,80, secondo Marshall, Nguyen e Visaltanachoti, come citati da Hudson e Urquhart e riportati dal committente (non verificato). Quindi Shen, Urquhart e Wang (2022) e Liu e Tsyvinski (2021) sono quasi la stessa ipotesi di questo test. Sappiamo già che la regola B ha funzionato su XBTUSD nel periodo 2021–2026, che contiene questo: un esito positivo qui conferma lo stesso fenomeno, non lo prova di nuovo.

**Criterio di successo.** Il test principale passa solo con p ≤ 0,05 e rendimento netto totale positivo. Il secondario passa solo con p ≤ 0,00833 e rendimento netto totale positivo, ma non decide il verdetto. Ogni altro esito non passa.

**Scostamenti dal metodo dichiarati.**
(a) Equazione 16 dello studio: S_t · r_t; qui S_t si applica a r_(t+1), l'unica versione eseguibile.
(b) Liquidità a rendimento zero; lo studio usa il tasso privo di rischio.
(c) Prezzi Kraken invece di CoinDesk. Il test principale è su 2022–2026, fuori dal campione dello studio (2010–2018) e da quello di Wei e colleghi.
(d) Esclusione entro 30 giorni dallo zero: scelta di questo test.
(e) Il vantaggio è misurato come differenza di rendimento netto medio giornaliero: la definizione dello studio potrebbe differire, quindi il confronto del costo di pareggio è indicativo.
(f) La regola di Wei e colleghi è letta come segno del rapporto logaritmico con la media a 7 giorni. Se il loro testo la definisce diversamente, il test principale va rivisto prima del commit.
(g) Nella nulla i costi sono quelli della serie circolare; nella serie osservata la posizione è piatta ai bordi.

**Report.** Per ogni test: giudice, con spostamenti e soglia; cambi di posizione all'anno; percentuale di giorni dentro; rendimento totale e annuo netti (annuo con 365,25 giorni); drawdown massimo della curva giornaliera; buy and hold nello stesso periodo; costo di pareggio per lato; statistica M in punti base al giorno; p ed esito; anno per anno (solo informativo). Per la replica, confronto con 1,38%, 2,12%, 3,13%, 5,75%, 6,85% (EW: non riportato). Curve giornaliere in `report/dati/`. Una riga per esposizione nel registro.

## Pre-registrazione: verifica all'indietro della media a 140 giorni (Detzel et al., L = 20 settimane), su dati mai usati dal laboratorio

Scritta il 18 ottobre 2026, prima di qualsiasi calcolo su questo periodo. Test singolo. L'ipotesi nasce dai dati 2021–2026 della replica di Detzel et al. (2021): la variante a 20 settimane è la più forte della replica (p 0,03753, sopra la soglia di 0,00833, quindi non passa). Qui si mette alla prova solo su un periodo che quei dati non contengono. Nel registro non ci sono altri test su dati 2018–2020.

**Periodo.** Dal 1 luglio 2018 al 31 dicembre 2020, giorni di calendario UTC: W = 915 giorni. Il periodo inizia dopo la fine dei dati di Detzel et al. (30 giugno 2018) e prima dei test del laboratorio (dal 1 gennaio 2021). La posizione del 30 giugno 2018 entra alla chiusura di quel giorno, come negli altri test: l'entrata iniziale paga il costo.

**Regola.** Identica alla replica. Per ogni giorno t, b_t è il logaritmo naturale della chiusura giornaliera di t (UTC). S_t = 1 se b_t supera la media di b sulle ultime 140 chiusure, oggi compresa; altrimenti S_t = 0. L'esposizione del giorno t+1 è S_t. Solo lunga; fuori dal mercato c'è liquidità, a rendimento zero.

**Universo.** XBTUSD più le coppie EUR di `laboratorio.json`, tranne XXBTZEUR (vedi scostamento (a)), con i nomi dell'archivio Kraken. Una coppia entra se ha almeno 140 chiusure giornaliere con data prima del 1 luglio 2018 e nessun giorno mancante dalla prima di quelle chiusure al 31 dicembre 2020. Le altre sono escluse, con il motivo, nel report. L'universo è fissato da questa regola prima del periodo: nessuna moneta entra o esce durante il test.

**Dati.** Candele giornaliere (1440 minuti) dall'archivio Kraken, in locale in `dati/archivio/`, non nel repository.

**Costi.** `strategie/rsi-base.json`: 0,10% per lato più 0,05% di slippage, cioè 0,15% per unità di variazione di esposizione, quindi 0,30% per operazione intera. La posizione è piatta prima e dopo il periodo: entrata iniziale e uscita finale pagano il costo.

**Portafoglio.** Pesi uguali: ogni giorno ciascuna delle N monete incluse pesa 1/N. Il rendimento netto del giorno d è la media delle monete di e_d · r_d − c · |Δe_d|, con r_d = C_d / C_(d−1) − 1 e c = 0,15%; il costo di uscita finale è addebitato all'ultimo giorno. Confronto: buy and hold a pesi uguali, con gli stessi costi di entrata e uscita.

**Giudice.** N = 1, alfa 0,05. Statistica: rendimento netto medio giornaliero del portafoglio. Nulla: rotazione circolare comune, cioè lo stesso spostamento s per tutte le monete, con ritorno all'inizio, lasciando i rendimenti; i costi della nulla sono quelli della serie circolare di ciascuna moneta. Si escludono gli spostamenti entro 30 giorni dallo zero in entrambe le direzioni: s = 31…884, cioè 854 spostamenti; p = (k+1)/855. Decisione presa adesso, prima dei dati: spostare all'indietro farebbe guardare alla regola il futuro; in avanti la regola seguirebbe ancora la stessa tendenza. Passa con p ≤ 0,05 se k ≤ 41, e con rendimento netto totale del portafoglio positivo.

**Previsione.** Incerta, probabilmente negativa. Nel campione di Detzel la media a 20 settimane ha Sharpe 1,99 contro 1,82 del buy and hold, non significativo (dato del committente, non verificato da noi). Wei e colleghi non la trovano robusta: l'abstract che abbiamo letto parla solo del rapporto logaritmico di breve periodo. Il periodo contiene il calo della seconda metà del 2018 e il crollo di marzo 2020, dove una media lunga dovrebbe aiutare: se passa, è più probabile che passi per quello.

**Criterio di successo.** Passa solo con p ≤ 0,05 e rendimento netto totale del portafoglio positivo. Ogni altro esito non passa.

**Scostamenti dal metodo dichiarati.**
(a) XBTEUR è escluso dall'universo, anche se è tra le coppie EUR di `laboratorio.json`: è lo stesso asset di XBTUSD e lo conterebbe due volte.
(b) Condizione aggiuntiva: nessun giorno mancante nel periodo, per il confronto del portafoglio.
(c) Liquidità a rendimento zero, come negli altri test.
(d) Esposizione sul giorno successivo al segnale, come nella replica (equazione 16 dello studio).
(e) Prezzi Kraken: il periodo è fuori dal campione di Detzel (CoinDesk, fino al 30 giugno 2018).
(f) Esclusione entro 30 giorni dallo zero: scelta di questo test.
(g) Il giudice è sul rendimento medio giornaliero del portafoglio, non sulla somma per operazione del test di conferma crypto.

**Report.** `report/detzel-140-indietro.md`: universo, con incluse ed escluse e il motivo; statistica, p ed esito; rendimento netto totale e annuo del portafoglio e del buy and hold; drawdown massimo; cambi di posizione all'anno; giorni dentro per moneta; anno per anno (solo informativo). Curve in `report/dati/detzel-140-indietro.json`. Una riga nel registro.

## Pre-registrazione: regola B su un universo senza senno di poi (monete scelte con dati fino al 31 dicembre 2020)

Scritta il 18 ottobre 2026, prima di qualsiasi calcolo sui rendimenti di questo test. Test nuovo e singolo. La regola B (Liu e Tsyvinski, quinto più alto, una settimana) non cambia in nessun punto.

**Perché.** Il test di conferma su altre crypto (commit 767e881) usava monete scelte nel 2026, quindi con il senno di poi. Qui l'universo è fissato con i dati fino al 31 dicembre 2020, cioè prima del periodo di test.

**Dati.** Archivio Kraken OHLCVT completo, in locale, non nel repository: 1758 file giornalieri (1440 minuti), di cui 649 coppie in EUR e 760 in USD. Tra queste, 192 coppie EUR/USD finiscono prima del 1 giugno 2026: l'elenco con la data dell'ultima candela è nel report. Colonne: data, apertura, massimo, minimo, chiusura, volume (in moneta base), numero di scambi.

**Universo.** Partenza: tutte le coppie spot dell'archivio quotate in EUR o in USD. Per ogni moneta, una sola coppia: EUR se esiste, altrimenti USD. Esclusi, con il motivo nel report:
1. Bitcoin (XBT/BTC), già testato a parte.
2. Stablecoin e token ancorati a una valuta: USDT, USDC, DAI, EURT, EURC, TUSD, PYUSD, USD1, USDG, GUSD, UST, USTC, USDE, USDS, FDUSD, BUSD, USDD, USDQ, USDR, EUROP, EURQ, EURR.
3. Coppie tra valute tradizionali (EURUSD, GBPUSD, AUDUSD, USDJPY e simili): non sono monete. Valute tradizionali: EUR, USD, GBP, CAD, AUD, CHF, JPY, AED.
4. Doppioni dello stesso asset: un simbolo con prefisso X o Z (uso storico di Kraken) è un doppione se esiste anche il simbolo senza prefisso; si tiene quello senza prefisso.

**Storia.** Almeno 104 settimane complete prima di lunedì 4 gennaio 2021: candele giornaliere presenti senza buchi per ogni giorno dal 7 gennaio 2019 al 3 gennaio 2021 (728 giorni). Chi non le ha è escluso.

**Liquidità.** Tra le monete rimaste, le 20 con il controvalore mediano giornaliero più alto nel 2020. Controvalore del giorno = volume × chiusura, in euro. Le coppie in USD si convertono con la chiusura di EURUSD dello stesso giorno (se manca, quella del giorno precedente). Si calcola la mediana sui giorni del 2020 con candela. Se le monete rimaste sono meno di 20, si tengono tutte.

**Periodo.** Dal lunedì 4 gennaio 2021 alla domenica 28 giugno 2026: 286 settimane, come nel test di conferma.

**Regola.** Identica a liu-b, per ogni moneta: rendimento della settimana domenica-domenica (UTC) sulle chiusure giornaliere. Segnale se il rendimento supera l'80° percentile R7 di tutte le settimane precedenti della stessa moneta, dal primo dato disponibile. Posizione dentro la settimana successiva, solo lunga. Entrata alla chiusura di domenica prima della settimana; uscita alla chiusura di domenica dell'ultima settimana tenuta.

**Settimana senza scambi.** Settimana senza candela della moneta alla domenica di chiusura: il segnale di quella domenica non apre nessuna posizione. Una posizione già aperta mantiene la sua settimana, e il suo rendimento si calcola fino alla prossima chiusura disponibile.

**Moneta tolta dal listino.** Se l'ultima candela della moneta cade prima del 28 giugno 2026, la posizione si chiude alla chiusura di quella candela, con i costi di uscita, e la quota resta in liquidità fino alla fine. Il rendimento dell'ultima settimana parziale è contato fino a quella chiusura. Il buy and hold fa lo stesso.

**Costi.** `strategie/rsi-base.json`: 0,10% per lato più 0,05% di slippage, cioè 0,30% per operazione.

**Portafoglio.** Pesi uguali e indipendenti: ogni moneta ha una quota 1/N, senza ribilanciamento. Confronto: buy and hold a pesi uguali, con le stesse uscite per le monete tolte.

**Giudice.** N = 1, alfa 0,05. Statistica: somma dei rendimenti netti per operazione su tutte le monete. Nulla: rotazione circolare comune, con lo stesso spostamento s per tutte le monete, senza seme. Una posizione che cade su settimane in cui la moneta non è più quotata non genera operazioni. Si escludono gli spostamenti entro 4 settimane dallo zero in entrambe le direzioni: s = 1…4 e s = 282…285. Restano s = 5…281: 277 spostamenti; p = (k+1)/278. Decisione presa adesso, prima dei dati: spostare all'indietro farebbe guardare alla regola il futuro; in avanti la regola seguirebbe ancora la stessa tendenza. Passa con p ≤ 0,05 se k ≤ 12, e con somma netta positiva.

**Previsione.** Un risultato più debole del test di conferma (+242% contro +144% del buy and hold, p 0,0105), perché quell'universo era scelto nel 2026. Se il vantaggio dipendeva dalla selezione, qui si riduce molto o sparisce; se regge, è la prova più solida che abbiamo.

**Criterio di successo.** Passa solo con p ≤ 0,05 e somma netta positiva. Ogni altro esito non passa.

**Scostamenti dal metodo dichiarati.**
(a) Test nuovo sull'universo 2020, non replica di Liu e Tsyvinski.
(b) Giudice: rotazione circolare comune con esclusione entro 4 settimane dallo zero, scelta di questo test.
(c) Percentile sul primo dato disponibile di ciascuna moneta, non sul campione dello studio.
(d) Liquidità in euro con EURUSD giornaliero dell'archivio.
(e) Regole per settimana senza scambi, moneta tolta dal listino e nulla con posizioni su settimane in cui la moneta non è quotata: definite sopra.
(f) Prezzi Kraken: l'archivio arriva al 30 settembre 2026, il test legge fino al 28 giugno 2026.

**Report.** `report/b-universo-2020.md`: universo con incluse, escluse e motivo, e le monete tolte dal listino con la data; portafoglio contro buy and hold a pesi uguali, con rendimento totale e annuo, drawdown massimo, p ed esito; per moneta, solo come informazione, operazioni, rendimento netto e buy and hold; anno per anno; confronto con il test di conferma. Curve in `report/dati/b-universo-2020.json`. Una riga nel registro.

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
| 2026-10-17 23:26 | liu-A | XBTUSD | cedbd36aca | 4 gen 2021 → 28 giu 2026 | 75 | rendimento 91,17% (buy and hold 79,28%) | 11,9 punti | -53,76% | Liu e Tsyvinski 2021, A: non passa; lordo medio 188,1 p.b.; settimane dentro 50,35%; p 3.66e-1 |
| 2026-10-17 23:26 | liu-B | XBTUSD | cedbd36aca | 4 gen 2021 → 28 giu 2026 | 26 | rendimento 183,30% (buy and hold 79,28%) | 104,0 punti | -21,52% | Liu e Tsyvinski 2021, B: passa; lordo medio 494,4 p.b.; settimane dentro 13,64%; p 1.60e-2 |
| 2026-10-17 23:26 | liu-C | XBTUSD | cedbd36aca | 4 gen 2021 → 28 giu 2026 | 22 | rendimento 132,44% (buy and hold 79,28%) | 53,2 punti | -40,62% | Liu e Tsyvinski 2021, C: non passa; lordo medio 667,9 p.b.; settimane dentro 31,12%; p 6.68e-2 |
| 2026-10-17 23:39 | liu-A-verifica | XBTUSD | 68521f86b2 | 4 gen 2021 → 28 giu 2026 | — | — | p 3.62e-1 (errore 1.52e-3) | — | verifica informativa, seme 20261020; verdetto pre-registrato invariato: A non passa |
| 2026-10-17 23:39 | liu-B-verifica | XBTUSD | 68521f86b2 | 4 gen 2021 → 28 giu 2026 | — | — | p 1.66e-2 (errore 4.04e-4) | — | verifica informativa, seme 20261020; verdetto pre-registrato invariato: B passa |
| 2026-10-17 23:39 | liu-C-verifica | XBTUSD | 68521f86b2 | 4 gen 2021 → 28 giu 2026 | — | — | p 6.50e-2 (errore 7.80e-4) | — | verifica informativa, seme 20261020; verdetto pre-registrato invariato: C non passa |
| 2026-10-17 23:48 | liu-b-informativa | XBTUSD | a39a95c93e15 | 6 lug 2026 → 2026-10-11 | 1 | rendimento 0,06% (buy and hold 40,29%) | -40,23 punti | -0,03% | verifica informativa, nessun giudizio: 1 operazioni, 6,67% di settimane dentro, 0 lacune; regola congelata |
| 2026-10-17 23:48 | liu-b-informativa | XBTEUR | a39a95c93e15 | 6 lug 2026 → 2026-10-11 | 1 | rendimento 0,95% (buy and hold 42,61%) | -41,66 punti | -0,03% | verifica informativa, nessun giudizio: 1 operazioni, 6,67% di settimane dentro, 0 lacune; regola congelata |
| 2026-10-18 00:10 | regola-B-altre-crypto | 7 monete | 513f491496 | 4 gen 2021 → 28 giu 2026 | 248 | portafoglio 241,58% (buy and hold 143,50%) | 98,08 punti | -30,20% | p 0,0105, passa; 7 monete incluse, 12 escluse |
| 2026-10-18 12:36 | detzel-principale-7g | XBTUSD | 9070615539 | 1 apr 2022 → 28 giu 2026 | 173 | rendimento -29,37% (buy and hold 30,29%) | -59,65 punti | -52,67% | Detzel et al. 2021, L = 1 settimana, principale: non passa; costo di pareggio non definito; statistica -0,76 p.b. al giorno; p 0,48523 |
| 2026-10-18 12:36 | detzel-replica-7g | XBTUSD | 9070615539 | 1 gen 2021 → 28 giu 2026 | 224 | rendimento -35,95% (buy and hold 104,81%) | -140,76 punti | -78,59% | Detzel et al. 2021, L = 1 settimana, replica: non passa; costo di pareggio non definito; statistica -0,21 p.b. al giorno; p 0,58663 |
| 2026-10-18 12:36 | detzel-replica-14g | XBTUSD | 9070615539 | 1 gen 2021 → 28 giu 2026 | 146 | rendimento 50,63% (buy and hold 104,81%) | -54,18 punti | -62,36% | Detzel et al. 2021, L = 2 settimane, replica: non passa; costo di pareggio non definito; statistica 4,09 p.b. al giorno; p 0,24113 |
| 2026-10-18 12:36 | detzel-replica-28g | XBTUSD | 9070615539 | 1 gen 2021 → 28 giu 2026 | 91 | rendimento 113,36% (buy and hold 104,81%) | 8,55 punti | -51,73% | Detzel et al. 2021, L = 4 settimane, replica: non passa; costo di pareggio non definito; statistica 5,84 p.b. al giorno; p 0,15424 |
| 2026-10-18 12:36 | detzel-replica-70g | XBTUSD | 9070615539 | 1 gen 2021 → 28 giu 2026 | 47 | rendimento 209,78% (buy and hold 104,81%) | 104,96 punti | -59,17% | Detzel et al. 2021, L = 10 settimane, replica: non passa; costo di pareggio 0,09%; statistica 7,90 p.b. al giorno; p 0,08329 |
| 2026-10-18 12:36 | detzel-replica-140g | XBTUSD | 9070615539 | 1 gen 2021 → 28 giu 2026 | 27 | rendimento 381,86% (buy and hold 104,81%) | 277,05 punti | -35,31% | Detzel et al. 2021, L = 20 settimane, replica: non passa; costo di pareggio 0,91%; statistica 10,14 p.b. al giorno; p 0,03753 |
| 2026-10-18 12:36 | detzel-replica-ew | XBTUSD | 9070615539 | 1 gen 2021 → 28 giu 2026 | — | rendimento 116,48% (buy and hold 104,81%) | 11,67 punti | -55,77% | Detzel et al. 2021, combinazione EW (media delle cinque), replica: non passa; costo di pareggio non definito; statistica 5,55 p.b. al giorno; p 0,09512 |
| 2026-10-18 16:10 | detzel-140-indietro | portafoglio (6 monete) | 83da4b6a3f | 1 lug 2018 → 31 dic 2020 | 83 | rendimento 79,45% (buy and hold 23,22%) | 56,22 punti | -45,73% | verifica all'indietro, media 140 giorni: non passa; statistica 9,72 p.b. al giorno; p 0,11930 |
