/**
 * lib/benchmark.js — quanto varrebbero oggi gli stessi soldi se avessi
 * comprato il primo giorno e non avessi più guardato.
 *
 * È la riga più importante di tutta la guida: **un numero verde non vuol dire
 * niente da solo**. +10% in un mese in cui il tuo mercato ha fatto +40% è una
 * perdita del 30% travestita da guadagno. La domanda non è mai «quanto ho
 * guadagnato», è sempre «quanto ho guadagnato in più del non fare niente».
 *
 * Due benchmark, perché rispondono a due domande diverse:
 *   · «mercato»  — lo stesso mercato che stai operando. La domanda dura.
 *   · «bitcoin»  — il mercato in generale. Serve a capire se un mese buono è
 *                  merito tuo o di una marea che ha alzato tutte le barche.
 *
 * Il prezzo di riferimento si registra UNA VOLTA e non si tocca mai più. Un
 * benchmark che riparte da adesso è, per costruzione, sempre uguale a adesso.
 */

/**
 * Registra il punto di partenza di un benchmark, se non c'è già.
 * Modifica lo stato; va chiamata dentro aggiornaStato().
 *
 * @returns {object|null} il riferimento registrato adesso, o null se c'era già
 */
export function registraRiferimento(stato, { ruolo, coppia, prezzo, strategia, momento }) {
  if (!stato.benchmark) stato.benchmark = {};
  if (stato.benchmark[ruolo]) return null;              // già fissato: non si tocca
  if (!Number.isFinite(prezzo) || prezzo <= 0) return null;

  const capitale = stato.configurazione.capitaleIniziale;
  const commissione = strategia.costi.commissionePercentoPerLato;

  // le stesse commissioni di ingresso, applicate una volta sola: anche chi
  // compra e basta paga per entrare
  const controvalore = capitale / (1 + commissione / 100);

  stato.benchmark[ruolo] = {
    coppia,
    prezzoRiferimento: prezzo,
    quantita: controvalore / prezzo,
    commissionePagata: controvalore * (commissione / 100),
    momento
  };
  return stato.benchmark[ruolo];
}

/**
 * Quanto vale oggi quel benchmark. Restituisce null se non è mai stato
 * registrato o se il prezzo non è utilizzabile: un buco nella serie è meno
 * dannoso di un valore falso.
 */
export function valoreBenchmark(stato, ruolo, prezzoOggi) {
  const riferimento = stato.benchmark?.[ruolo];
  if (!riferimento) return null;
  if (!Number.isFinite(prezzoOggi) || prezzoOggi <= 0) return null;
  return riferimento.quantita * prezzoOggi;
}

/** La variazione percentuale di un benchmark rispetto al capitale iniziale. */
export function variazioneBenchmark(stato, ruolo, prezzoOggi) {
  const valore = valoreBenchmark(stato, ruolo, prezzoOggi);
  if (valore === null) return null;
  const capitale = stato.configurazione.capitaleIniziale;
  return ((valore - capitale) / capitale) * 100;
}

/**
 * La variazione del mercato «puro» nel periodo, senza le commissioni: serve a
 * dire se il periodo è stato di salita, di discesa o laterale.
 */
export function variazioneMercatoNelPeriodo(stato, ruolo, prezzoOggi) {
  const riferimento = stato.benchmark?.[ruolo];
  if (!riferimento || !Number.isFinite(prezzoOggi) || prezzoOggi <= 0) return null;
  return ((prezzoOggi - riferimento.prezzoRiferimento) / riferimento.prezzoRiferimento) * 100;
}
