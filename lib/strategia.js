/**
 * lib/strategia.js — il valutatore.
 *
 * Una funzione pura: riceve una fotografia, restituisce una parola.
 *
 *   · nessuna lettura di file, nessuna chiamata di rete, nessuna scrittura
 *   · nessun orologio, nessun numero casuale
 *   · chiamata mille volte di fila con gli stessi argomenti, dà mille volte
 *     lo stesso risultato
 *
 * Non è pignoleria: è l'unica cosa che stai davvero mettendo alla prova. Se la
 * decisione dipende da qualcosa che non hai messo tu, hai costruito un
 * generatore di storie, non un banco di prova.
 *
 * ---------------------------------------------------------------------
 * L'ingresso è fatto di blocchi
 * ---------------------------------------------------------------------
 * Ogni blocco della configurazione (rsi, incrocioMedie, volume, tendenza,
 * rottura) è una condizione; un blocco a `null` è spento. Devono valere
 * **tutti i blocchi accesi**, sulla stessa candela chiusa.
 *
 * `condizioniIngresso()` è l'unico posto che calcola le condizioni:
 * `valutaIngresso()` la usa per decidere, la scheda Strategia la usa per i
 * pallini, il backtest per la diagnostica. Una sola implementazione, tre
 * lettori — così non può succedere che la scheda mostri una cosa e il ciclo
 * ne decida un'altra.
 */

import {
  chiusure,
  serieMediaEsponenziale,
  mediaEsponenziale,
  rsi,
  rapportoVolume,
  incrocioRecente,
  massimoPrecedente,
  variazioneSuPeriodo,
  sopra,
  macdUltimo,
  bandeUltime
} from "./indicatori.js";
import { bloccoAttivo } from "./blocchi.js";

/** Numero con la virgola, per i motivi che leggerai alle tre di notte. */
const n = (valore, decimali = 2) =>
  Number(valore).toFixed(decimali).replace(".", ",");

/**
 * Quante candele indietro si accetta l'incrocio. Se il parametro manca vale 1,
 * cioè «su questa candela»: è il comportamento storico, e una configurazione
 * vecchia non deve cambiare significato di nascosto solo perché il codice è
 * stato aggiornato.
 */
const finestraIncrocio = (incrocioMedie) =>
  Number.isInteger(incrocioMedie.entroCandele) && incrocioMedie.entroCandele >= 1
    ? incrocioMedie.entroCandele
    : 1;

/** «da questa candela» / «da 12 candele»: quanto è vecchia la rottura. */
const quandoHaIncrociato = (candeleFa) =>
  candeleFa === 0 ? "da questa candela" : `da ${candeleFa} candele`;

/**
 * Le chiavi delle condizioni attive, nell'ordine canonico. Sono le chiavi con
 * cui `condizioniIngresso()` risponde — il blocco `incrocioMedie` risponde
 * storicamente come `incrocio`.
 */
export function chiaviCondizioni(configurazione) {
  const ingresso = configurazione.ingresso;
  const chiavi = [];
  if (bloccoAttivo(ingresso.rsi)) chiavi.push("rsi");
  if (bloccoAttivo(ingresso.incrocioMedie)) chiavi.push("incrocio");
  if (bloccoAttivo(ingresso.volume)) chiavi.push("volume");
  if (bloccoAttivo(ingresso.tendenza)) chiavi.push("tendenza");
  if (bloccoAttivo(ingresso.rottura)) chiavi.push("rottura");
  if (bloccoAttivo(ingresso.sopraMedia)) chiavi.push("regime");
  if (bloccoAttivo(ingresso.crollo)) chiavi.push("crollo");
  if (bloccoAttivo(ingresso.macd)) chiavi.push("macd");
  if (bloccoAttivo(ingresso.bollinger)) chiavi.push("bollinger");
  return chiavi;
}

/**
 * Valuta la situazione e decide.
 *
 * @param {Array<{momento:number,apertura:number,massimo:number,minimo:number,chiusura:number,volume:number}>} candele
 *        solo candele CHIUSE, dalla più vecchia alla più recente
 * @param {object|null} posizione  la posizione aperta, o null
 * @param {object} configurazione  il contenuto di config/strategia.json,
 *        più `mercato` (il nome della coppia) aggiunto dal chiamante
 * @returns {{azione:string, mercato:string, prezzo:number, motivo:string, condizioni:object}|null}
 */
export function valuta(candele, posizione, configurazione) {
  if (!Array.isArray(candele) || candele.length === 0) return null;
  if (!configurazione || !configurazione.ingresso || !configurazione.uscita) return null;

  const ultima = candele[candele.length - 1];
  if (!ultima || !Number.isFinite(ultima.chiusura)) return null;

  return posizione
    ? valutaUscita(candele, posizione, configurazione)
    : valutaIngresso(candele, configurazione);
}

/* ------------------------------------------------------------------ */
/* uscita: se una posizione è aperta, si valutano solo le uscite       */
/* ------------------------------------------------------------------ */

/**
 * Il prezzo di mercato a cui, vendendo, si esce **esattamente in pari**.
 *
 * Non è il prezzo di ingresso: fra i due ci sono due commissioni e due volte
 * lo slippage. Si paga `prezzoIngresso × (1 + commissione)` per unità, e
 * vendendo a `P` di mercato si incassa `P × (1 − slippage) × (1 − commissione)`.
 * Uguagliando:
 *
 *     P = prezzoIngresso × (1 + c) / ((1 − s) · (1 − c))
 *
 * Con i costi configurati (0,40% + 0,05%) sono **+0,854%** sopra l'ingresso:
 * finché il prezzo non arriva lì, chiudere costa comunque soldi.
 */
export function prezzoDiPareggio(costi, prezzoIngresso) {
  const c = costi.commissionePercentoPerLato / 100;
  const s = costi.slippagePercento / 100;
  return (prezzoIngresso * (1 + c)) / ((1 - s) * (1 - c));
}

/**
 * Lo stop che si sposta al pareggio.
 *
 * L'idea: appena il prezzo ha toccato il punto in cui usciresti in pari, lo
 * stop si trasferisce lì. Da quel momento l'operazione non può più chiudere in
 * perdita — al massimo a zero. Prima di quel momento vale lo stop iniziale,
 * che va tenuto stretto perché è l'unica perdita davvero possibile.
 *
 * `marginePercento` alza il livello sopra il pareggio esatto: serve perché
 * l'uscita avviene alla CHIUSURA della candela e non al livello, quindi uno
 * stop appoggiato esattamente sullo zero può comunque chiudere sotto.
 *
 * Torna `null` finché il massimo raggiunto non ha toccato la soglia.
 */
function livelloPareggio(regola, costi, prezzoIngresso, massimoDaIngresso) {
  if (!regola || !Number.isFinite(massimoDaIngresso)) return null;

  const margine = 1 + (regola.marginePercento ?? 0) / 100;
  const livello = prezzoDiPareggio(costi, prezzoIngresso) * margine;

  /* Quando scatta la protezione è una cosa DIVERSA da dove la metti, e
     confonderle rovina la strategia.
     Misurato su marzo-maggio: spostando lo stop al pareggio appena il pareggio
     viene toccato, su 116 operazioni la presa di profitto non è scattata
     nemmeno una volta — il 53% chiudeva a zero e il 47% in perdita, attesa
     −0,79% per operazione. Il motivo è che a +0,95% dall'ingresso qualunque
     respiro del prezzo tocca lo stop, e con un'oscillazione tipica di ±1,1%
     nessuna posizione sopravvive abbastanza da svilupparsi.
     Con `attivaSopraPercento` si aspetta che il guadagno sia consistente prima
     di bloccare il rischio: la posizione ha spazio per respirare, e quando la
     protezione arriva è già in vantaggio vero. */
  const sogliaAttivazione = regola.attivaSopraPercento ?? 0;
  const attivaA = prezzoIngresso * (1 + sogliaAttivazione / 100);
  const soglia = Math.max(livello, attivaA);

  if (massimoDaIngresso < soglia) return null;

  return {
    livello,
    guadagnoPercento: ((livello - prezzoIngresso) / prezzoIngresso) * 100,
    attivatoA: soglia
  };
}

/**
 * Lo stop che insegue il massimo.
 *
 * Perché esiste: misurato su sei mesi di SOLEUR a 15 minuti, il 92,5% delle
 * uscite avveniva per tempo, e il 68% di quelle era passato in guadagno oltre
 * i costi prima di restituire tutto — 2 punti in media. La presa di profitto a
 * +8% veniva toccata lo 0,7% delle volte: era decorativa.
 *
 * Come funziona: finché il guadagno non supera `attivaSopraPercento` non
 * succede niente — sotto quella soglia il trailing chiuderebbe posizioni
 * appena nate al primo respiro del prezzo. Superata, lo stop si aggancia al
 * massimo toccato e lo segue a `scendeDiPercento` di distanza.
 *
 * Torna `null` se il blocco è spento o se la soglia non è ancora stata
 * raggiunta — cioè se non c'è nessun livello da confrontare.
 */
function livelloTrailing(regola, prezzoIngresso, massimoDaIngresso) {
  if (!regola || !Number.isFinite(massimoDaIngresso) || massimoDaIngresso <= 0) return null;

  const massimoPercento = ((massimoDaIngresso - prezzoIngresso) / prezzoIngresso) * 100;
  if (massimoPercento < regola.attivaSopraPercento) return null;

  return {
    livello: massimoDaIngresso * (1 - regola.scendeDiPercento / 100),
    massimoPercento
  };
}

function valutaUscita(candele, posizione, configurazione) {
  const ultima = candele[candele.length - 1];
  const { presaDiProfittoPercento, stopDiPerditaPercento, tempoMassimoCandele } = configurazione.uscita;

  const prezzoIngresso = posizione.prezzoIngresso;
  if (!Number.isFinite(prezzoIngresso) || prezzoIngresso <= 0) return null;

  const livelloProfitto = prezzoIngresso * (1 + presaDiProfittoPercento / 100);
  const livelloStop = prezzoIngresso * (1 - stopDiPerditaPercento / 100);

  /* Quante candele chiuse sono passate da quando siamo entrati.
     Se non sappiamo su quale candela siamo entrati, la risposta non è «tutte»:
     è «non lo so». Senza questa guardia il confronto `momento > null` sarebbe
     vero per ogni candela — in JavaScript null diventa 0 — e l'uscita per
     tempo scatterebbe subito, sulla prima valutazione. Mai decidere su dati
     parziali. */
  const candeleTrascorse = Number.isFinite(posizione.candelaIngresso)
    ? candele.filter((c) => c.momento > posizione.candelaIngresso).length
    : null;

  /* Il massimo toccato da quando siamo entrati: serve al trailing, e si
     ricava dalle candele che la funzione ha già — resta pura, non si tiene
     niente in memoria fra una chiamata e l'altra. */
  const candeleDaIngresso = Number.isFinite(posizione.candelaIngresso)
    ? candele.filter((c) => c.momento > posizione.candelaIngresso)
    : [];
  const massimoDaIngresso = candeleDaIngresso.length > 0
    ? Math.max(...candeleDaIngresso.map((c) => c.massimo).filter(Number.isFinite))
    : null;

  const trailing = livelloTrailing(configurazione.uscita.trailing, prezzoIngresso, massimoDaIngresso);
  /* L'uscita che segue la tendenza: si resta dentro finché la chiusura sta
     sopra la media, si esce quando la perde. Non è un livello fisso deciso
     all'ingresso — si muove col mercato, e per questo può tenere una posizione
     aperta per settimane se la salita continua.
     Serve perché tutte le altre uscite di questo file hanno un tetto: presa di
     profitto, tempo, o un ripiegamento in punti. Misurato, il risultato era
     stare fuori mercato oltre il 90% del tempo. */
  const mediaUscita = bloccoAttivo(configurazione.uscita.sottoMedia)
    ? mediaEsponenziale(chiusure(candele), configurazione.uscita.sottoMedia.periodi)
    : null;

  const pareggio = livelloPareggio(
    configurazione.uscita.pareggio, configurazione.costi, prezzoIngresso, massimoDaIngresso
  );

  /* Lo stop effettivo: quello iniziale finché il pareggio non è stato
     raggiunto, il pareggio da lì in poi. Si prende il più ALTO dei due —
     spostare la protezione più in basso non avrebbe senso. */
  const livelloStopEffettivo = pareggio ? Math.max(livelloStop, pareggio.livello) : livelloStop;

  const condizioni = {
    prezzoIngresso,
    chiusura: ultima.chiusura,
    massimoCandela: ultima.massimo,
    minimoCandela: ultima.minimo,
    livelloProfitto,
    livelloStop,
    massimoDaIngresso,
    livelloTrailing: trailing?.livello ?? null,
    trailingAttivo: Boolean(trailing),
    mediaUscita,
    livelloPareggio: pareggio?.livello ?? null,
    pareggioRaggiunto: Boolean(pareggio),
    livelloStopEffettivo,
    candeleTrascorse,
    variazionePercento: ((ultima.chiusura - prezzoIngresso) / prezzoIngresso) * 100
  };

  const toccatoStop = Number.isFinite(ultima.minimo) && ultima.minimo <= livelloStopEffettivo;
  const toccatoProfitto = Number.isFinite(ultima.massimo) && ultima.massimo >= livelloProfitto;

  // Se dentro la stessa candela sono stati toccati tutti e due i livelli non
  // sappiamo in che ordine è successo. Nel dubbio si sceglie l'ipotesi
  // peggiore per noi: lo stop. Chi sceglie sistematicamente l'interpretazione
  // favorevole ottiene un backtest bellissimo e una sorpresa, sempre nello
  // stesso verso.
  if (toccatoStop) {
    const perTutti = toccatoProfitto
      ? " Nella stessa candela era stato toccato anche il livello di presa di profitto: non sappiamo in che ordine, quindi conta lo stop."
      : "";

    /* Due stop diversi, e vanno distinti nello storico: quello iniziale è una
       perdita accettata, quello al pareggio è un'operazione che era andata in
       guadagno ed è tornata indietro senza costare niente. */
    const alPareggio = pareggio && livelloStopEffettivo === pareggio.livello;

    return {
      azione: "vendi",
      mercato: configurazione.mercato,
      prezzo: livelloStopEffettivo,
      motivo: alPareggio
        ? `Il prezzo era arrivato al punto di pareggio (${n(pareggio.livello)}, +${n(pareggio.guadagnoPercento)}% ` +
          `sull'ingresso: quanto serve per coprire le commissioni) ed è tornato indietro. ` +
          `Lo stop era già stato spostato lì, quindi si esce senza perdere.${perTutti}`
        : `Il minimo della candela (${n(ultima.minimo)}) ha toccato lo stop di perdita a ${n(livelloStopEffettivo)}, ` +
          `cioè −${n(stopDiPerditaPercento)}% sul prezzo di ingresso di ${n(prezzoIngresso)}. ` +
          `Il pareggio (${n(prezzoDiPareggio(configurazione.costi, prezzoIngresso))}) non era mai stato raggiunto.${perTutti}`,
      condizioni: { ...condizioni, scattata: alPareggio ? "pareggio" : "stop" }
    };
  }

  /* Il trailing viene PRIMA della presa di profitto per lo stesso motivo per
     cui lo stop viene prima di tutto: dentro la candela non sai in che ordine
     sono stati toccati i livelli, e il trailing sta più in basso — quindi è
     l'ipotesi peggiore, e nel dubbio si sceglie quella. */
  if (trailing && Number.isFinite(ultima.minimo) && ultima.minimo <= trailing.livello) {
    const guadagno = ((trailing.livello - prezzoIngresso) / prezzoIngresso) * 100;
    return {
      azione: "vendi",
      mercato: configurazione.mercato,
      prezzo: trailing.livello,
      motivo:
        `Il prezzo era salito fino a ${n(massimoDaIngresso)} (+${n(trailing.massimoPercento)}% sull'ingresso) ` +
        `ed è ripiegato di ${n(configurazione.uscita.trailing.scendeDiPercento)}%: esco a ${n(trailing.livello)}, ` +
        `tenendo ${guadagno >= 0 ? "+" : "−"}${n(Math.abs(guadagno))}% invece di aspettare il tempo massimo.`,
      condizioni: { ...condizioni, scattata: "trailing" }
    };
  }

  if (toccatoProfitto) {
    return {
      azione: "vendi",
      mercato: configurazione.mercato,
      prezzo: livelloProfitto,
      motivo:
        `Il massimo della candela (${n(ultima.massimo)}) ha toccato la presa di profitto a ${n(livelloProfitto)}, ` +
        `cioè +${n(presaDiProfittoPercento)}% sul prezzo di ingresso di ${n(prezzoIngresso)}.`,
      condizioni: { ...condizioni, scattata: "presaDiProfitto" }
    };
  }

  /* Dopo stop, trailing e presa di profitto: se la tendenza è finita si esce,
     qualunque sia il guadagno. È l'uscita che rende possibile tenere una
     posizione per settimane senza un tetto. */
  if (mediaUscita !== null && ultima.chiusura < mediaUscita) {
    const segno = condizioni.variazionePercento >= 0 ? "+" : "−";
    return {
      azione: "vendi",
      mercato: configurazione.mercato,
      prezzo: ultima.chiusura,
      motivo:
        `La chiusura (${n(ultima.chiusura)}) è scesa sotto la media a ${configurazione.uscita.sottoMedia.periodi} ` +
        `periodi (${n(mediaUscita)}): la tendenza che aveva motivato l'ingresso è finita. ` +
        `La posizione chiude a ${segno}${n(Math.abs(condizioni.variazionePercento))}%.`,
      condizioni: { ...condizioni, scattata: "tendenzaFinita" }
    };
  }

  if (
    Number.isInteger(tempoMassimoCandele) &&
    Number.isFinite(candeleTrascorse) &&
    candeleTrascorse >= tempoMassimoCandele
  ) {
    const segno = condizioni.variazionePercento >= 0 ? "+" : "−";
    return {
      azione: "vendi",
      mercato: configurazione.mercato,
      prezzo: ultima.chiusura,
      motivo:
        `Uscita per tempo: sono passate ${candeleTrascorse} candele dall'ingresso (il massimo è ${tempoMassimoCandele}) ` +
        `senza che scattasse né la presa di profitto né lo stop. ` +
        `Adesso la posizione è a ${segno}${n(Math.abs(condizioni.variazionePercento))}%: il capitale serve altrove.`,
      condizioni: { ...condizioni, scattata: "tempo" }
    };
  }

  return null;
}

/* ------------------------------------------------------------------ */
/* ingresso: tutti i blocchi accesi, sulla stessa candela chiusa       */
/* ------------------------------------------------------------------ */

/**
 * Le condizioni di ingresso, blocco per blocco, senza decidere niente.
 *
 * È l'unica implementazione: la usa `valutaIngresso()` per la decisione, la
 * scheda Strategia per i pallini, il backtest per la diagnostica. Restituisce
 * solo i blocchi attivi; `soddisfatta: null` vuol dire «l'indicatore non ha
 * ancora abbastanza candele», che non è né sì né no.
 */
export function condizioniIngresso(candele, configurazione) {
  if (!Array.isArray(candele) || candele.length === 0) return null;

  const ingresso = configurazione.ingresso;
  const prezzi = chiusure(candele);
  const ultima = candele[candele.length - 1];
  const esito = {};

  if (bloccoAttivo(ingresso.rsi)) {
    const regola = ingresso.rsi;
    const valore = rsi(prezzi, regola.periodi);
    esito.rsi = {
      valore,
      soglia: regola.sotto,
      soddisfatta: valore === null ? null : valore < regola.sotto
    };
  }

  if (bloccoAttivo(ingresso.incrocioMedie)) {
    const regola = ingresso.incrocioMedie;
    const finestra = finestraIncrocio(regola);
    const serieVeloce = serieMediaEsponenziale(prezzi, regola.veloce);
    const serieLenta = serieMediaEsponenziale(prezzi, regola.lenta);
    const mediaVeloce = serieVeloce.length ? serieVeloce[serieVeloce.length - 1] : null;
    const mediaLenta = serieLenta.length ? serieLenta[serieLenta.length - 1] : null;

    // due domande diverse: «cosa è successo nella finestra» (per mostrarlo) e
    // «è successo quello che chiede la regola» (per decidere)
    const incrocioQualsiasi = incrocioRecente(serieVeloce, serieLenta, finestra);
    const incrocioCercato = incrocioRecente(serieVeloce, serieLenta, finestra, regola.direzione);

    esito.incrocio = {
      veloce: mediaVeloce,
      lenta: mediaLenta,
      direzione: incrocioQualsiasi?.direzione ?? null,
      candeleFa: incrocioQualsiasi?.candeleFa ?? null,
      candeleFaCercata: incrocioCercato?.candeleFa ?? null,
      finestra,
      veloceSopraLenta: sopra(serieVeloce, serieLenta),
      soddisfatta: mediaVeloce === null || mediaLenta === null ? null : incrocioCercato !== null
    };
  }

  if (bloccoAttivo(ingresso.volume)) {
    const regola = ingresso.volume;
    const valore = rapportoVolume(candele, regola.periodi);
    esito.volume = {
      valore,
      soglia: regola.almeno,
      soddisfatta: valore === null ? null : valore >= regola.almeno
    };
  }

  if (bloccoAttivo(ingresso.tendenza)) {
    const regola = ingresso.tendenza;
    const serieVeloce = serieMediaEsponenziale(prezzi, regola.veloce);
    const serieLenta = serieMediaEsponenziale(prezzi, regola.lenta);
    const mediaVeloce = serieVeloce.length ? serieVeloce[serieVeloce.length - 1] : null;
    const mediaLenta = serieLenta.length ? serieLenta[serieLenta.length - 1] : null;

    // lo STATO delle medie, non l'evento: la veloce sta sopra, da quanto non
    // importa. È la condizione che l'incrocio, anche finestrato, non sa dire.
    esito.tendenza = {
      veloce: mediaVeloce,
      lenta: mediaLenta,
      soddisfatta: mediaVeloce === null || mediaLenta === null ? null : sopra(serieVeloce, serieLenta) === true
    };
  }

  if (bloccoAttivo(ingresso.rottura)) {
    const regola = ingresso.rottura;
    const massimo = massimoPrecedente(candele, regola.periodi);
    esito.rottura = {
      chiusura: ultima.chiusura,
      massimo,
      periodi: regola.periodi,
      soddisfatta: massimo === null ? null : ultima.chiusura > massimo
    };
  }

  if (bloccoAttivo(ingresso.sopraMedia)) {
    /* Il filtro di regime: non «le medie si incrociano» ma «il prezzo sta
       sopra la media lunga», cioè il mercato in cui ci troviamo è di quelli
       che salgono. Serve a non operare affatto durante i ribassi. */
    const regola = ingresso.sopraMedia;
    const media = mediaEsponenziale(prezzi, regola.periodi);
    esito.regime = {
      chiusura: ultima.chiusura,
      media,
      periodi: regola.periodi,
      soddisfatta: media === null ? null : ultima.chiusura > media
    };
  }

  if (bloccoAttivo(ingresso.crollo)) {
    const regola = ingresso.crollo;
    const variazione = variazioneSuPeriodo(candele, regola.periodi);
    esito.crollo = {
      variazione,
      soglia: -regola.almenoPercento,
      periodi: regola.periodi,
      soddisfatta: variazione === null ? null : variazione <= -regola.almenoPercento
    };
  }

  if (bloccoAttivo(ingresso.macd)) {
    const regola = ingresso.macd;
    const misura = macdUltimo(prezzi, regola.veloce, regola.lenta, regola.segnale);
    esito.macd = {
      macd: misura?.macd ?? null,
      segnale: misura?.segnale ?? null,
      // la linea MACD sopra la linea di segnale: il rialzo ha slancio, adesso
      soddisfatta: misura === null ? null : misura.macd > misura.segnale
    };
  }

  if (bloccoAttivo(ingresso.bollinger)) {
    const regola = ingresso.bollinger;
    const bande = bandeUltime(prezzi, regola.periodi, regola.deviazioni);
    const chiusura = ultima.chiusura;
    esito.bollinger = {
      chiusura,
      inferiore: bande?.inferiore ?? null,
      superiore: bande?.superiore ?? null,
      lato: regola.lato,
      soddisfatta: bande === null
        ? null
        : regola.lato === "sotto" ? chiusura < bande.inferiore : chiusura > bande.superiore
    };
  }

  return esito;
}

/** Il pezzo di motivo di ogni condizione soddisfatta, scritto per le tre di notte. */
function pezzoDiMotivo(chiave, dettaglio, ingresso) {
  switch (chiave) {
    case "rsi":
      return `RSI a ${n(dettaglio.valore, 1)} sotto la soglia di ${n(dettaglio.soglia, 0)}`;
    case "incrocio":
      return (
        `media ${ingresso.incrocioMedie.veloce} ha incrociato la ${ingresso.incrocioMedie.lenta} ` +
        `verso l'${ingresso.incrocioMedie.direzione} ${quandoHaIncrociato(dettaglio.candeleFaCercata)} ` +
        `(adesso ${n(dettaglio.veloce)} contro ${n(dettaglio.lenta)})`
      );
    case "volume":
      return `volume ${n(dettaglio.valore, 1)} volte la media delle ${ingresso.volume.periodi} candele precedenti`;
    case "tendenza":
      return (
        `media ${ingresso.tendenza.veloce} sopra la ${ingresso.tendenza.lenta} ` +
        `(${n(dettaglio.veloce)} contro ${n(dettaglio.lenta)})`
      );
    case "regime":
      return `prezzo a ${n(dettaglio.chiusura)} sopra la media a ${ingresso.sopraMedia.periodi} periodi (${n(dettaglio.media)})`;
    case "crollo":
      return (
        `prezzo giù del ${n(Math.abs(dettaglio.variazione))}% nelle ultime ${ingresso.crollo.periodi} candele ` +
        `(soglia: ${n(ingresso.crollo.almenoPercento)}%)`
      );
    case "rottura":
      return (
        `chiusura a ${n(dettaglio.chiusura)} sopra il massimo delle ${ingresso.rottura.periodi} ` +
        `candele precedenti (${n(dettaglio.massimo)})`
      );
    case "macd":
      return `MACD a ${n(dettaglio.macd)} sopra la linea di segnale a ${n(dettaglio.segnale)}`;
    case "bollinger":
      return dettaglio.lato === "sotto"
        ? `chiusura a ${n(dettaglio.chiusura)} sotto la banda inferiore di Bollinger (${n(dettaglio.inferiore)})`
        : `chiusura a ${n(dettaglio.chiusura)} sopra la banda superiore di Bollinger (${n(dettaglio.superiore)})`;
    default:
      return chiave; // non dovrebbe succedere: le chiavi le fa condizioniIngresso
  }
}

/**
 * La fotografia piatta delle condizioni, da scrivere dentro il segnale: è
 * quella che poi rileggi nello storico per capire perché una regola è
 * scattata. I nomi dei campi per i blocchi storici sono quelli di sempre.
 */
function appiattisci(co, ultima) {
  const piatte = { candela: ultima.momento, chiusura: ultima.chiusura };

  if (co.rsi) {
    piatte.rsi = co.rsi.valore;
    piatte.sogliaRsi = co.rsi.soglia;
  }
  if (co.incrocio) {
    piatte.mediaVeloce = co.incrocio.veloce;
    piatte.mediaLenta = co.incrocio.lenta;
    piatte.incrocio = co.incrocio.direzione;
    piatte.incrocioCandeleFa = co.incrocio.candeleFa;
    piatte.finestraIncrocio = co.incrocio.finestra;
    piatte.veloceSopraLenta = co.incrocio.veloceSopraLenta;
  }
  if (co.volume) {
    piatte.rapportoVolume = co.volume.valore;
    piatte.sogliaVolume = co.volume.soglia;
  }
  if (co.tendenza) {
    piatte.tendenzaVeloce = co.tendenza.veloce;
    piatte.tendenzaLenta = co.tendenza.lenta;
  }
  if (co.regime) {
    piatte.mediaRegime = co.regime.media;
  }
  if (co.crollo) {
    piatte.crollo = co.crollo.variazione;
    piatte.sogliaCrollo = co.crollo.soglia;
  }
  if (co.rottura) {
    piatte.massimoPrecedente = co.rottura.massimo;
    piatte.periodiRottura = co.rottura.periodi;
  }
  if (co.macd) {
    piatte.macd = co.macd.macd;
    piatte.segnaleMacd = co.macd.segnale;
  }
  if (co.bollinger) {
    piatte.bandaInferiore = co.bollinger.inferiore;
    piatte.bandaSuperiore = co.bollinger.superiore;
  }
  return piatte;
}

function valutaIngresso(candele, configurazione) {
  const co = condizioniIngresso(candele, configurazione);
  if (!co) return null;

  const chiavi = Object.keys(co);
  if (chiavi.length === 0) return null; // la validazione lo impedisce, ma mai fidarsi

  // Se un indicatore non sa ancora rispondere, non si decide niente.
  // Mai decidere su dati parziali: il primo segnale nascerebbe da un
  // indicatore che non esisteva ancora.
  if (chiavi.some((chiave) => co[chiave].soddisfatta === null)) return null;

  const ultima = candele[candele.length - 1];
  const condizioni = appiattisci(co, ultima);
  condizioni.soddisfatte = Object.fromEntries(chiavi.map((chiave) => [chiave, co[chiave].soddisfatta]));

  // Tutti i blocchi accesi, sulla stessa candela chiusa: l'ultima dell'elenco.
  if (!chiavi.every((chiave) => co[chiave].soddisfatta)) return null;

  const pezzi = chiavi.map((chiave) => pezzoDiMotivo(chiave, co[chiave], configurazione.ingresso));
  const motivo = pezzi.join(", ") + ".";

  return {
    azione: "compra",
    mercato: configurazione.mercato,
    prezzo: ultima.chiusura,
    motivo: motivo.charAt(0).toUpperCase() + motivo.slice(1),
    condizioni
  };
}
