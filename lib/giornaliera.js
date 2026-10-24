/**
 * lib/giornaliera.js — la variante «B giornaliera»: segnale a 7 giorni controllato ogni giorno.
 *
 * Funzioni pure. Una serie giornaliera è { date, close, presente }: un giorno per riga, dal calendario
 * di partenza; close è riportata al valore dell'ultima candela quando manca; presente dice se la candela c'è.
 *
 * Regola (pre-registrazione 32c7415): fuori posizione, ogni giorno con candela, il rendimento a 7 giorni
 * supera l'80° percentile R7 dei rendimenti a 7 giorni dei giorni precedenti: entrata alla chiusura del
 * giorno; detenzione di 7 giorni; al settimo giorno si esce, a meno che il segnale sia vero: allora si
 * resta altri 7 giorni, senza costi. Un giorno senza candela non decide nulla: la decisione slitta al
 * giorno con candela. Dopo l'ultima candela la moneta è fuori (uscita all'ultima chiusura).
 */

import { permanenzeLineari, permanenzeCircolari, ruota, rendimentoSettimane } from "./rotazione.js";

const GIORNO = 86400000;
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);

/** La serie giornaliera dal calendario `inizio` fino a `fine` compresa. */
export function serieGiornaliera(candele, fine, inizio) {
  const mappa = new Map(candele.map((c) => [c.date, c.close]));
  const date = [];
  const close = [];
  const presente = [];
  let ultimo = null;
  for (let t = Date.parse(inizio); t <= Date.parse(fine); t += GIORNO) {
    const d = iso(t);
    const ha = mappa.has(d);
    if (ha) ultimo = mappa.get(d);
    date.push(d);
    close.push(ultimo);
    presente.push(ha);
  }
  return { date, close, presente };
}

/** Il percentile con interpolazione lineare (R7) di una lista già ordinata. */
function quantileOrdinato(ordinati, p) {
  const h = (ordinati.length - 1) * p;
  const lo = Math.floor(h);
  const hi = Math.ceil(h);
  return ordinati[lo] + (h - lo) * (ordinati[hi] - ordinati[lo]);
}

/** Inserisce un valore in una lista ordinata, mantenendo l'ordine. */
function inserisciOrdinato(ordinati, valore) {
  let lo = 0;
  let hi = ordinati.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (ordinati[m] < valore) lo = m + 1;
    else hi = m;
  }
  ordinati.splice(lo, 0, valore);
}

/**
 * L'esposizione di ogni giorno: 1 se la posizione è aperta durante il rendimento di quel giorno.
 * ultimoIndice: indice dell'ultima candela; dopo, la moneta è fuori.
 * primaDecisione: indice del primo giorno in cui un segnale può aprire la posizione; prima, nessuna posizione.
 */
export function esposizione(serie, ultimoIndice, primaDecisione = 0) {
  const { close, presente } = serie;
  const n = close.length;
  const expo = new Array(n).fill(0);
  const passato = []; // i rendimenti a 7 giorni dei giorni con candela, ordinati
  let dentro = false;
  let prossimo = null;
  for (let t = 0; t < n; t++) {
    if (t > ultimoIndice) {
      dentro = false;
      continue;
    }
    if (dentro) expo[t] = 1;
    if (t === ultimoIndice) {
      dentro = false; // l'ultima candela chiude la posizione
      continue;
    }
    if (!presente[t] || t < 7 || close[t - 7] === null) continue;

    const r7 = close[t] / close[t - 7] - 1;
    const soglia = passato.length > 0 ? quantileOrdinato(passato, 0.8) : null;
    const segnale = soglia !== null && r7 > soglia;
    if (!dentro) {
      if (segnale && t >= primaDecisione) {
        dentro = true;
        prossimo = t + 7;
      }
    } else if (t >= prossimo) {
      if (segnale) prossimo = t + 7; // il segnale persiste: altri 7 giorni, senza costi
      else {
        dentro = false; // uscita alla chiusura del settimo giorno
        prossimo = null;
      }
    }
    inserisciOrdinato(passato, r7);
  }
  return expo;
}

/** Il giudizio: somma dei rendimenti netti per operazione, contro la rotazione circolare comune in giorni. */
export function giudicaGiornaliera({ monete, costo, alfa, escludi }) {
  const W = monete[0].e.length;
  const osservata = monete.reduce(
    (somma, m) => somma + permanenzeLineari(m.e).reduce((s, run) => s + rendimentoSettimane(m.R, run) - costo, 0),
    0
  );
  let almenoCosi = 0;
  let spostamenti = 0;
  for (let s = 1; s <= W - 1; s++) {
    if (s <= escludi || s >= W - escludi) continue;
    spostamenti += 1;
    let somma = 0;
    for (const m of monete) {
      const eRot = ruota(m.e, s).map((h, k) => (h === 1 && m.attiva[k] === 1 ? 1 : 0));
      for (const run of permanenzeCircolari(eRot)) somma += rendimentoSettimane(m.R, run) - costo;
    }
    if (somma >= osservata) almenoCosi += 1;
  }
  const p = (almenoCosi + 1) / (spostamenti + 1);
  const motivi = [];
  if (!(p <= alfa)) motivi.push(`p ${p.toFixed(5).replace(".", ",")} sopra alfa ${alfa.toFixed(3).replace(".", ",")}`);
  if (!(osservata > 0)) motivi.push("somma netta non positiva");
  return { osservata, p, spostamenti, passa: motivi.length === 0, motivi };
}
