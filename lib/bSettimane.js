/**
 * lib/bSettimane.js — la regola B sull'universo 2020: serie settimanali per moneta, portafoglio a
 * pesi uguali e giudizio a rotazione circolare comune.
 *
 * Funzioni pure. Una serie settimanale ha una voce per ogni domenica disponibile:
 *   · chiusure[k]: chiusura della domenica k (null se manca la candela); per una moneta tolta dal
 *     listino, nella settimana dell'ultima candela, la chiusura è quella dell'ultima candela;
 *   · rendimenti[k]: rendimento della settimana k, dall'ultima chiusura nota alla chiusura di k;
 *   · attiva[k]: false dalla settimana successiva all'ultima candela della moneta;
 *   · dentro[k]: 1 se la moneta è in posizione nella settimana k, cioè se il segnale della domenica
 *     k−1 è dentro e la moneta è attiva.
 */

import { segnali } from "./settimane.js";
import { permanenzeLineari, permanenzeCircolari, ruota, rendimentoSettimane } from "./rotazione.js";

const GIORNO = 86400000;
const SETTIMANA = 7 * GIORNO;
export const COSTO = 0.003; // 0,30% per operazione, andata e ritorno
export const LATO = COSTO / 2; // 0,15% per lato

const iso = (ms) => new Date(ms).toISOString().slice(0, 10);

/** La serie settimanale di una moneta; `date` e `close` sono in ordine, fino a `fine` compresa. */
export function serieSettimanale({ date, close }, fine) {
  const mappa = new Map(date.map((d, k) => [d, close[k]]));
  const primo = date.find((d) => new Date(Date.parse(d)).getUTCDay() === 0);
  const domeniche = [];
  for (let t = Date.parse(primo); t <= Date.parse(fine); t += SETTIMANA) domeniche.push(iso(t));

  const chiusure = domeniche.map((d) => (mappa.has(d) ? mappa.get(d) : null));
  const attiva = domeniche.map(() => true);
  const ultimo = date[date.length - 1];
  if (ultimo < fine) {
    const w = domeniche.findIndex((d) => d >= ultimo);
    chiusure[w] = mappa.get(ultimo);
    for (let k = w + 1; k < domeniche.length; k++) {
      chiusure[k] = null;
      attiva[k] = false;
    }
  }

  const rendimenti = [];
  let ultimaNota = null;
  for (const c of chiusure) {
    if (c === null) {
      rendimenti.push(null);
      continue;
    }
    rendimenti.push(ultimaNota === null ? null : c / ultimaNota - 1);
    ultimaNota = c;
  }

  const sig = segnali("B", rendimenti);
  const dentro = domeniche.map((_, k) => (k >= 1 && sig[k - 1] === true && attiva[k] ? 1 : 0));
  return { domeniche, chiusure, rendimenti, attiva, dentro };
}

/** Il periodo di test: le W settimane dopo `da` (la domenica di partenza, già nota alla moneta). */
export function periodo(serie, { da, W }) {
  const i0 = serie.domeniche.indexOf(da);
  if (i0 < 0 || i0 + W >= serie.domeniche.length) throw new Error(`periodo non disponibile dopo il ${da}`);
  const idx = Array.from({ length: W }, (_, k) => i0 + 1 + k);
  return {
    H: idx.map((i) => serie.dentro[i]),
    R0: idx.map((i) => serie.rendimenti[i] ?? 0),
    attiva: idx.map((i) => (serie.attiva[i] ? 1 : 0)),
    date: [serie.domeniche[i0], ...idx.map((i) => serie.domeniche[i])]
  };
}

/**
 * La curva di una moneta: base 1 alla domenica di partenza, lunga W+1. Entrata e uscita pagano
 * ciascuna la metà del costo; la posizione `held` vale per la settimana; fuori dalla posizione la
 * quota resta in liquidità.
 */
export function equity(held, R0, lato) {
  let E = held[0] ? 1 - lato : 1;
  const curva = [E];
  for (let k = 0; k < held.length; k++) {
    if (held[k]) E *= 1 + R0[k];
    const prossima = k + 1 < held.length ? held[k + 1] : 0;
    if (held[k] && !prossima) E *= 1 - lato;
    if (!held[k] && prossima) E *= 1 - lato;
    curva.push(E);
  }
  return curva;
}

/** La curva del portafoglio a pesi uguali: la media delle curve delle monete. */
export function curvaPortafoglio(monete, lato, campo) {
  const curve = monete.map((m) => equity(m[campo], m.R0, lato));
  return curve[0].map((_, k) => curve.reduce((somma, c) => somma + c[k], 0) / curve.length);
}

/** Il giudizio: somma dei rendimenti netti per operazione su tutte le monete, contro la rotazione
 * circolare comune. Si provano gli spostamenti s = 1, …, W−1 tranne quelli entro `escludi` dallo zero.
 * Una posizione che cade su settimane in cui la moneta non è attiva non genera operazioni.
 */
export function giudica(monete, { costo, alfa, escludi }) {
  const W = monete[0].H.length;
  const osservata = monete.reduce(
    (somma, m) => somma + permanenzeLineari(m.H).reduce((s, run) => s + rendimentoSettimane(m.R0, run) - costo, 0),
    0
  );
  let almenoCosi = 0;
  let spostamenti = 0;
  for (let s = 1; s <= W - 1; s++) {
    if (s <= escludi || s >= W - escludi) continue;
    spostamenti += 1;
    let somma = 0;
    for (const m of monete) {
      const hRot = ruota(m.H, s).map((h, k) => (h === 1 && m.attiva[k] === 1 ? 1 : 0));
      for (const run of permanenzeCircolari(hRot)) somma += rendimentoSettimane(m.R0, run) - costo;
    }
    if (somma >= osservata) almenoCosi += 1;
  }
  const p = (almenoCosi + 1) / (spostamenti + 1);
  const motivi = [];
  if (!(p <= alfa)) motivi.push(`p ${p.toFixed(5).replace(".", ",")} sopra alfa ${alfa.toFixed(2).replace(".", ",")}`);
  if (!(osservata > 0)) motivi.push("somma netta non positiva");
  return { osservata, p, spostamenti, passa: motivi.length === 0, motivi };
}
