/**
 * lib/portafoglio.js — il portafoglio a pesi uguali della verifica all'indietro della media a 140
 * giorni (Detzel et al., L = 20 settimane), su 1 luglio 2018 – 31 dicembre 2020.
 *
 * Funzioni pure: le candele arrivano da fuori. Una moneta è { e, R }, con W giorni uguali per tutte:
 *   · e[i] è l'esposizione del giorno i (0 o 1), R[i] il rendimento dello stesso giorno;
 *   · la posizione è piatta prima del primo giorno e dopo l'ultimo: entrata e uscita pagano il costo.
 */

import { turnoverCircolare } from "./detzel.js";
import { ruota } from "./rotazione.js";

const GIORNO = 86400000;

/**
 * Il rendimento netto del portafoglio di ogni giorno: la media dei rendimenti netti delle monete,
 * con il costo di uscita finale addebitato all'ultimo giorno.
 */
export function rendimentiPortafoglio(monete, costo) {
  const W = monete[0].R.length;
  const rendimenti = new Array(W).fill(0);
  for (const { e, R } of monete) {
    let prima = 0;
    for (let i = 0; i < W; i++) {
      rendimenti[i] += (e[i] * R[i] - costo * Math.abs(e[i] - prima)) / monete.length;
      prima = e[i];
    }
    rendimenti[W - 1] -= (costo * prima) / monete.length;
  }
  return rendimenti;
}

/** La curva del capitale del portafoglio: base 1 prima del primo giorno, lunga W+1. */
export function curvaPortafoglio(monete, costo) {
  const curva = [1];
  for (const r of rendimentiPortafoglio(monete, costo)) curva.push(curva[curva.length - 1] * (1 + r));
  return curva;
}

/**
 * Il giudizio: rendimento netto medio giornaliero del portafoglio contro la rotazione circolare
 * comune, cioè lo stesso spostamento s per tutte le monete, senza seme. Si provano gli spostamenti
 * s = 1, …, W−1 tranne quelli entro `escludi` dallo zero in entrambe le direzioni. Nella nulla i
 * costi sono quelli della serie circolare di ciascuna moneta.
 * p = (spostamenti con statistica ≥ osservata, più 1) / (spostamenti, più 1).
 * Passa solo con p ≤ alfa e rendimento netto totale del portafoglio positivo.
 */
export function giudicaPortafoglio({ monete, costo, alfa, escludi }) {
  const W = monete[0].R.length;
  const rendimenti = rendimentiPortafoglio(monete, costo);
  const osservata = rendimenti.reduce((somma, r) => somma + r, 0) / W;
  const rendimentoNettoTotale = curvaPortafoglio(monete, costo)[W] - 1;
  const turnover = monete.map((m) => turnoverCircolare(m.e));
  let almenoCosi = 0;
  let spostamenti = 0;
  for (let s = 1; s <= W - 1; s++) {
    if (s <= escludi || s >= W - escludi) continue;
    spostamenti += 1;
    let somma = 0;
    monete.forEach((m, i) => {
      const guadagno = ruota(m.e, s).reduce((acc, x, d) => acc + x * m.R[d], 0);
      somma += (guadagno - costo * turnover[i]) / W;
    });
    if (somma / monete.length >= osservata) almenoCosi += 1;
  }
  const p = (almenoCosi + 1) / (spostamenti + 1);
  const motivi = [];
  if (!(p <= alfa)) motivi.push(`p ${p.toFixed(5).replace(".", ",")} sopra alfa ${alfa.toFixed(2).replace(".", ",")}`);
  if (!(rendimentoNettoTotale > 0)) motivi.push("rendimento netto totale non positivo");
  return { osservata, p, spostamenti, rendimentoNettoTotale, passa: motivi.length === 0, motivi };
}

/**
 * L'ammissibilità all'universo: almeno `finestra` chiusure con data prima di `inizio`, e nessun
 * giorno mancante dalla prima di quelle chiusure fino a `fine`, compresa. `date` è in ordine.
 */
export function valutaCopertura({ date, inizio, fine, finestra }) {
  const prima = date.filter((d) => d < inizio);
  if (prima.length < finestra) {
    return { incluso: false, motivo: `storia corta: ${prima.length} chiusure prima del ${inizio}` };
  }
  const presenti = new Set(date);
  const partenza = Date.parse(prima[prima.length - finestra]);
  for (let t = partenza; t <= Date.parse(fine); t += GIORNO) {
    const giorno = new Date(t).toISOString().slice(0, 10);
    if (!presenti.has(giorno)) return { incluso: false, motivo: `giorno mancante il ${giorno}` };
  }
  return { incluso: true, motivo: "" };
}
