/**
 * lib/politicaRichieste.js — quali richieste a Kraken fa il giro per una coppia settimanale.
 *
 * Regola della pre-registrazione: al massimo una richiesta giornaliera e una oraria per coppia a settimana.
 * La settimana è identificata dalla domenica chiusa a cui si riferisce:
 *   · giornaliera: quando la storia settimanale non arriva ancora a quella domenica (la sua candela si chiude
 *     il lunedì alle 00:00 UTC);
 *   · oraria: dopo le 01:00 UTC del lunedì, per la candela 00:00–01:00, una sola volta per settimana.
 */

const GIORNO = 86400000;
const ORA = 3600000;

const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const inizioGiorno = (ms) => Math.floor(ms / GIORNO) * GIORNO;

/** La domenica chiusa più recente: la sua candela giornaliera si chiude il lunedì alle 00:00 UTC. */
export function domenicaChiusa(adessoMs) {
  let x = inizioGiorno(adessoMs) - GIORNO;
  while (new Date(x).getUTCDay() !== 0) x -= GIORNO;
  return iso(x);
}

/**
 * Le richieste da fare adesso. ultimaGiornaliera: la domenica per cui la richiesta giornaliera è già
 * andata a buon fine; ultimaOraria: la domenica per cui la candela oraria del lunedì è già stata ottenuta.
 * Una richiesta che fallisce non viene registrata: si ripete al giro successivo.
 */
export function richiesteDaFare({ adessoMs, ultimaGiornaliera, ultimaOraria }) {
  const domenica = domenicaChiusa(adessoMs);
  const lunedi = Date.parse(domenica) + GIORNO;
  return {
    domenica,
    giornaliera: ultimaGiornaliera !== domenica,
    oraria: adessoMs >= lunedi + ORA && ultimaOraria !== domenica
  };
}
