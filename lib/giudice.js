/**
 * lib/giudice.js — il giudizio a permutazione.
 *
 * Domanda: le operazioni della strategia sono scelte meglio del caso?
 *
 * Si tengono fissi numero, durata e costi di ogni operazione, e le si ricolloca a
 * caso, senza sovrapposizioni, tra i momenti in cui la strategia poteva decidere.
 * Se la strategia batte quasi tutte le ricollocazioni, il tempismo conta. Se no,
 * la stessa media si sarebbe ottenuta scegliendo i momenti a caso.
 *
 * Due condizioni insieme per passare:
 *   1. battere le ricollocazioni con p ≤ alfa/N, dove N è il numero di ipotesi
 *      provate (correzione di Bonferroni);
 *   2. avere un risultato netto positivo, dopo i costi.
 *
 * Il giudizio è puro: il generatore di numeri casuali arriva da fuori, quindi
 * con lo stesso seme il risultato è sempre lo stesso.
 */

/**
 * Ricolloca le operazioni a caso, nell'ordine in cui le ha fatte la strategia,
 * senza sovrapporle. Ogni operazione occupa `durata` candele e la successiva
 * comincia dopo la fine della precedente o più tardi.
 *
 * @param {() => number} rng   generatore in [0, 1)
 * @param {number} W           quante candele ci sono, indici da 0 a W-1
 * @param {number[]} durate    durata in candele di ogni operazione
 * @returns {number[]} l'indice di ingresso di ogni operazione
 */
export function ricollocaOperazioni(rng, W, durate) {
  const k = durate.length;
  if (k === 0) return [];
  const occupate = durate.reduce((somma, d) => somma + d, 0);
  const libere = W - 1 - occupate;
  if (libere < 0) throw new Error("le operazioni non stanno nella finestra");

  // k tagli uniformi sullo spazio libero: le differenze sono gli spazi vuoti
  const tagli = Array.from({ length: k }, () => Math.floor(rng() * (libere + 1))).sort((a, b) => a - b);

  const inizi = [];
  let cursore = 0;
  let precedente = 0;
  for (let i = 0; i < k; i++) {
    cursore += tagli[i] - precedente;
    inizi.push(cursore);
    cursore += durate[i];
    precedente = tagli[i];
  }
  return inizi;
}

/** Il rendimento percentuale di un'operazione, close to close, al netto dei costi di andata e ritorno. */
export function rendimentoOperazione(prezzi, inizio, fine, costoAndataRitorno = 0) {
  const lordo = (prezzi[fine] / prezzi[inizio] - 1) * 100;
  return { lordo, netto: lordo - costoAndataRitorno };
}

/**
 * Il giudizio vero e proprio.
 *
 * @param {object} args
 * @param {Array<{prezzi:number[], W:number, operazioni:Array<{inizio:number, fine:number}>}>} args.gruppi
 *        una voce per coppia: i prezzi di chiusura della finestra decisionale, quante candele ha,
 *        e le operazioni già fatte come indici dentro quella finestra
 * @param {number} args.costoAndataRitorno  costo in punti percentuali per operazione
 * @param {number} args.permutazioni        quante ricollocazioni generare
 * @param {() => number} args.rng           generatore casuale, con seme
 * @param {number} args.N                   quante ipotesi sono state provate in tutto
 * @param {number} args.alfa                livello di significatività (es. 0,05)
 * @param {number} [args.minimoOperazioni=1]
 * @returns {object} il giudizio, con statistica netta e lorda, p, soglia e motivi
 */
export function giudicaPermutazione({ gruppi, costoAndataRitorno, permutazioni, rng, N, alfa, minimoOperazioni = 1 }) {
  // la statistica è la somma dei rendimenti delle operazioni, su tutte le coppie
  let osservataNetta = 0;
  let osservataLorda = 0;
  let operazioni = 0;
  for (const g of gruppi) {
    for (const op of g.operazioni) {
      const r = rendimentoOperazione(g.prezzi, op.inizio, op.fine, costoAndataRitorno);
      osservataNetta += r.netto;
      osservataLorda += r.lordo;
      operazioni += 1;
    }
  }

  let piuGrandi = 0;
  for (let p = 0; p < permutazioni; p++) {
    let statistica = 0;
    for (const g of gruppi) {
      const durate = g.operazioni.map((op) => op.fine - op.inizio);
      const inizi = ricollocaOperazioni(rng, g.W, durate);
      for (let i = 0; i < inizi.length; i++) {
        statistica += rendimentoOperazione(g.prezzi, inizi[i], inizi[i] + durate[i], costoAndataRitorno).netto;
      }
    }
    if (statistica >= osservataNetta) piuGrandi += 1;
  }

  const p = (piuGrandi + 1) / (permutazioni + 1);
  const soglia = alfa / N;

  const motivi = [];
  if (operazioni < minimoOperazioni) {
    motivi.push(`operazioni ${operazioni}, servono almeno ${minimoOperazioni}`);
  }
  if (!(p <= soglia)) {
    motivi.push(`p ${p.toExponential(2)} sopra la soglia ${soglia.toExponential(2)} (alfa ${alfa} diviso ${N} ipotesi)`);
  }
  if (!(osservataNetta > 0)) {
    motivi.push("risultato netto non positivo dopo i costi");
  }

  return {
    operazioni,
    statisticaNetta: osservataNetta,
    statisticaLorda: osservataLorda,
    p,
    soglia,
    permutazioni,
    passa: motivi.length === 0,
    motivi
  };
}
