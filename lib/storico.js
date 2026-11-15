/**
 * lib/storico.js — le candele su file: il CSV di dati/storico/ e i file dell'archivio Kraken.
 *
 * Funzioni pure: ricevono il testo di un file e restituiscono candele, o il contrario. Le letture e
 * le scritture su disco stanno in lib/persistenza.js.
 *
 * Una candela è { momento, apertura, massimo, minimo, chiusura, volume }, con `momento` in secondi
 * UTC all'apertura. Le righe si separano sia con LF sia con CRLF: su Windows git può riscrivere i
 * fine riga, e un file di dati non deve cambiare significato per questo.
 */

export const INTESTAZIONE_CSV = "momento,apertura,massimo,minimo,chiusura,volume";

/** Le righe non vuote di un testo, con qualunque fine riga. */
export function righeDi(testo) {
  return testo.split(/\r?\n/).filter((riga) => riga.trim() !== "");
}

const candelaValida = (c) => Object.values(c).every(Number.isFinite);
const perMomento = (a, b) => a.momento - b.momento;

/**
 * Le candele di un CSV di dati/storico/. L'intestazione deve essere quella attesa: un file con le
 * colonne in un altro ordine si rifiuta, non si interpreta. Le righe guaste si scartano.
 */
export function candeleDaCsv(testo) {
  const [intestazione, ...righe] = righeDi(testo);
  if (intestazione?.trim() !== INTESTAZIONE_CSV) {
    throw new Error(`intestazione del CSV diversa da quella attesa (${INTESTAZIONE_CSV})`);
  }
  return righe
    .map((riga) => {
      const v = riga.split(",").map(Number);
      return { momento: v[0], apertura: v[1], massimo: v[2], minimo: v[3], chiusura: v[4], volume: v[5] };
    })
    .filter(candelaValida)
    .sort(perMomento);
}

/** Il testo del CSV per un elenco di candele, con l'intestazione e un a capo finale. */
export function csvDaCandele(candele) {
  const righe = candele.map((c) => [c.momento, c.apertura, c.massimo, c.minimo, c.chiusura, c.volume].join(","));
  return [INTESTAZIONE_CSV, ...righe].join("\n") + "\n";
}

/**
 * Le candele di un file dell'archivio Kraken (OHLCVT): senza intestazione, con le colonne
 * momento, apertura, massimo, minimo, chiusura, volume, numero di scambi.
 */
export function candeleDaArchivio(testo) {
  return righeDi(testo)
    .map((riga) => {
      const v = riga.split(",").map(Number);
      return { momento: v[0], apertura: v[1], massimo: v[2], minimo: v[3], chiusura: v[4], volume: v[5] };
    })
    .filter(candelaValida)
    .sort(perMomento);
}

/**
 * Più elenchi di candele in uno solo, in ordine di tempo. A parità di momento vince l'elenco che
 * viene dopo: così i dati nuovi correggono quelli vecchi, e quelli vecchi non spariscono.
 */
export function unisciCandele(...elenchi) {
  const perMomentoUnico = new Map();
  for (const elenco of elenchi) {
    for (const candela of elenco) perMomentoUnico.set(candela.momento, candela);
  }
  return [...perMomentoUnico.values()].sort(perMomento);
}

/** Quante candele mancano dentro una serie, dato l'intervallo in minuti. */
export function candeleMancanti(candele, intervalloMinuti) {
  const durata = intervalloMinuti * 60;
  let mancanti = 0;
  for (let i = 1; i < candele.length; i++) {
    const salto = Math.round((candele[i].momento - candele[i - 1].momento) / durata);
    if (salto > 1) mancanti += salto - 1;
  }
  return mancanti;
}
