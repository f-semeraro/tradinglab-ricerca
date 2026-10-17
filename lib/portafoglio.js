/**
 * lib/portafoglio.js — l'esecuzione su carta.
 *
 * Qui dentro ci sono le due righe che cambiano tutto: **commissioni e
 * slippage**. Senza, ogni numero di questo sistema è ottimista, e la sorpresa
 * arriva dopo, sempre nella stessa direzione.
 *
 * Con i valori di partenza (0,26% per lato + 0,05% di slippage) ogni operazione
 * completa parte da circa −0,62% prima ancora che il mercato si muova.
 *
 * Le funzioni qui **modificano lo stato che ricevono**: vanno chiamate dentro
 * `aggiornaStato()` dello store, che rilegge da disco e riscrive in modo
 * atomico. Non chiamarle su una copia dello stato tenuta in memoria.
 */

export class EsecuzioneImpossibile extends Error {
  constructor(messaggio) {
    super(messaggio);
    this.name = "EsecuzioneImpossibile";
  }
}

/** Il prezzo che ottieni davvero: sempre peggiore di quello che vedevi. */
export function prezzoConSlippage(prezzoMercato, slippagePercento, azione) {
  const fattore = azione === "compra"
    ? 1 + slippagePercento / 100   // in acquisto paghi di più
    : 1 - slippagePercento / 100;  // in vendita incassi di meno
  return prezzoMercato * fattore;
}

/* ------------------------------------------------------------------ */
/* apertura                                                            */
/* ------------------------------------------------------------------ */

/**
 * Apre una posizione sul portafoglio simulato.
 *
 * @param {object} stato        lo stato, che viene modificato
 * @param {object} argomenti
 * @param {number} argomenti.prezzoMercato  il prezzo di adesso
 * @param {object} argomenti.strategia      config/strategia.json
 * @param {object} argomenti.segnale        il segnale confermato
 * @param {number} argomenti.momento        secondi UTC
 * @param {number} argomenti.candela        id della candela di ingresso
 */
export function apriPosizione(stato, { prezzoMercato, strategia, segnale, momento, candela }) {
  if (stato.posizione) {
    throw new EsecuzioneImpossibile("C'è già una posizione aperta: questa build ne tiene una alla volta.");
  }
  if (!Number.isFinite(prezzoMercato) || prezzoMercato <= 0) {
    throw new EsecuzioneImpossibile(`Prezzo di mercato non utilizzabile (${prezzoMercato}).`);
  }

  const { commissionePercentoPerLato, slippagePercento } = strategia.costi;
  const quota = strategia.rischio.quotaCapitalePercento;

  const capitaleImpegnato = stato.capitale * (quota / 100);
  if (!Number.isFinite(capitaleImpegnato) || capitaleImpegnato <= 0) {
    throw new EsecuzioneImpossibile(
      `Capitale non sufficiente per aprire: disponibile ${stato.capitale}, quota configurata ${quota}%.`
    );
  }

  const prezzoEsecuzione = prezzoConSlippage(prezzoMercato, slippagePercento, "compra");

  // La commissione si paga SOPRA il controvalore, quindi il controvalore vero
  // è quello che, sommata la sua commissione, sta dentro il capitale
  // impegnato. Senza questa riga, con quota 100% il capitale andrebbe sotto zero.
  const controvalore = capitaleImpegnato / (1 + commissionePercentoPerLato / 100);
  const commissione = controvalore * (commissionePercentoPerLato / 100);
  const quantita = controvalore / prezzoEsecuzione;

  if (!Number.isFinite(quantita) || quantita <= 0) {
    throw new EsecuzioneImpossibile(`La quantità calcolata non ha senso (${quantita}): non eseguo.`);
  }
  const capitaleDopo = stato.capitale - (controvalore + commissione);
  if (!Number.isFinite(capitaleDopo) || capitaleDopo < -1e-9) {
    throw new EsecuzioneImpossibile(
      `L'operazione porterebbe il capitale sotto zero (${capitaleDopo}): non eseguo.`
    );
  }

  stato.capitale = Math.max(0, capitaleDopo);
  stato.posizione = {
    mercato: segnale?.mercato ?? stato.configurazione.mercato,
    prezzoIngresso: prezzoEsecuzione,
    prezzoMercatoIngresso: prezzoMercato,
    quantita,
    controvaloreIngresso: controvalore,
    commissioneIngresso: commissione,
    momentoIngresso: momento,
    candelaIngresso: candela,
    motivoIngresso: segnale?.motivo ?? null,
    condizioniIngresso: segnale?.condizioni ?? null,
    segnaleId: segnale?.id ?? null
  };

  return stato.posizione;
}

/* ------------------------------------------------------------------ */
/* chiusura                                                            */
/* ------------------------------------------------------------------ */

/**
 * Chiude la posizione aperta e scrive l'operazione nello storico.
 * Restituisce l'operazione registrata.
 */
export function chiudiPosizione(stato, { prezzoMercato, strategia, segnale, momento }) {
  const posizione = stato.posizione;
  if (!posizione) {
    throw new EsecuzioneImpossibile("Non c'è nessuna posizione da chiudere.");
  }
  if (!Number.isFinite(prezzoMercato) || prezzoMercato <= 0) {
    throw new EsecuzioneImpossibile(`Prezzo di mercato non utilizzabile (${prezzoMercato}).`);
  }

  const { commissionePercentoPerLato, slippagePercento } = strategia.costi;
  const prezzoEsecuzione = prezzoConSlippage(prezzoMercato, slippagePercento, "vendi");

  const controvalore = posizione.quantita * prezzoEsecuzione;
  const commissione = controvalore * (commissionePercentoPerLato / 100);
  const incasso = controvalore - commissione;

  if (!Number.isFinite(incasso) || incasso < 0) {
    throw new EsecuzioneImpossibile(`L'incasso calcolato non ha senso (${incasso}): non eseguo.`);
  }

  const costoTotaleIngresso = posizione.controvaloreIngresso + posizione.commissioneIngresso;
  const risultatoEuro = incasso - costoTotaleIngresso;
  const risultatoPercento = (risultatoEuro / costoTotaleIngresso) * 100;

  stato.capitale = stato.capitale + incasso;

  const operazione = {
    numero: (stato.operazioni?.length ?? 0) + 1,
    mercato: posizione.mercato,
    quantita: posizione.quantita,

    prezzoIngresso: posizione.prezzoIngresso,
    prezzoUscita: prezzoEsecuzione,
    prezzoMercatoIngresso: posizione.prezzoMercatoIngresso,
    prezzoMercatoUscita: prezzoMercato,

    momentoIngresso: posizione.momentoIngresso,
    momentoUscita: momento,
    durataSecondi: momento - posizione.momentoIngresso,

    risultatoEuro,
    risultatoPercento,
    commissioniTotali: posizione.commissioneIngresso + commissione,
    commissioneIngresso: posizione.commissioneIngresso,
    commissioneUscita: commissione,

    motivoIngresso: posizione.motivoIngresso,
    motivoUscita: segnale?.motivo ?? null,
    condizioniIngresso: posizione.condizioniIngresso,
    condizioniUscita: segnale?.condizioni ?? null,
    uscitaScattata: segnale?.condizioni?.scattata ?? null
  };

  if (!Array.isArray(stato.operazioni)) stato.operazioni = [];
  stato.operazioni.push(operazione);
  stato.posizione = null;

  return operazione;
}

/* ------------------------------------------------------------------ */
/* valore corrente                                                     */
/* ------------------------------------------------------------------ */

/**
 * Quanto vale adesso tutto il portafoglio: il capitale libero più il
 * controvalore della posizione aperta, se c'è.
 *
 * Nota: qui la posizione è valutata al prezzo di mercato **senza** togliere i
 * costi di uscita. È il valore «sulla carta», quello che si mette nella curva;
 * i costi entrano quando l'operazione si chiude davvero.
 */
export function valorePortafoglio(stato, prezzoMercato) {
  const libero = Number.isFinite(stato.capitale) ? stato.capitale : 0;
  if (!stato.posizione) return libero;
  if (!Number.isFinite(prezzoMercato) || prezzoMercato <= 0) return null;
  return libero + stato.posizione.quantita * prezzoMercato;
}

/** Il risultato non ancora realizzato della posizione aperta. */
export function risultatoNonRealizzato(posizione, prezzoMercato) {
  if (!posizione || !Number.isFinite(prezzoMercato) || prezzoMercato <= 0) return null;
  const costoTotaleIngresso = posizione.controvaloreIngresso + posizione.commissioneIngresso;
  const controvalore = posizione.quantita * prezzoMercato;
  const euro = controvalore - costoTotaleIngresso;
  return { euro, percento: (euro / costoTotaleIngresso) * 100 };
}
