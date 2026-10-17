/**
 * lib/settimane.js — la strategia settimanale di Liu e Tsyvinski (2021), sul prezzo giornaliero.
 *
 * Funzioni pure: le candele arrivano da fuori.
 *
 * Convenzioni:
 *   · una settimana va da lunedì 00:00 a domenica 24:00 UTC; il prezzo di domenica è la
 *     chiusura della candela giornaliera di domenica;
 *   · l'indice k identifica la domenica k; la settimana k va dalla domenica k−1 alla domenica k;
 *   · un segnale calcolato alla domenica k decide la posizione della settimana k+1, con
 *     informazioni fino alla domenica k compresa;
 *   · le posizioni sono permanenze continue: costi solo all'ingresso e all'uscita.
 */

const MS_SETTIMANA = 7 * 86400000;

/**
 * La serie delle domeniche, dalla prima all'ultima presente, senza buchi: dove una domenica
 * non ha candela, il prezzo è null.
 */
export function domeniche(candele) {
  const perData = new Map();
  for (const c of candele) {
    const d = new Date(c.momento * 1000);
    if (d.getUTCDay() === 0) perData.set(d.toISOString().slice(0, 10), c.chiusura);
  }
  const date = [...perData.keys()].sort();
  if (date.length === 0) return { date: [], close: [] };

  const risultato = { date: [], close: [] };
  const fine = Date.parse(date[date.length - 1]);
  for (let t = Date.parse(date[0]); t <= fine; t += MS_SETTIMANA) {
    const iso = new Date(t).toISOString().slice(0, 10);
    risultato.date.push(iso);
    risultato.close.push(perData.has(iso) ? perData.get(iso) : null);
  }
  return risultato;
}

/** Il rendimento settimanale k: chiusura di domenica k / chiusura di domenica k−1, meno 1. */
export function rendimentiSettimanali(close) {
  return close.map((c, k) => (k === 0 || c === null || close[k - 1] === null ? null : c / close[k - 1] - 1));
}

/** Il percentile con interpolazione lineare (metodo R7), o null se non ci sono valori. */
export function percentileR7(valori, p) {
  if (valori.length === 0) return null;
  const x = [...valori].sort((a, b) => a - b);
  const h = (x.length - 1) * p;
  const lo = Math.floor(h);
  const hi = Math.ceil(h);
  return x[lo] + (h - lo) * (x[hi] - x[lo]);
}

/**
 * Il segnale alla domenica k: true se si tiene la settimana successiva, false se no, null se
 * non si può decidere. Per la variante A conta il segno; per B e C, il quinto più alto
 * rispetto al 80° percentile delle settimane precedenti, calcolato solo sul passato.
 */
export function segnali(variante, rendimenti) {
  return rendimenti.map((r, k) => {
    if (r === null) return null;
    if (variante === "A") return r > 0;
    if (variante === "B" || variante === "C") {
      const passato = rendimenti.slice(0, k).filter((v) => v !== null);
      const soglia = percentileR7(passato, 0.8);
      return soglia === null ? null : r > soglia;
    }
    throw new Error(`variante sconosciuta: ${variante}`);
  });
}

/**
 * Quali settimane si tiene la posizione. Un segnale vero alla domenica k accende la posizione
 * per le L settimane successive; un nuovo segnale mentre si è dentro fa ripartire il conteggio.
 * Un segnale falso o assente non spegne una posizione già aperta.
 */
export function settimaneDentro(segnale, L) {
  const dentro = new Array(segnale.length).fill(false);
  let restanti = 0;
  for (let k = 0; k < segnale.length; k++) {
    dentro[k] = restanti > 0;
    if (restanti > 0) restanti -= 1;
    if (segnale[k] === true) restanti = L;
  }
  return dentro;
}

/**
 * Le permanenze nella finestra [primaSettimana, ultimaSettimana] (indici di domenica, estremi
 * compresi come settimane). Ogni permanenza ha ingresso alla domenica prima della prima
 * settimana e uscita alla domenica dell'ultima. Una permanenza iniziata prima della finestra
 * entra alla prima domenica della finestra.
 *
 * @returns {Array<{entrata:number, uscita:number}>} indici di domenica
 */
export function permanenze(dentro, primaSettimana, ultimaSettimana) {
  const risultato = [];
  let inizio = null;
  for (let k = primaSettimana; k <= ultimaSettimana; k++) {
    if (dentro[k]) {
      if (inizio === null) inizio = k - 1;
    } else if (inizio !== null) {
      // la settimana k non è tenuta: l'ultima tenuta è k−1, e lì si esce
      risultato.push({ entrata: inizio, uscita: k - 1 });
      inizio = null;
    }
  }
  if (inizio !== null) risultato.push({ entrata: inizio, uscita: ultimaSettimana });
  return risultato;
}

/**
 * La curva del capitale alle domeniche della finestra, con il costo di andata e ritorno spalmato
 * su ingresso e uscita: metà del costo per lato. Parte da 1 alla prima domenica della finestra.
 *
 * @returns {number[]} la curva, indicizzata come close
 */
export function curvaCapitale(close, dentro, primaDomenica, ultimaDomenica, costoAndataRitorno) {
  const lato = costoAndataRitorno / 2;
  const curva = new Array(close.length).fill(null);
  let E = 1;
  for (let k = primaDomenica; k <= ultimaDomenica; k++) {
    const inPosizione = k > primaDomenica && dentro[k];
    if (inPosizione) E *= close[k] / close[k - 1];
    const prossima = k + 1 <= ultimaDomenica ? dentro[k + 1] : false;
    if (!inPosizione && prossima) E *= 1 - lato; // ingresso alla domenica k
    if (inPosizione && (!prossima || k === ultimaDomenica)) E *= 1 - lato; // uscita alla domenica k
    curva[k] = E;
  }
  return curva;
}

/** Il drawdown massimo di una curva, in frazione (negativo o zero). */
export function drawdownMassimo(curva, primaDomenica, ultimaDomenica) {
  let picco = -Infinity;
  let peggiore = 0;
  for (let k = primaDomenica; k <= ultimaDomenica; k++) {
    if (curva[k] > picco) picco = curva[k];
    const discesa = curva[k] / picco - 1;
    if (discesa < peggiore) peggiore = discesa;
  }
  return peggiore;
}
