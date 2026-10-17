/**
 * lib/kraken.js — l'unico punto del laboratorio che parla con un exchange.
 *
 * Endpoint pubblici, nessuna chiave, nessun account. Non lancia mai: restituisce
 * `{ candele, errore }`, così il giro può dire che cosa è successo e terminare
 * in modo pulito, invece di morire in silenzio a metà.
 */

import { soloCandeleChiuse } from "./tempo.js";

const INDIRIZZO = "https://api.kraken.com/0/public/OHLC";
const TIMEOUT_MS = 15_000;

/**
 * Le righe grezze di Kraken diventano candele numeriche, ordinate.
 *
 * Kraken manda i prezzi come stringhe e l'ordine non è garantito. Le righe
 * guaste si scartano, e una riga con massimo sotto il minimo — due colonne
 * scambiate — si scarta: meglio accorgersene qui che nei risultati.
 */
export function normalizzaRigheOHLC(righe) {
  const candele = [];
  for (const riga of righe) {
    if (!Array.isArray(riga) || riga.length < 7) continue;
    const candela = {
      momento: Number(riga[0]),
      apertura: Number(riga[1]),
      massimo: Number(riga[2]),
      minimo: Number(riga[3]),
      chiusura: Number(riga[4]),
      volume: Number(riga[6])
    };
    if (!Object.values(candela).every(Number.isFinite)) continue;
    if (candela.massimo < candela.minimo) continue;
    candele.push(candela);
  }
  return candele.sort((a, b) => a.momento - b.momento);
}

/**
 * Le candele CHIUSE del mercato, dalla più vecchia alla più recente.
 *
 * `adessoMs` si passa da fuori: serve a scartare l'ultima candela, che è ancora
 * in corso. Kraken restituisce al massimo le ultime 720 candele.
 */
export async function candeleChiuse({ coppia, intervalloMinuti, adessoMs }) {
  const indirizzo = new URL(INDIRIZZO);
  indirizzo.searchParams.set("pair", coppia);
  indirizzo.searchParams.set("interval", String(intervalloMinuti));

  try {
    const risposta = await fetch(indirizzo, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "User-Agent": "tradinglab-ricerca (uso personale)" }
    });
    if (!risposta.ok) {
      return { candele: [], errore: `l'exchange ha risposto ${risposta.status}` };
    }

    const corpo = await risposta.json();
    if (Array.isArray(corpo.error) && corpo.error.length > 0) {
      return { candele: [], errore: corpo.error.join(", ") };
    }

    // la chiave dei dati è quella che non è «last»: Kraken può rinominare la coppia
    const chiave = Object.keys(corpo.result ?? {}).find((k) => k !== "last");
    const righe = chiave ? corpo.result[chiave] : null;
    if (!Array.isArray(righe)) {
      return { candele: [], errore: "risposta senza candele" };
    }

    const normalizzate = normalizzaRigheOHLC(righe);
    return { candele: soloCandeleChiuse(normalizzate, intervalloMinuti, adessoMs), errore: null };
  } catch (errore) {
    const messaggio = errore.name === "TimeoutError"
      ? "l'exchange non ha risposto in tempo"
      : errore.message;
    return { candele: [], errore: messaggio };
  }
}
