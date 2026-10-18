/**
 * lib/detzel.js — la regola a medie mobili logaritmiche di Detzel, Liu, Strauss, Zhou e Zhu (2021),
 * sul prezzo giornaliero di Bitcoin.
 *
 * Funzioni pure: le candele arrivano da fuori.
 *
 * Convenzioni, dalla pre-registrazione:
 *   · b_t è il logaritmo della chiusura del giorno t; la media ma_t(L) è la media di b sugli ultimi
 *     giorni, oggi compreso;
 *   · il segnale del giorno t è 1 se b_t > ma_t(L), altrimenti 0;
 *   · l'esposizione del giorno d è il segnale del giorno d−1: nessuna informazione dopo d−1;
 *   · il costo è per unità di variazione di esposizione; la posizione è piatta prima e dopo la serie.
 */

import { ruota } from "./rotazione.js";

/** Il segnale di ogni giorno; null dove la storia non basta (i primi giorni). */
export function segnali(close, giorni) {
  const b = close.map((c) => Math.log(c));
  return b.map((bt, t) => {
    if (t < giorni - 1) return null;
    let somma = 0;
    for (let k = t - giorni + 1; k <= t; k++) somma += b[k];
    return bt > somma / giorni ? 1 : 0;
  });
}

/** L'esposizione del giorno d è il segnale del giorno d−1; il primo giorno non ha segnale precedente. */
export function esposizione(segnale) {
  return segnale.map((_, d) => (d === 0 ? null : segnale[d - 1]));
}

/** La media a pesi uguali di più esposizioni, giorno per giorno; null dove una manca. */
export function mediaEsposizioni(esposizioni) {
  return esposizioni[0].map((_, d) =>
    esposizioni.some((e) => e[d] === null)
      ? null
      : esposizioni.reduce((somma, e) => somma + e[d], 0) / esposizioni.length
  );
}

/** La somma dei cambi di esposizione, con la posizione piatta prima e dopo la serie. */
export function turnoverLineare(e) {
  let somma = 0;
  let prima = 0;
  for (const x of e) {
    somma += Math.abs(x - prima);
    prima = x;
  }
  return somma + Math.abs(prima);
}

/** La somma dei cambi di una serie circolare: anche il cambio tra la fine e l'inizio conta. */
export function turnoverCircolare(e) {
  const n = e.length;
  let somma = 0;
  for (let i = 0; i < n; i++) somma += Math.abs(e[i] - e[(i - 1 + n) % n]);
  return somma;
}

/**
 * La curva del capitale: parte da 1 prima del primo giorno; ogni giorno applica il rendimento
 * dell'esposizione meno il costo del cambio; l'uscita finale chiude l'ultima posizione.
 * @returns {number[]} lunga W+1: il primo valore è la base, il k-esimo è dopo il giorno k−1.
 */
export function curvaEsposizione(e, R, costo) {
  const curva = [1];
  let capitale = 1;
  let prima = 0;
  for (let i = 0; i < e.length; i++) {
    capitale *= 1 + e[i] * R[i] - costo * Math.abs(e[i] - prima);
    curva.push(capitale);
    prima = e[i];
  }
  curva[e.length] = capitale * (1 - costo * prima);
  return curva;
}

/** Il rendimento netto medio giornaliero: esposizione per rendimento, meno i costi. */
export function statisticaMedia(e, R, costo) {
  const guadagno = e.reduce((somma, x, i) => somma + x * R[i], 0);
  return (guadagno - costo * turnoverLineare(e)) / R.length;
}

/**
 * Il giudizio: rotazione circolare delle esposizioni rispetto ai rendimenti, senza seme. Si
 * provano gli spostamenti s = 1, …, W−1 tranne quelli entro `escludi` dallo zero in entrambe le
 * direzioni. Nella nulla i costi sono quelli della serie circolare, costanti per ogni spostamento.
 * p = (spostamenti con statistica ≥ osservata, più 1) / (spostamenti, più 1).
 * Passa solo con p ≤ alfa e rendimento netto totale positivo.
 */
export function giudicaEsposizione({ e, R, costo, alfa, escludi }) {
  const W = R.length;
  const osservata = statisticaMedia(e, R, costo);
  const rendimentoNettoTotale = curvaEsposizione(e, R, costo)[W] - 1;
  const turnover = turnoverCircolare(e);
  let almenoCosi = 0;
  let spostamenti = 0;
  for (let s = 1; s <= W - 1; s++) {
    if (s <= escludi || s >= W - escludi) continue;
    spostamenti += 1;
    const guadagno = ruota(e, s).reduce((somma, x, i) => somma + x * R[i], 0);
    if ((guadagno - costo * turnover) / W >= osservata) almenoCosi += 1;
  }
  const p = (almenoCosi + 1) / (spostamenti + 1);
  const motivi = [];
  if (!(p <= alfa)) motivi.push(`p ${p.toFixed(5).replace(".", ",")} sopra alfa ${alfa.toFixed(5).replace(".", ",")}`);
  if (!(rendimentoNettoTotale > 0)) motivi.push("rendimento netto totale non positivo");
  return { osservata, p, spostamenti, rendimentoNettoTotale, passa: motivi.length === 0, motivi };
}

/**
 * Il costo per lato al quale il vantaggio sul buy and hold è zero. Il vantaggio è lineare nel costo:
 * M(regola) − M(buy and hold) = [Σ(e−1)·R − c·(T − 2)] / W, con T il cambio totale della regola e
 * 2 quello del buy and hold. Non definito se T − 2 ≤ 0 o se il pareggio non è positivo.
 */
export function costoDiPareggio(e, R) {
  const guadagnoDifferenza = e.reduce((somma, x, i) => somma + (x - 1) * R[i], 0);
  const turnoverDifferenza = turnoverLineare(e) - turnoverLineare(e.map(() => 1));
  if (!(turnoverDifferenza > 0)) return null;
  const costo = guadagnoDifferenza / turnoverDifferenza;
  return costo > 0 ? costo : null;
}
