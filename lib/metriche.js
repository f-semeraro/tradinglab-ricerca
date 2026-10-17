/**
 * lib/metriche.js — funzioni pure sullo storico e sulle istantanee.
 *
 * Una regola sopra tutte: **le percentuali si calcolano solo su quello che
 * esiste**. Se non ci sono operazioni chiuse si restituisce `null` e la scheda
 * scrive «nessuna operazione ancora». Uno zero è un'informazione falsa quando
 * in realtà non hai dati.
 *
 * Tre numeri qui dentro contano più del win rate:
 *   · il drawdown massimo — dice se la strategia è sopportabile, non solo se
 *     è redditizia. Si calcola sulle ISTANTANEE, che sono la vera curva del
 *     capitale: guardando solo le operazioni chiuse, le discese durante una
 *     posizione aperta non esisterebbero.
 *   · la percentuale di tempo esposto — se sei dentro il 90% del tempo hai un
 *     buy and hold con qualche interruzione e delle commissioni in più.
 *   · i segnali rifiutati e scaduti — l'unica metrica che misura te.
 */

import { giornoLocale } from "./tempo.js";
import { valoreBenchmark, variazioneBenchmark, variazioneMercatoNelPeriodo } from "./benchmark.js";
import { valorePortafoglio } from "./portafoglio.js";

const media = (valori) => (valori.length === 0 ? null : valori.reduce((s, v) => s + v, 0) / valori.length);

/**
 * La discesa percentuale più profonda da un massimo del capitale al minimo
 * successivo, lungo la serie delle istantanee.
 *
 * @param {Array<{portafoglio:number}>} istantanee
 * @returns {number|null} un numero <= 0, oppure null se non c'è abbastanza serie
 */
export function drawdownMassimo(istantanee) {
  if (!Array.isArray(istantanee) || istantanee.length === 0) return null;

  const valori = istantanee
    .map((i) => i.portafoglio)
    .filter((v) => Number.isFinite(v) && v > 0);
  if (valori.length < 2) return null;

  let picco = valori[0];
  let peggiore = 0;
  for (const valore of valori) {
    if (valore > picco) picco = valore;
    const discesa = ((valore - picco) / picco) * 100;
    if (discesa < peggiore) peggiore = discesa;
  }
  return peggiore;
}

/** L'etichetta di affidabilità del campione: la riga che ti impedisce di concludere troppo presto. */
export function affidabilitaCampione(operazioniChiuse) {
  if (operazioniChiuse < 30) {
    return { livello: "insufficiente", testo: "Campione troppo piccolo per concludere qualcosa" };
  }
  if (operazioniChiuse <= 100) {
    return { livello: "indicativo", testo: "Indicativo, non conclusivo" };
  }
  return { livello: "ragionevole", testo: "Campione ragionevole" };
}

/** Il risultato realizzato per giornata, nel fuso dell'utente. */
export function performanceGiornaliera(operazioni, fuso) {
  const perGiorno = new Map();
  for (const operazione of operazioni) {
    // il giorno si decide nel fuso dell'utente: usando UTC, un'operazione
    // chiusa alle 23:40 di Roma finirebbe nella barra di domani
    const giorno = giornoLocale(operazione.momentoUscita, fuso);
    perGiorno.set(giorno, (perGiorno.get(giorno) ?? 0) + operazione.risultatoEuro);
  }
  return [...perGiorno.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([giorno, valore]) => ({ giorno, valore }));
}

/**
 * Tutte le metriche, in un colpo solo.
 *
 * @param {object} stato
 * @param {object} opzioni
 * @param {number|null} opzioni.prezzoMercato   prezzo di adesso del mercato operato
 * @param {number|null} opzioni.prezzoBenchmark prezzo di adesso del benchmark generale
 * @param {number} opzioni.adessoSecondi
 */
export function calcolaMetriche(stato, { prezzoMercato = null, prezzoBenchmark = null, adessoSecondi = null } = {}) {
  const capitaleIniziale = stato.configurazione.capitaleIniziale;
  const fuso = stato.configurazione.fusoOrario;
  const operazioni = Array.isArray(stato.operazioni) ? stato.operazioni : [];
  const istantanee = Array.isArray(stato.istantanee) ? stato.istantanee : [];
  const adesso = adessoSecondi ?? (istantanee.at(-1)?.momento ?? null);

  /* --- capitale --- */
  const valoreOra = valorePortafoglio(stato, prezzoMercato);
  const capitaleAttuale = valoreOra ?? istantanee.at(-1)?.portafoglio ?? stato.capitale;
  const variazionePercento = Number.isFinite(capitaleAttuale)
    ? ((capitaleAttuale - capitaleIniziale) / capitaleIniziale) * 100
    : null;

  /* --- benchmark --- */
  const benchmarkMercato = {
    valore: valoreBenchmark(stato, "mercato", prezzoMercato),
    variazione: variazioneBenchmark(stato, "mercato", prezzoMercato),
    coppia: stato.benchmark?.mercato?.coppia ?? null
  };
  const benchmarkBitcoin = {
    valore: valoreBenchmark(stato, "bitcoin", prezzoBenchmark),
    variazione: variazioneBenchmark(stato, "bitcoin", prezzoBenchmark),
    coppia: stato.benchmark?.bitcoin?.coppia ?? null
  };

  const differenzaDalMercato =
    variazionePercento !== null && benchmarkMercato.variazione !== null
      ? variazionePercento - benchmarkMercato.variazione
      : null;
  const differenzaDaBitcoin =
    variazionePercento !== null && benchmarkBitcoin.variazione !== null
      ? variazionePercento - benchmarkBitcoin.variazione
      : null;

  /* --- operazioni --- */
  const chiuse = operazioni.length;
  const vincenti = operazioni.filter((o) => o.risultatoEuro > 0);
  const perdenti = operazioni.filter((o) => o.risultatoEuro < 0);

  const percentuali = operazioni.map((o) => o.risultatoPercento);
  const winRate = chiuse === 0 ? null : (vincenti.length / chiuse) * 100;

  /* --- tempo esposto --- */
  const inizio = stato.benchmark?.mercato?.momento ?? istantanee[0]?.momento ?? null;
  const secondiTotali = inizio !== null && adesso !== null ? Math.max(0, adesso - inizio) : null;
  let secondiEsposto = operazioni.reduce((somma, o) => somma + (o.durataSecondi ?? 0), 0);
  if (stato.posizione && adesso !== null) {
    secondiEsposto += Math.max(0, adesso - stato.posizione.momentoIngresso);
  }
  const tempoEspostoPercento =
    secondiTotali && secondiTotali > 0 ? Math.min(100, (secondiEsposto / secondiTotali) * 100) : null;

  /* --- segnali --- */
  const storicoSegnali = Array.isArray(stato.segnali?.storico) ? stato.segnali.storico : [];
  const contaSegnali = (stato_) => storicoSegnali.filter((s) => s.stato === stato_).length;

  /* --- giorni di funzionamento --- */
  const giorniFunzionamento =
    secondiTotali === null ? null : Math.max(1, Math.round(secondiTotali / 86400));

  return {
    capitaleIniziale,
    capitaleAttuale,
    variazionePercento,
    obiettivo: stato.configurazione.obiettivo ?? null,

    benchmark: {
      mercato: benchmarkMercato,
      bitcoin: benchmarkBitcoin,
      differenzaDalMercato,
      differenzaDaBitcoin,
      variazioneMercatoPura: variazioneMercatoNelPeriodo(stato, "mercato", prezzoMercato)
    },

    operazioni: {
      chiuse,
      vincenti: vincenti.length,
      perdenti: perdenti.length,
      winRate,
      miglior: chiuse === 0 ? null : Math.max(...percentuali),
      peggior: chiuse === 0 ? null : Math.min(...percentuali),
      risultatoMedioVincenti: media(vincenti.map((o) => o.risultatoPercento)),
      risultatoMedioPerdenti: media(perdenti.map((o) => o.risultatoPercento)),
      risultatoTotaleEuro: operazioni.reduce((s, o) => s + o.risultatoEuro, 0),
      commissioniTotali: operazioni.reduce((s, o) => s + (o.commissioniTotali ?? 0), 0),
      durataMediaSecondi: media(operazioni.map((o) => o.durataSecondi ?? 0))
    },

    drawdownMassimo: drawdownMassimo(istantanee),
    tempoEspostoPercento,
    giorniFunzionamento,
    affidabilita: affidabilitaCampione(chiuse),

    segnali: {
      confermati: contaSegnali("confermato"),
      rifiutati: contaSegnali("rifiutato"),
      scaduti: contaSegnali("scaduto"),
      inAttesa: stato.segnali?.inAttesa ? 1 : 0
    },

    performanceGiornaliera: performanceGiornaliera(operazioni, fuso)
  };
}
