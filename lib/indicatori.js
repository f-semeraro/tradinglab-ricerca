/**
 * lib/indicatori.js — funzioni pure.
 *
 * Nessuna lettura di file, nessuna chiamata di rete, nessuna variabile
 * globale: entra un elenco di numeri, esce un numero. È per questo che è
 * l'unico posto del sistema dove i test si ripagano davvero.
 *
 * Regola che vale per tutte: **quando non ci sono abbastanza dati si
 * restituisce `null`**, mai un numero approssimato e mai NaN. Chi chiama deve
 * poter distinguere «non lo so ancora» da «il valore è zero».
 */

/** Le chiusure di un elenco di candele. Gli indicatori si calcolano su queste. */
export function chiusure(candele) {
  return candele.map((c) => c.chiusura);
}

function numeriValidi(valori, periodi) {
  return (
    Array.isArray(valori) &&
    Number.isFinite(periodi) &&
    periodi > 0 &&
    valori.length >= periodi &&
    valori.every((v) => Number.isFinite(v))
  );
}

/* ------------------------------------------------------------------ */
/* medie                                                               */
/* ------------------------------------------------------------------ */

/** Media mobile semplice su N periodi: l'ultimo valore, o null. */
export function mediaSemplice(valori, periodi) {
  if (!numeriValidi(valori, periodi)) return null;
  const ultimi = valori.slice(-periodi);
  return ultimi.reduce((somma, v) => somma + v, 0) / periodi;
}

/** La serie completa della media semplice, allineata all'input (null in testa). */
export function serieMediaSemplice(valori, periodi) {
  if (!numeriValidi(valori, periodi)) return [];
  const serie = new Array(valori.length).fill(null);
  let somma = 0;
  for (let i = 0; i < valori.length; i++) {
    somma += valori[i];
    if (i >= periodi) somma -= valori[i - periodi];
    if (i >= periodi - 1) serie[i] = somma / periodi;
  }
  return serie;
}

/**
 * Media mobile esponenziale su N periodi, **inizializzata con la media
 * semplice dei primi N valori** (è la convenzione: partire dal primo prezzo
 * dà numeri diversi per parecchie candele).
 */
export function serieMediaEsponenziale(valori, periodi) {
  if (!numeriValidi(valori, periodi)) return [];
  const serie = new Array(valori.length).fill(null);
  const peso = 2 / (periodi + 1);

  let precedente = valori.slice(0, periodi).reduce((somma, v) => somma + v, 0) / periodi;
  serie[periodi - 1] = precedente;

  for (let i = periodi; i < valori.length; i++) {
    precedente = valori[i] * peso + precedente * (1 - peso);
    serie[i] = precedente;
  }
  return serie;
}

/** Media mobile esponenziale: l'ultimo valore, o null. */
export function mediaEsponenziale(valori, periodi) {
  const serie = serieMediaEsponenziale(valori, periodi);
  return serie.length > 0 ? serie[serie.length - 1] : null;
}

/* ------------------------------------------------------------------ */
/* RSI                                                                 */
/* ------------------------------------------------------------------ */

/**
 * RSI su N periodi con lo **smorzamento di Wilder**: la media dei guadagni e
 * delle perdite si aggiorna come (precedente · (N−1) + valore) / N, non come
 * una media semplice mobile.
 *
 * Sono due formule diverse con lo stesso nome e danno numeri diversi di dieci
 * punti: è l'errore più frequente su questo indicatore, ed è silenzioso.
 *
 * Servono almeno N+1 valori (N differenze).
 */
export function rsi(valori, periodi = 14) {
  if (!Array.isArray(valori) || !Number.isFinite(periodi) || periodi <= 0) return null;
  if (valori.length < periodi + 1) return null;
  if (!valori.every((v) => Number.isFinite(v))) return null;

  // prima media: semplice, sulle prime N differenze
  let mediaGuadagni = 0;
  let mediaPerdite = 0;
  for (let i = 1; i <= periodi; i++) {
    const differenza = valori[i] - valori[i - 1];
    if (differenza >= 0) mediaGuadagni += differenza;
    else mediaPerdite += -differenza;
  }
  mediaGuadagni /= periodi;
  mediaPerdite /= periodi;

  // da qui in poi: smorzamento di Wilder
  for (let i = periodi + 1; i < valori.length; i++) {
    const differenza = valori[i] - valori[i - 1];
    const guadagno = differenza > 0 ? differenza : 0;
    const perdita = differenza < 0 ? -differenza : 0;
    mediaGuadagni = (mediaGuadagni * (periodi - 1) + guadagno) / periodi;
    mediaPerdite = (mediaPerdite * (periodi - 1) + perdita) / periodi;
  }

  if (mediaPerdite === 0) return mediaGuadagni === 0 ? 50 : 100;
  const forzaRelativa = mediaGuadagni / mediaPerdite;
  return 100 - 100 / (1 + forzaRelativa);
}

/* ------------------------------------------------------------------ */
/* volume e incroci                                                    */
/* ------------------------------------------------------------------ */

/**
 * Il massimo toccato nelle N candele precedenti, **esclusa l'ultima**.
 *
 * Serve alla condizione di rottura: «la chiusura di adesso supera il massimo
 * delle ultime N candele». L'ultima si esclude perché è quella che stiamo
 * giudicando — confrontarla col proprio stesso massimo renderebbe la
 * condizione quasi sempre falsa per costruzione.
 *
 * Servono almeno N+1 candele; altrimenti null, come tutte le altre.
 */
export function massimoPrecedente(candele, periodi) {
  if (!Array.isArray(candele) || !Number.isFinite(periodi) || periodi <= 0) return null;
  if (candele.length < periodi + 1) return null;

  const precedenti = candele.slice(-(periodi + 1), -1);
  let massimo = -Infinity;
  for (const candela of precedenti) {
    if (!Number.isFinite(candela.massimo)) return null;
    if (candela.massimo > massimo) massimo = candela.massimo;
  }
  return massimo;
}

/**
 * Quanto è sceso (o salito) il prezzo nelle ultime N candele, in percento.
 *
 * Serve alla condizione di crollo: «il prezzo ha perso il 3% in due ore».
 * Negativo se è sceso. Confronta la chiusura di adesso con quella di N candele
 * fa — non con il massimo, perché è la variazione compiuta che conta, non
 * l'escursione.
 *
 * Servono almeno N+1 candele; altrimenti null, come tutte le altre.
 */
export function variazioneSuPeriodo(candele, periodi) {
  if (!Array.isArray(candele) || !Number.isFinite(periodi) || periodi <= 0) return null;
  if (candele.length < periodi + 1) return null;

  const adesso = candele[candele.length - 1].chiusura;
  const prima = candele[candele.length - 1 - periodi].chiusura;
  if (!Number.isFinite(adesso) || !Number.isFinite(prima) || prima <= 0) return null;

  return ((adesso - prima) / prima) * 100;
}

/**
 * Rapporto di volume: il volume dell'ultima candela diviso la media del volume
 * delle N candele precedenti, **esclusa l'ultima**.
 *
 * Servono almeno N+1 candele.
 */
export function rapportoVolume(candele, periodi) {
  if (!Array.isArray(candele) || !Number.isFinite(periodi) || periodi <= 0) return null;
  if (candele.length < periodi + 1) return null;

  const volumi = candele.map((c) => c.volume);
  if (!volumi.every((v) => Number.isFinite(v))) return null;

  const ultimo = volumi[volumi.length - 1];
  const precedenti = volumi.slice(-(periodi + 1), -1);
  const media = precedenti.reduce((somma, v) => somma + v, 0) / periodi;

  if (media === 0) return null; // dividere per zero non è «volume infinito»
  return ultimo / media;
}

/**
 * Incrocio fra due serie: dice se la prima ha incrociato la seconda verso
 * l'alto o verso il basso **fra la penultima e l'ultima candela**, e niente
 * altrimenti.
 *
 * @returns {"alto"|"basso"|null}
 */
export function incrocio(serieA, serieB) {
  if (!Array.isArray(serieA) || !Array.isArray(serieB)) return null;
  if (serieA.length < 2 || serieB.length < 2) return null;

  const primaA = serieA[serieA.length - 2];
  const ultimaA = serieA[serieA.length - 1];
  const primaB = serieB[serieB.length - 2];
  const ultimaB = serieB[serieB.length - 1];

  if (![primaA, ultimaA, primaB, ultimaB].every((v) => Number.isFinite(v))) return null;

  if (primaA <= primaB && ultimaA > ultimaB) return "alto";
  if (primaA >= primaB && ultimaA < ultimaB) return "basso";
  return null;
}

/**
 * Come `incrocio()`, ma guardando indietro di più di una candela: c'è stato un
 * incrocio nelle ultime `quante` candele?
 *
 * Restituisce `{ direzione, candeleFa }` — dove `candeleFa: 0` vuol dire «su
 * questa candela» — oppure `null` se in quella finestra non è successo niente.
 * Con `quante = 1` fa esattamente quello che fa `incrocio()`, e infatti lo
 * chiama: la definizione di incrocio resta in un posto solo.
 *
 * `direzioneCercata` filtra: se la passi, si cerca l'incrocio più recente **in
 * quella direzione**, e uno in direzione opposta avvenuto dopo non lo annulla.
 *
 * Quel dettaglio non è pigrizia, è misurato. Pretendere che l'incrocio al
 * rialzo «regga ancora» equivale a chiedere che la media veloce sia tuttora
 * sopra la lenta, e su questo mercato non succede mai insieme a un RSI basso:
 * quando l'RSI scende a 32 le medie si sono già reincrociate al ribasso. Con
 * quella lettura la regola non scatta in nessun caso.
 *
 * Quindi «incrocio nelle ultime N candele» descrive un ripiegamento profondo
 * dopo una rottura — il prezzo ha rotto al rialzo, poi è tornato giù, magari
 * anche sotto le medie. NON è «compro la debolezza dentro una tendenza al
 * rialzo ancora in piedi»: per quello serve `sopra()`, che è un'altra cosa.
 *
 * @param {Array<number|null>} serieA
 * @param {Array<number|null>} serieB
 * @param {number} quante  quante candele guardare indietro, almeno 1
 * @param {"alto"|"basso"|null} direzioneCercata
 * @returns {{direzione: "alto"|"basso", candeleFa: number}|null}
 */
export function incrocioRecente(serieA, serieB, quante = 1, direzioneCercata = null) {
  if (!Array.isArray(serieA) || !Array.isArray(serieB)) return null;
  if (!Number.isInteger(quante) || quante < 1) return null;

  const lunghezza = Math.min(serieA.length, serieB.length);

  for (let candeleFa = 0; candeleFa < quante; candeleFa++) {
    const fine = lunghezza - candeleFa;
    if (fine < 2) break; // più indietro di così non ci sono due valori da confrontare

    const direzione = incrocio(serieA.slice(0, fine), serieB.slice(0, fine));
    if (direzione === null) continue;
    if (direzioneCercata !== null && direzione !== direzioneCercata) continue;

    return { direzione, candeleFa };
  }

  return null;
}

/**
 * Comodità per le regole: la prima serie sta sopra la seconda sull'ultima
 * candela? Serve a distinguere «ha incrociato adesso» da «è sopra da un po'».
 */
export function sopra(serieA, serieB) {
  if (!Array.isArray(serieA) || !Array.isArray(serieB)) return null;
  const a = serieA[serieA.length - 1];
  const b = serieB[serieB.length - 1];
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return a > b;
}

/* ------------------------------------------------------------------ */
/* MACD e bande di Bollinger                                           */
/* ------------------------------------------------------------------ */

/**
 * MACD: la linea è la media esponenziale veloce meno la lenta; la linea di
 * segnale è la media esponenziale della linea MACD su `segnale` periodi.
 *
 * Restituisce l'ultimo valore di ciascuna linea, o null se le candele non
 * bastano. Servono almeno `lenta + segnale - 1` valori: la linea MACD esiste
 * da `lenta - 1` in poi, e la sua media ha bisogno di `segnale` punti.
 */
export function macdUltimo(valori, veloce = 12, lenta = 26, segnale = 9) {
  if (![veloce, lenta, segnale].every((p) => Number.isInteger(p) && p > 0)) return null;
  if (veloce >= lenta) return null;
  if (!Array.isArray(valori) || valori.length < lenta + segnale - 1) return null;

  const serieVeloce = serieMediaEsponenziale(valori, veloce);
  const serieLenta = serieMediaEsponenziale(valori, lenta);

  const linea = [];
  for (let i = lenta - 1; i < valori.length; i++) {
    linea.push(serieVeloce[i] - serieLenta[i]);
  }

  const serieSegnale = serieMediaEsponenziale(linea, segnale);
  return {
    macd: linea[linea.length - 1],
    segnale: serieSegnale[serieSegnale.length - 1]
  };
}

/**
 * Bande di Bollinger: la media semplice delle ultime N chiusure, più e meno
 * `deviazioni` volte la loro deviazione standard. Restituisce l'ultimo valore
 * delle tre bande, o null se le candele non bastano.
 */
export function bandeUltime(valori, periodi = 20, deviazioni = 2) {
  if (!numeriValidi(valori, periodi) || !Number.isFinite(deviazioni) || deviazioni <= 0) return null;

  const ultimi = valori.slice(-periodi);
  const centrale = ultimi.reduce((somma, v) => somma + v, 0) / periodi;
  const varianza = ultimi.reduce((somma, v) => somma + (v - centrale) ** 2, 0) / periodi;
  const scarto = Math.sqrt(varianza) * deviazioni;

  return { inferiore: centrale - scarto, centrale, superiore: centrale + scarto };
}
