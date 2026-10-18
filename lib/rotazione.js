/**
 * lib/rotazione.js — il giudizio della conferma su altre crypto: rotazione circolare comune.
 *
 * Funzioni pure. Una moneta è { R, H }, con W settimane uguali per tutte le monete:
 *   · R[i] è il rendimento settimanale della settimana i (0-based);
 *   · H[i] è 1 se la moneta è dentro nella settimana i, 0 altrimenti.
 *
 * L'ipotesi è: la regola batte il caso. La distribuzione nulla sposta le serie H di tutte le
 * monete di s settimane, con ritorno all'inizio e lo stesso s per tutte: così resta il legame
 * tra monete che si muovono insieme, e si rompe solo l'allineamento con i rendimenti.
 */

const modulo = (a, n) => ((a % n) + n) % n;

/** Le permanenze lineari: ciascuna è un elenco di settimane consecutive, senza attraversare il bordo. */
export function permanenzeLineari(H) {
  const permanenze = [];
  let corrente = null;
  for (let i = 0; i < H.length; i++) {
    if (H[i] === 1) {
      if (corrente === null) corrente = [];
      corrente.push(i);
    } else if (corrente !== null) {
      permanenze.push(corrente);
      corrente = null;
    }
  }
  if (corrente !== null) permanenze.push(corrente);
  return permanenze;
}

/** Le permanenze circolari: una permanenza che attraversa la fine della serie è una sola. */
export function permanenzeCircolari(H) {
  const n = H.length;
  if (H.every((v) => v === 1)) return [Array.from({ length: n }, (_, i) => i)];
  // si comincia da uno 0, così nessuna permanenza viene spezzata
  const partenza = H.indexOf(0);
  const permanenze = [];
  let corrente = null;
  for (let j = 1; j <= n; j++) {
    const i = (partenza + j) % n;
    if (H[i] === 1) {
      if (corrente === null) corrente = [];
      corrente.push(i);
    } else if (corrente !== null) {
      permanenze.push(corrente);
      corrente = null;
    }
  }
  if (corrente !== null) permanenze.push(corrente);
  return permanenze;
}

/** La serie H spostata di s settimane in avanti, con ritorno all'inizio. */
export function ruota(H, s) {
  const n = H.length;
  return H.map((_, i) => H[modulo(i - s, n)]);
}

/** Il rendimento composto delle settimane indicate. */
export function rendimentoSettimane(R, settimane) {
  return settimane.reduce((prodotto, i) => prodotto * (1 + R[i]), 1) - 1;
}

/** La somma dei rendimenti netti delle operazioni di una moneta. */
function sommaNetta(R, H, costo, circolare) {
  const permanenze = circolare ? permanenzeCircolari(H) : permanenzeLineari(H);
  return permanenze.reduce((somma, p) => somma + rendimentoSettimane(R, p) - costo, 0);
}

/** La statistica osservata: somma dei rendimenti netti per operazione, su tutte le monete. */
export function statisticaOsservata(monete, costo) {
  return monete.reduce((somma, m) => somma + sommaNetta(m.R, m.H, costo, false), 0);
}

/** La statistica con la serie di tutte le monete spostata di s settimane. */
export function statisticaRuotata(monete, s, costo) {
  return monete.reduce((somma, m) => somma + sommaNetta(m.R, ruota(m.H, s), costo, true), 0);
}

/**
 * Il giudizio: si provano gli spostamenti s = 1, …, W−1 (lo zero no), tranne quelli entro
 * `escludi` dallo zero in entrambe le direzioni. p = (numero di spostamenti con statistica ≥ quella
 * osservata, più 1) / (numero di spostamenti, più 1). Passa solo con p ≤ alfa e statistica
 * osservata positiva.
 */
export function giudicaRotazione({ monete, costo, alfa, escludi = 0 }) {
  const W = monete[0].R.length;
  const osservata = statisticaOsservata(monete, costo);
  let almenoCosi = 0;
  let spostamenti = 0;
  for (let s = 1; s <= W - 1; s++) {
    if (s <= escludi || s >= W - escludi) continue;
    spostamenti += 1;
    if (statisticaRuotata(monete, s, costo) >= osservata) almenoCosi += 1;
  }
  const p = (almenoCosi + 1) / (spostamenti + 1);
  const motivi = [];
  if (!(p <= alfa)) motivi.push(`p ${p.toFixed(4).replace(".", ",")} sopra alfa ${alfa.toString().replace(".", ",")}`);
  if (!(osservata > 0)) motivi.push("somma netta non positiva");
  return { osservata, p, spostamenti, passa: motivi.length === 0, motivi };
}
