/**
 * lib/sessioni.js — i rendimenti giornalieri dello studio Shen, Urquhart e Wang (2022).
 *
 * Funzioni pure: le candele e il fuso arrivano da fuori.
 *
 * Convenzioni:
 *   · il prezzo all'ora X è la chiusura della candela da 15 minuti che termina a X;
 *     nel file, la candela è identificata dal suo inizio, cioè X − 900 secondi;
 *   · le ore sono locali nel fuso passato (America/New_York per lo studio), con
 *     l'ora legale: lo scostamento dal testo, che scrive «EST», è dichiarato nella
 *     pre-registrazione.
 */

const DURATA_15_MIN = 900;

/** Minuti di scostamento tra ora locale e UTC in un dato istante, nel fuso dato. */
export function offsetMinuti(istanteSec, fuso) {
  const parti = new Intl.DateTimeFormat("en-US", {
    timeZone: fuso,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).formatToParts(new Date(istanteSec * 1000));
  const v = Object.fromEntries(parti.map((p) => [p.type, p.value]));
  const locale = Date.UTC(+v.year, +v.month - 1, +v.day, +v.hour, +v.minute, +v.second) / 1000;
  return Math.round((locale - istanteSec) / 60);
}

/**
 * L'istante UTC (in secondi) corrispondente a un'ora locale di un giorno dato,
 * con l'ora legale del fuso. Ad esempio, le 9:45 di New York sono le 13:45 UTC
 * con l'ora legale americana, le 14:45 senza.
 */
export function istanteUTC(dataISO, ore, minuti, fuso) {
  const [anno, mese, giorno] = dataISO.split("-").map(Number);
  const nominale = Date.UTC(anno, mese - 1, giorno, ore, minuti) / 1000;
  let istante = nominale;
  // due passate bastano: l'offset cambia solo intorno al passaggio dell'ora legale
  for (let i = 0; i < 2; i++) {
    const corretto = nominale - offsetMinuti(istante, fuso) * 60;
    if (corretto === istante) break;
    istante = corretto;
  }
  return istante;
}

/** I giorni tra due date ISO (incluse), in ordine, come stringhe AAAA-MM-GG. */
export function giorniISO(da, a) {
  const giorni = [];
  const [ya, ma, ga] = da.split("-").map(Number);
  const fine = Date.UTC(...a.split("-").map((v, i) => (i === 1 ? Number(v) - 1 : Number(v))));
  for (let t = Date.UTC(ya, ma - 1, ga); t <= fine; t += 86400000) {
    giorni.push(new Date(t).toISOString().slice(0, 10));
  }
  return giorni;
}

/** Il giorno precedente, come data ISO. */
export function giornoPrecedente(dataISO) {
  const [a, m, g] = dataISO.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, g) - 86400000).toISOString().slice(0, 10);
}

/** La mappa «inizio candela → chiusura» da cui leggere i prezzi alle ore X. */
export function mappaChiusure(candele) {
  return new Map(candele.map((c) => [c.momento, c.chiusura]));
}

/** Il prezzo alle ore X: la chiusura della candela che termina a X, o null se manca. */
function prezzoAlle(mappa, istante) {
  const chiusura = mappa.get(istante - DURATA_15_MIN);
  return chiusura === undefined ? null : chiusura;
}

/**
 * I tre rendimenti dello studio per un giorno, con i prezzi alle ore della
 * pre-registrazione. Restituisce null per quello che manca, mai un numero
 * inventato.
 *
 *   rONFH = P(9:45, t) / P(17:00, t−1) − 1
 *   rSLH  = P(16:30, t) / P(16:00, t) − 1
 *   rLH   = P(17:00, t) / P(16:30, t) − 1   (il rendimento dell'operazione)
 */
export function rendimentiGiorno(mappa, dataISO, fuso) {
  const precedente = giornoPrecedente(dataISO);
  const p = (data, ore, minuti) => {
    const istante = istanteUTC(data, ore, minuti, fuso);
    return prezzoAlle(mappa, istante);
  };
  const p945 = p(dataISO, 9, 45);
  const p1700Ieri = p(precedente, 17, 0);
  const p1600 = p(dataISO, 16, 0);
  const p1630 = p(dataISO, 16, 30);
  const p1700 = p(dataISO, 17, 0);

  const rapporto = (a, b) => (a === null || b === null || b <= 0 ? null : a / b - 1);
  return {
    data: dataISO,
    rONFH: rapporto(p945, p1700Ieri),
    rSLH: rapporto(p1630, p1600),
    rLH: rapporto(p1700, p1630)
  };
}

/**
 * Il segno del segnale di ciascuna variante, dato il giorno. Restituisce +1
 * (lungo), −1 (corto) oppure 0 (fuori), secondo le equazioni 7 e 8 dello studio:
 *   1. inizio sessione: lungo se rONFH > 0, corto altrimenti;
 *   2. penultima mezz'ora: lungo se rSLH < 0, corto altrimenti;
 *   3. combinata: lungo se rONFH > 0 e rSLH < 0; corto se rONFH < 0 e rSLH > 0; altrimenti fuori.
 */
export function segnoVariante(variante, giorno) {
  const { rONFH, rSLH } = giorno;
  if (variante === "inizio") return rONFH > 0 ? 1 : -1;
  if (variante === "penultima") return rSLH < 0 ? 1 : -1;
  if (variante === "combinata") {
    if (rONFH > 0 && rSLH < 0) return 1;
    if (rONFH < 0 && rSLH > 0) return -1;
    return 0;
  }
  throw new Error(`variante sconosciuta: ${variante}`);
}

/** I giorni in cui la variante poteva decidere: tutti gli ingressi che servono sono presenti. */
export function eleggibile(variante, giorno) {
  if (giorno.rLH === null) return false;
  if (variante === "inizio") return giorno.rONFH !== null;
  if (variante === "penultima") return giorno.rSLH !== null;
  if (variante === "combinata") return giorno.rONFH !== null && giorno.rSLH !== null;
  throw new Error(`variante sconosciuta: ${variante}`);
}
