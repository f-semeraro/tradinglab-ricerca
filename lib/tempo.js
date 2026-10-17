/**
 * lib/tempo.js — tutte le domande sul tempo si fanno qui.
 *
 * Mai calcolare a mano, da qualche altra parte, a quale candela appartiene un
 * momento: è l'errore che non produce nessun messaggio d'errore e ti falsifica
 * i numeri per settimane.
 *
 * Regola che attraversa tutto il file: **i calcoli sono in UTC**, perché i
 * timestamp dell'exchange sono in UTC. Il fuso dell'utente serve soltanto a
 * scrivere «ieri alle 23:40» sotto un'operazione.
 */

/** Secondi in un minuto. Scritto una volta, per non moltiplicare per 60 ovunque. */
const SECONDI_PER_MINUTO = 60;

/**
 * Il tempo e il fuso non si leggono da soli: si passano da fuori. Un default
 * come `Date.now()` farebbe dipendere il risultato dal giorno in cui si esegue
 * il codice, e lo stesso comando darebbe risposte diverse a settimane di
 * distanza. Se manca, si lancia un errore: meglio fermarsi che decidere su un
 * orologio che nessuno ha guardato.
 */
function richiesto(valore, nome) {
  if (valore === undefined || valore === null) {
    throw new TypeError(`${nome} va passato esplicitamente: il tempo non si legge da solo`);
  }
  return valore;
}

/**
 * Dato un momento e la durata dell'intervallo, l'identificativo della candela
 * che lo contiene: il momento di apertura di quella candela, in secondi UTC,
 * arrotondato per difetto sul multiplo dell'intervallo.
 *
 * @param {number} momentoSecondi  secondi UTC
 * @param {number} intervalloMinuti durata di una candela, in minuti
 * @returns {number} apertura della candela, in secondi UTC
 */
export function idCandela(momentoSecondi, intervalloMinuti) {
  if (!Number.isFinite(momentoSecondi)) {
    throw new TypeError(`idCandela: momento non valido (${momentoSecondi})`);
  }
  if (!Number.isFinite(intervalloMinuti) || intervalloMinuti <= 0) {
    throw new TypeError(`idCandela: intervallo non valido (${intervalloMinuti})`);
  }
  const durata = intervalloMinuti * SECONDI_PER_MINUTO;
  return Math.floor(momentoSecondi / durata) * durata;
}

/** L'identificativo della candela in corso in `adessoMs` (millisecondi). */
export function candelaInCorso(intervalloMinuti, adessoMs) {
  return idCandela(Math.floor(richiesto(adessoMs, "adessoMs") / 1000), intervalloMinuti);
}

/**
 * L'identificativo dell'ultima candela **chiusa**: quella prima di quella in
 * corso. È il numero che il ciclo confronta a ogni giro per sapere se c'è
 * qualcosa di nuovo da valutare.
 */
export function ultimaCandelaChiusa(intervalloMinuti, adessoMs) {
  return candelaInCorso(intervalloMinuti, adessoMs) - intervalloMinuti * SECONDI_PER_MINUTO;
}

/**
 * Dato un elenco di candele, scarta l'ultima se è ancora in corso — cioè se la
 * sua apertura coincide con la candela che contiene il momento attuale.
 *
 * Tutto il sistema lavora solo su candele chiuse: il «prezzo di chiusura» di
 * una candela aperta è semplicemente il prezzo di adesso, e cambia mentre lo
 * guardi.
 *
 * @param {Array<{momento:number}>} candele ordinate dalla più vecchia alla più recente
 */
export function soloCandeleChiuse(candele, intervalloMinuti, adessoMs) {
  if (!Array.isArray(candele) || candele.length === 0) return [];
  const inCorso = candelaInCorso(intervalloMinuti, adessoMs);
  const ultima = candele[candele.length - 1];
  if (ultima && idCandela(ultima.momento, intervalloMinuti) >= inCorso) {
    return candele.slice(0, -1);
  }
  return candele.slice();
}

/**
 * «2026-03-01» → i secondi UTC della mezzanotte di quel giorno.
 *
 * Serve alle finestre del backtest, che si dichiarano in UTC come tutti i
 * calcoli di questo progetto. Una data scritta male — «2026-13-01», «2026-02-30»
 * — restituisce null invece di scivolare nel mese dopo come farebbe Date.UTC
 * da solo: una finestra spostata di un giorno in silenzio è il genere di
 * errore che non si trova più.
 */
export function giornoUTCInSecondi(testo) {
  if (typeof testo !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(testo)) return null;
  const [anno, mese, giorno] = testo.split("-").map(Number);
  const data = new Date(Date.UTC(anno, mese - 1, giorno));
  if (
    data.getUTCFullYear() !== anno ||
    data.getUTCMonth() !== mese - 1 ||
    data.getUTCDate() !== giorno
  ) {
    return null;
  }
  return data.getTime() / 1000;
}

/* ------------------------------------------------------------------ */
/* da qui in giù si mostra, non si calcola                             */
/* ------------------------------------------------------------------ */

/**
 * Formatta un momento nel fuso orario dell'utente. **Solo per mostrare le date
 * a schermo** — mai per fare calcoli.
 *
 * `conAnno` serve al backtest, che può guardare due anni di storia: senza
 * l'anno, «19 feb» e «01 feb» sembrano fuori ordine quando in realtà sono di
 * anni diversi, e ti convinci che l'elenco delle operazioni sia sbagliato.
 * Nella dashboard dal vivo l'anno è rumore e resta spento.
 *
 * @param {number} momentoSecondi secondi UTC
 */
export function formattaMomento(momentoSecondi, fuso, { conAnno = false } = {}) {
  const data = new Date(momentoSecondi * 1000);
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: richiesto(fuso, "fuso"),
    day: "2-digit",
    month: "short",
    ...(conAnno ? { year: "numeric" } : {}),
    hour: "2-digit",
    minute: "2-digit"
  }).format(data);
}

/** Solo l'ora, per le righe di log e i segnali. */
export function formattaOra(momentoSecondi, fuso) {
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: richiesto(fuso, "fuso"),
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(momentoSecondi * 1000));
}

/**
 * A quale giornata appartiene un momento, nel fuso dell'utente, come
 * «2026-08-27».
 *
 * Serve a raggruppare la performance giornaliera: usare la data UTC farebbe
 * finire i trade delle 23:40 di Roma nella barra del giorno dopo.
 */
export function giornoLocale(momentoSecondi, fuso) {
  const parti = new Intl.DateTimeFormat("en-CA", {
    timeZone: richiesto(fuso, "fuso"),
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(momentoSecondi * 1000));
  return parti; // en-CA formatta già come AAAA-MM-GG
}

/** Etichetta breve di una giornata, per l'asse del grafico a barre. */
export function etichettaGiorno(momentoSecondi, fuso) {
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: richiesto(fuso, "fuso"),
    weekday: "short",
    day: "numeric"
  }).format(new Date(momentoSecondi * 1000));
}

/** Durata leggibile fra due momenti, per lo storico: «3 h 15 m». */
export function durataLeggibile(daSecondi, aSecondi) {
  const totale = Math.max(0, Math.round(aSecondi - daSecondi));
  const ore = Math.floor(totale / 3600);
  const minuti = Math.round((totale % 3600) / 60);
  if (ore === 0) return `${minuti} m`;
  return `${ore} h ${String(minuti).padStart(2, "0")} m`;
}
