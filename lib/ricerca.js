/**
 * lib/ricerca.js — il generatore di strategie: campionare, valutare, giudicare.
 *
 * Tutto qui è puro: niente file, niente orologio, niente rete. Il seme entra da
 * fuori, quindi a parità di seme e di dati le stesse strategie vengono generate
 * e valutate sempre allo stesso modo.
 *
 * Tre regole che tengono il generatore onesto:
 *   · ogni combinazione provata viene contata, anche quelle perdenti: la soglia
 *     di giudizio dipende da quante ne sono state provate, non da quante ne
 *     sono sembrate buone;
 *   · la valutazione non vede il futuro: un intervallo di date chiude la
 *     finestra, e le candele dopo non influenzano niente (c'è un test che lo
 *     verifica);
 *   · un candidato passa solo se batte il «comprato e basta» sulla maggioranza
 *     delle coppie, con una media statisticamente lontana da zero, al netto
 *     della soglia che tiene conto di tutte le prove.
 */

import { createHash } from "node:crypto";

import { nuovoStato, avanza } from "./simulazione.js";
import { calcolaMetriche } from "./metriche.js";
import { candeleNecessarie, problemiStrategia } from "./configurazione.js";

/* ------------------------------------------------------------------ */
/* numeri casuali con seme: stessa sequenza, stesso risultato          */
/* ------------------------------------------------------------------ */

/** Un generatore pseudocasuale (mulberry32): dato un seme, dà sempre la stessa sequenza in [0, 1). */
export function generatore(seme) {
  let stato = seme >>> 0;
  return function prossimo() {
    stato = (stato + 0x6d2b79f5) >>> 0;
    let t = stato;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------------ */
/* lo spazio in cui si cerca                                           */
/* ------------------------------------------------------------------ */

/**
 * I valori possibili di ogni parametro. Sono pochi di proposito: ogni valore in
 * più moltiplica il numero di prove, e con esso il rischio di trovare rumore.
 */
export const SPAZIO = {
  rsi: { periodi: [7, 14, 21], sotto: [20, 25, 30, 35, 40] },
  incrocioMedie: {
    veloce: [5, 9, 12, 20], lenta: [21, 26, 50], direzione: ["alto", "basso"], entroCandele: [1, 3, 5, 10]
  },
  volume: { periodi: [5, 10, 20], almeno: [1.1, 1.25, 1.5] },
  tendenza: { veloce: [5, 9, 12, 20, 50], lenta: [21, 26, 50, 100, 200] },
  rottura: { periodi: [5, 10, 20, 30] },
  crollo: { periodi: [2, 3, 5, 10], almenoPercento: [2, 3, 5, 8] },
  sopraMedia: { periodi: [50, 100, 200] },
  macd: { veloce: [8, 12], lenta: [21, 26], segnale: [5, 9] },
  bollinger: { periodi: [10, 20, 30], deviazioni: [1.5, 2, 2.5], lato: ["sotto", "sopra"] }
};

/** Le uscite: presa di profitto, stop e tempo massimo, come nella configurazione vera. */
export const SPAZIO_USCITA = {
  presaDiProfittoPercento: [4, 6, 8, 12, 16],
  stopDiPerditaPercento: [2, 3, 4, 6],
  tempoMassimoCandele: [10, 20, 40, 80]
};

/** Coppie veloce/lenta: la veloce dev'essere più corta della lenta, altrimenti non è un incrocio. */
const COPPIE_MEDIE = {
  incrocioMedie: ["veloce", "lenta"],
  tendenza: ["veloce", "lenta"],
  macd: ["veloce", "lenta"]
};

/* ------------------------------------------------------------------ */
/* campionare una strategia                                            */
/* ------------------------------------------------------------------ */

const sceglie = (rng, valori) => valori[Math.floor(rng() * valori.length)];

/** Mescola un elenco con il generatore dato (Fisher-Yates): deterministico. */
function mescola(rng, elementi) {
  const copia = [...elementi];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

/**
 * Una strategia a caso: da uno a tre blocchi di ingresso, e le uscite. Costi e
 * rischio vengono dal modello passato (quelli veri, non si ritoccano per
 * vincere).
 *
 * Può restituire una strategia non valida (una coppia veloce/lenta sbagliata):
 * il chiamante la scarta con `problemiStrategia()`, come farebbe per un file.
 */
export function campionaStrategia(rng, { costi, rischio }) {
  const quanti = 1 + Math.floor(rng() * 3);
  const blocchi = mescola(rng, Object.keys(SPAZIO)).slice(0, quanti);

  const ingresso = {};
  for (const nome of blocchi) {
    const campi = {};
    for (const [campo, valori] of Object.entries(SPAZIO[nome])) {
      campi[campo] = sceglie(rng, valori);
    }
    ingresso[nome] = campi;
  }

  // le coppie veloce/lenta: la lenta si prende fra quelle più lunghe della veloce
  for (const [nome, [veloce, lenta]] of Object.entries(COPPIE_MEDIE)) {
    if (!ingresso[nome]) continue;
    const campi = ingresso[nome];
    const piuLunghe = SPAZIO[nome][lenta].filter((v) => v > campi[veloce]);
    campi[lenta] = piuLunghe.length > 0 ? sceglie(rng, piuLunghe) : campi[lenta];
  }

  const uscita = {};
  for (const [campo, valori] of Object.entries(SPAZIO_USCITA)) {
    uscita[campo] = sceglie(rng, valori);
  }

  return {
    nome: null, // lo mette il chiamante quando la strategia viene accettata
    ingresso,
    uscita,
    rischio: { ...rischio },
    costi: { ...costi }
  };
}

/* ------------------------------------------------------------------ */
/* identità: la stessa strategia ha sempre lo stesso nome              */
/* ------------------------------------------------------------------ */

/** La JSON con le chiavi in ordine, così lo stesso oggetto dà sempre lo stesso testo. */
function canonico(valore) {
  if (Array.isArray(valore)) return valore.map(canonico);
  if (valore && typeof valore === "object") {
    return Object.fromEntries(Object.keys(valore).sort().map((k) => [k, canonico(valore[k])]));
  }
  return valore;
}

/** Un'impronta corta e stabile della configurazione: due strategie uguali hanno la stessa impronta. */
export function impronta(strategia) {
  const { nome, ...senzaNome } = strategia;
  return createHash("sha256").update(JSON.stringify(canonico(senzaNome))).digest("hex").slice(0, 10);
}

/* ------------------------------------------------------------------ */
/* valutare: quanto batte il «comprato e basta», per coppia            */
/* ------------------------------------------------------------------ */

/**
 * Fa girare la strategia su ciascuna coppia, solo sulle candele con apertura
 * in `[da, a)`. Le candele precedenti servono a riscaldare gli indicatori, ma
 * nessuna candela dopo `a` viene mai guardata.
 *
 * @param {object} strategia
 * @param {Object<string, Array>} serie  candele complete per coppia, in ordine
 * @param {object} finestra  { da, a, intervallo } in secondi di apertura; `a` escluso
 * @param {object} base      { capitaleIniziale, mercato, intervalloMinuti, fusoOrario }
 * @returns {Array<{coppia, strategia, comprato, eccesso, operazioni, drawdown}>}
 */
export function valutaSuCoppie(strategia, serie, finestra, base) {
  const durata = finestra.intervallo * 60;
  const primaValutabile = candeleNecessarie(strategia) - 1;
  const risultati = [];

  for (const [coppia, candele] of Object.entries(serie)) {
    const inizio = candele.findIndex((c) => c.momento >= finestra.da);
    if (inizio === -1) continue;
    let fine = candele.length;
    for (let i = inizio; i < candele.length; i++) {
      if (candele[i].momento >= finestra.a) { fine = i; break; }
    }

    const da = Math.max(inizio, primaValutabile);
    if (da >= fine) continue;

    const stato = nuovoStato({ ...base, mercato: coppia, intervalloMinuti: finestra.intervallo });
    avanza(stato, candele, da, fine, strategia);

    const ultimo = stato.istantanee.at(-1);
    const m = calcolaMetriche(stato, {
      prezzoMercato: ultimo.prezzo,
      adessoSecondi: ultimo.momento
    });

    // le operazioni chiuse, come indici dentro la finestra decisionale [da, fine): per il giudice a permutazione
    const indice = new Map(candele.map((c, i) => [c.momento, i]));
    const operazioniIdx = [];
    for (const o of stato.operazioni) {
      const inizioAssoluto = indice.get(o.momentoIngresso - durata);
      const fineAssoluto = indice.get(o.momentoUscita - durata);
      if (inizioAssoluto === undefined || fineAssoluto === undefined) continue;
      operazioniIdx.push({ inizio: inizioAssoluto - da, fine: fineAssoluto - da });
    }

    risultati.push({
      coppia,
      strategia: m.variazionePercento,
      comprato: m.benchmark.mercato.variazione,
      eccesso: m.benchmark.differenzaDalMercato,
      operazioni: m.operazioni.chiuse,
      drawdown: m.drawdownMassimo,
      gruppo: {
        prezzi: candele.slice(da, fine).map((c) => c.chiusura),
        W: fine - da,
        operazioni: operazioniIdx
      }
    });
  }

  return risultati;
}

/* ------------------------------------------------------------------ */
/* giudicare: la soglia cresce con il numero di prove                  */
/* ------------------------------------------------------------------ */

/**
 * La soglia del t (la «distanza da zero» che serve) per dire che un risultato
 * non è capitato per caso, dato che sono state provate N strategie.
 *
 * È la correzione di Bonferroni nella sua forma conservativa:
 * sqrt(2 ln(2N/alfa)). Con N = 10 e alfa = 5% vale circa 3,46; con N = 100
 * circa 4,07; con N = 1000 circa 4,60. Più prove hai fatto, più il risultato
 * deve essere netto.
 */
export function sogliaT(N, alfa = 0.05) {
  return Math.sqrt(2 * Math.log((2 * N) / alfa));
}

/** Media, deviazione standard campionaria e t di un insieme di eccessi (punti percentuali). */
export function statistiche(eccessi) {
  const M = eccessi.length;
  if (M === 0) return { media: null, sd: null, t: null, M: 0 };
  const media = eccessi.reduce((s, e) => s + e, 0) / M;
  if (M === 1) return { media, sd: null, t: null, M };
  const varianza = eccessi.reduce((s, e) => s + (e - media) ** 2, 0) / (M - 1);
  const sd = Math.sqrt(varianza);
  const t = sd === 0 ? (media === 0 ? 0 : Math.sign(media) * Infinity) : media / (sd / Math.sqrt(M));
  return { media, sd, t, M };
}

/**
 * Il giudizio finale su una strategia verificata. Passa solo se tutte e tre le
 * condizioni valgono: operazioni sufficienti, maggioranza di coppie che batte il
 * «comprato e basta», e un t sopra la soglia che tiene conto di N prove.
 *
 * @param {Array} risultati  l'uscita di valutaSuCoppie
 * @param {object} opzioni   { N, alfa, quotaMinima, minimoOperazioni }
 */
export function giudica(risultati, { N, alfa = 0.05, quotaMinima = 2 / 3, minimoOperazioni = 10, correlazione = null }) {
  const eccessi = risultati.map((r) => r.eccesso);
  const { media, sd, M } = statistiche(eccessi);

  // il t si calcola sulle coppie effettive, non su quelle nominali: vedi coppieEffettive()
  const Meff = M === 0 ? 0 : coppieEffettive(M, correlazione);
  let t = null;
  if (sd !== null && Meff > 0) {
    if (sd === 0) t = media === 0 ? 0 : Math.sign(media) * Infinity;
    else t = media / (sd / Math.sqrt(Meff));
  }

  const quota = M === 0 ? 0 : eccessi.filter((e) => e > 0).length / M;
  const operazioni = risultati.reduce((s, r) => s + r.operazioni, 0);
  const soglia = sogliaT(N, alfa);

  const motivi = [];
  if (operazioni < minimoOperazioni) {
    motivi.push(`operazioni ${operazioni}, servono almeno ${minimoOperazioni}`);
  }
  if (quota < quotaMinima) {
    motivi.push(`batte il «comprato e basta» su ${Math.round(quota * 100)}% delle coppie, servono almeno ${Math.round(quotaMinima * 100)}%`);
  }
  if (!(t > soglia)) {
    motivi.push(`t ${t === null ? "non calcolabile" : t.toFixed(2).replace(".", ",")} sotto la soglia ${soglia.toFixed(2).replace(".", ",")} per ${N} prove`);
  }

  return { media, t, soglia, quota, operazioni, M, Meff, correlazione, passa: motivi.length === 0, motivi };
}

/** Le strategie valide: scarta quelle che la validazione della configurazione rifiuta. */
export function soloValide(strategie) {
  return strategie.filter((s) => problemiStrategia(s).length === 0);
}

/* ------------------------------------------------------------------ */
/* quante coppie contano davvero                                       */
/* ------------------------------------------------------------------ */

/** Correlazione di Pearson fra due elenchi di rendimenti della stessa lunghezza, o null se non bastano. */
function pearson(x, y) {
  const n = x.length;
  if (n < 30) return null;
  const mx = x.reduce((s, v) => s + v, 0) / n;
  const my = y.reduce((s, v) => s + v, 0) / n;
  let cov = 0;
  let vx = 0;
  let vy = 0;
  for (let i = 0; i < n; i++) {
    cov += (x[i] - mx) * (y[i] - my);
    vx += (x[i] - mx) ** 2;
    vy += (y[i] - my) ** 2;
  }
  if (vx === 0 || vy === 0) return null;
  return cov / Math.sqrt(vx * vy);
}

/**
 * La correlazione media fra le coppie, sui rendimenti giornalieri che cadono
 * nella finestra [da, a). Le coppie si allineano per data: si confrontano solo
 * i giorni in comune.
 *
 * Serve a non contare come indipendenti coppie che si muovono insieme: venti
 * criptovalute legate al mercato valgono molte meno di venti prove.
 *
 * @returns {number|null} la media delle correlazioni fra coppie, o null se non si può calcolare
 */
export function correlazioneMedia(serie, da, a) {
  const mappe = Object.values(serie).map((candele) => {
    const rendimenti = new Map();
    for (let i = 1; i < candele.length; i++) {
      const c = candele[i];
      if (c.momento < da || c.momento >= a) continue;
      rendimenti.set(c.momento, candele[i].chiusura / candele[i - 1].chiusura - 1);
    }
    return rendimenti;
  });

  const correlazioni = [];
  for (let i = 0; i < mappe.length; i++) {
    for (let j = i + 1; j < mappe.length; j++) {
      const comuni = [...mappe[i].keys()].filter((t) => mappe[j].has(t));
      const r = pearson(comuni.map((t) => mappe[i].get(t)), comuni.map((t) => mappe[j].get(t)));
      if (r !== null) correlazioni.push(r);
    }
  }
  if (correlazioni.length === 0) return null;
  return correlazioni.reduce((s, v) => s + v, 0) / correlazioni.length;
}

/**
 * Quante prove indipendenti valgono M coppie con correlazione media ρ̄:
 * M / (1 + (M − 1)·ρ̄). Con ρ̄ = 0 valgono M; con ρ̄ = 1 vale una sola.
 * Se la correlazione non si può misurare, si conta il massimo, come ottimista
 * per prudenza: in quel caso il giudizio va letto con più cautela.
 */
export function coppieEffettive(M, rho) {
  if (rho === null || rho === undefined) return M;
  const r = Math.min(1, Math.max(0, rho));
  return M / (1 + (M - 1) * r);
}
