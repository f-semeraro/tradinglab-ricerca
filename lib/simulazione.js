/**
 * lib/simulazione.js — il portafoglio simulato, candela per candela.
 *
 * Nessuna lettura di file, nessun orologio, nessuna rete: riceve uno stato, lo
 * fa avanzare, e lo restituisce. Chi chiama decide da dove partire e quando
 * salvare. Questo modulo decide solo che cosa succede a ogni candela.
 *
 * Segue lo stesso schema di eseguiBacktest() in lib/backtest.js del progetto
 * principale. La corrispondenza non si dà per scontata: il README ne descrive
 * il controllo.
 *
 * Due regole che reggono il laboratorio:
 *   · lo stato porta con sé tutto ciò che serve a ripartire: se lo salvi,
 *     lo rileggi e continui, il risultato è identico a un'unica corsa;
 *   · ogni candela elaborata lascia un'istantanea, e l'ultima istantanea dice
 *     qual è l'ultima candela elaborata. È la verità: il cursore su disco è
 *     solo il segno visibile di «fatto».
 */

import { valuta } from "./strategia.js";
import { controlloRischio } from "./rischio.js";
import { apriPosizione, chiudiPosizione, valorePortafoglio, EsecuzioneImpossibile } from "./portafoglio.js";
import { registraRiferimento, valoreBenchmark } from "./benchmark.js";

/** Lo stato di un portafoglio appena nato. */
export function nuovoStato({ capitaleIniziale, mercato, intervalloMinuti, fusoOrario }) {
  return {
    configurazione: { capitaleIniziale, mercato, intervalloCandele: intervalloMinuti, fusoOrario },
    capitale: capitaleIniziale,
    posizione: null,
    operazioni: [],
    istantanee: [],
    benchmark: {},
    blocchi: [],
    lacune: []
  };
}

/**
 * Un segnale diventa un'operazione. È la stessa logica di applicaSegnale() in
 * lib/esecuzione.js del progetto principale; lì sta accanto allo store su disco,
 * qui no. Se ne cambi una, cambia anche l'altra.
 */
function eseguiSegnale(stato, { segnale, prezzo, strategia, momento, candela }) {
  if (segnale.azione === "compra") {
    apriPosizione(stato, { prezzoMercato: prezzo, strategia, segnale, momento, candela });
  } else {
    chiudiPosizione(stato, { prezzoMercato: prezzo, strategia, segnale, momento });
  }
}

/** L'apertura dell'ultima candela elaborata, o null se non ce n'è nessuna. */
export function ultimaCandelaElaborata(stato) {
  const istantanee = stato.istantanee;
  return istantanee.length > 0 ? istantanee[istantanee.length - 1].candela : null;
}

/**
 * Da dove riprendere, dato lo stato e le candele chiuse dell'exchange.
 *
 * Restituisce `{ da, a, lacuna }`: gli indici di `candele` da elaborare, con
 * `a` escluso, e — se mancano candele fra l'ultima elaborata e la prima nuova —
 * il buco, da dichiarare e non da inventare.
 *
 * `primaValutabile` è il primo indice con storia sufficiente per gli
 * indicatori: nessuna candela prima di lui viene giudicata.
 */
export function pianoDelGiro(stato, candele, primaValutabile, intervalloMinuti) {
  const durata = intervalloMinuti * 60;
  const ultima = ultimaCandelaElaborata(stato);

  if (ultima === null) {
    return { da: primaValutabile, a: candele.length, lacuna: null };
  }

  const primaNuova = candele.findIndex((c) => c.momento > ultima);
  if (primaNuova === -1) {
    return { da: candele.length, a: candele.length, lacuna: null };
  }

  const attesa = ultima + durata;
  const momentoPrimaNuova = candele[primaNuova].momento;
  const lacuna = momentoPrimaNuova > attesa
    ? {
        daMomento: attesa,
        aMomento: momentoPrimaNuova - durata,
        candele: Math.round((momentoPrimaNuova - attesa) / durata)
      }
    : null;

  return { da: Math.max(primaNuova, primaValutabile), a: candele.length, lacuna };
}

/**
 * Fa avanzare lo stato sulle candele `candele[da..a)`, in ordine.
 *
 * Modifica lo stato che riceve e lo restituisce. A ogni candela:
 *   1. se non c'è una posizione e la strategia compra, controlla il rischio e
 *      apre (o registra perché no);
 *   2. se c'è una posizione e la strategia vende, chiude;
 *   3. lascia un'istantanea.
 *
 * Le esecuzioni avvengono al prezzo di chiusura della candela: il laboratorio
 * non vede il ticker in tempo reale, quindi usa il dato più recente che ha.
 */
export function avanza(stato, candele, da, a, strategia) {
  const { mercato, intervalloCandele } = stato.configurazione;
  const durata = intervalloCandele * 60;
  const configurazione = { ...strategia, mercato };

  for (let i = da; i < a; i++) {
    const candela = candele[i];
    const momento = candela.momento + durata;
    const prezzo = candela.chiusura;

    // il benchmark si fissa alla prima candela elaborata, e poi non si tocca più
    if (!stato.benchmark.mercato) {
      registraRiferimento(stato, { ruolo: "mercato", coppia: mercato, prezzo, strategia, momento });
    }

    const fetta = candele.slice(0, i + 1);
    const segnale = valuta(fetta, stato.posizione, configurazione);

    if (segnale) {
      const blocco = controlloRischio(segnale, stato, strategia, momento);
      if (blocco) {
        stato.blocchi.push({ momento, candela: candela.momento, azione: segnale.azione, motivo: blocco });
      } else {
        try {
          eseguiSegnale(stato, {
            segnale: { ...segnale, id: `bt-${candela.momento}` },
            prezzo,
            strategia,
            momento,
            candela: candela.momento
          });
        } catch (errore) {
          // il portafoglio che dice di no non è un guasto: si registra e si va avanti
          if (!(errore instanceof EsecuzioneImpossibile)) throw errore;
          stato.blocchi.push({ momento, candela: candela.momento, azione: segnale.azione, motivo: errore.message });
        }
      }
    }

    // un'istantanea per ogni candela, sempre: è lei a dire fino a dove si è arrivati
    stato.istantanee.push({
      momento,
      candela: candela.momento,
      portafoglio: valorePortafoglio(stato, prezzo),
      mercato: valoreBenchmark(stato, "mercato", prezzo),
      prezzo
    });
  }

  return stato;
}
