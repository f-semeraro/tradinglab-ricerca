/**
 * lib/curve.js — le curve del capitale di un test a posizioni: una moneta, un portafoglio a pesi uguali,
 * e i numeri che se ne leggono.
 *
 * Funzioni pure, indifferenti al passo: un periodo può essere una settimana o un giorno. Una posizione
 * è una serie `dentro` di 0 e 1 lunga quanto i rendimenti: `dentro[k]` dice se la moneta è tenuta
 * durante il periodo k, e `rendimenti[k]` quanto ha reso in quel periodo.
 *
 * Convenzioni, le stesse di tutti i test del laboratorio:
 *   · la posizione è piatta prima del primo periodo e dopo l'ultimo: entrata e uscita pagano sempre;
 *   · ogni lato paga `lato` sul capitale del momento; una permanenza continua paga solo due lati;
 *   · una curva è in base 1 ed è lunga W+1: il primo valore è la base, il k-esimo è dopo il periodo k−1;
 *   · il portafoglio è a pesi uguali e senza ribilanciamento: è la media delle curve delle monete.
 */

/** La curva di una moneta: fuori dalla posizione la quota resta in liquidità, a rendimento zero. */
export function curvaPosizione(dentro, rendimenti, lato) {
  let capitale = dentro[0] ? 1 - lato : 1;
  const curva = [capitale];
  for (let k = 0; k < dentro.length; k++) {
    if (dentro[k]) capitale *= 1 + rendimenti[k];
    const prossima = k + 1 < dentro.length ? dentro[k + 1] : 0;
    if (dentro[k] && !prossima) capitale *= 1 - lato; // uscita alla fine del periodo k
    if (!dentro[k] && prossima) capitale *= 1 - lato; // ingresso alla fine del periodo k
    curva.push(capitale);
  }
  return curva;
}

/** La media di più curve della stessa lunghezza, punto per punto: il portafoglio a pesi uguali senza ribilanciamento. */
export function mediaCurve(curve) {
  if (curve.length === 0) throw new Error("serve almeno una curva");
  return curve[0].map((_, k) => curve.reduce((somma, c) => somma + c[k], 0) / curve.length);
}

/** Il drawdown massimo di una curva, in frazione: zero o negativo. */
export function drawdownCurva(curva) {
  let picco = -Infinity;
  let peggiore = 0;
  for (const valore of curva) {
    if (valore > picco) picco = valore;
    const discesa = valore / picco - 1;
    if (discesa < peggiore) peggiore = discesa;
  }
  return peggiore;
}

/**
 * Rendimento totale, rendimento annuo composto e drawdown massimo di una curva che copre `anni` anni.
 * Il rendimento si misura dal capitale iniziale, 1, e non dal primo punto della curva: quel punto
 * contiene già il costo d'ingresso di chi entra al primo periodo.
 */
export function metricheCurva(curva, anni) {
  const rendimento = curva[curva.length - 1] - 1;
  return {
    rendimento,
    annuo: (1 + rendimento) ** (1 / anni) - 1,
    drawdown: drawdownCurva(curva)
  };
}

/**
 * Il rendimento di ciascun anno solare. `date` ha una data ISO per ogni punto della curva, e la prima è
 * la base. Il primo anno parte dal capitale iniziale, 1, gli altri dall'ultimo punto dell'anno
 * precedente: così gli anni, composti, danno il rendimento totale di metricheCurva().
 */
export function rendimentiPerAnno(date, curva) {
  if (date.length !== curva.length) throw new Error("date e curva devono avere la stessa lunghezza");
  const ultimoDi = new Map();
  date.forEach((data, k) => {
    if (k > 0) ultimoDi.set(Number(data.slice(0, 4)), k);
  });
  let partenza = 1;
  return [...ultimoDi.entries()].map(([anno, fine]) => {
    const rendimento = curva[fine] / partenza - 1;
    partenza = curva[fine];
    return { anno, rendimento };
  });
}
