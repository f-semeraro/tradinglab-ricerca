/**
 * scripts/dati.js — scarica le candele giornaliere delle coppie di ricerca.
 *
 *     npm run dati
 *
 * Per ogni coppia in laboratorio.json (`coppieGiornaliere`) prende le ultime
 * candele giornaliere chiuse da Kraken e le scrive in
 * dati/storico/<COPPIA>-1440.csv, la stessa convenzione del backtest. Kraken ne restituisce al massimo 720:
 * la storia più lunga di 720 giorni va costruita nel tempo, rilanciando questo
 * comando prima che le candele più vecchie escano dalla finestra.
 *
 * Una coppia che non risponde non ferma le altre: si segnala, e il comando
 * termina con errore alla fine, così non si lavora su un insieme incompleto
 * senza saperlo.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import { candeleChiuse } from "../lib/kraken.js";
import { leggiJson, scriviAtomico } from "../lib/persistenza.js";

const RADICE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CARTELLA = path.join(RADICE, "dati", "storico");
const INTERVALLO = 1440;
const PAUSA_MS = 1000; // il pubblico di Kraken è gratuito: si chiede con calma

const giorni = (secondi) => new Date(secondi * 1000).toISOString().slice(0, 10);

/** Quante giornate mancano dentro la serie, senza contare le ultime candele chiuse fuori finestra. */
function giornateMancanti(candele) {
  let mancanti = 0;
  for (let i = 1; i < candele.length; i++) {
    const salto = (candele[i].momento - candele[i - 1].momento) / INTERVALLO / 60;
    if (salto > 1) mancanti += salto - 1;
  }
  return mancanti;
}

async function main() {
  const lab = leggiJson(path.join(RADICE, "laboratorio.json"));
  if (!lab || !Array.isArray(lab.coppieGiornaliere) || lab.coppieGiornaliere.length === 0) {
    throw new Error("laboratorio.json: manca l'elenco «coppieGiornaliere»");
  }

  const adessoMs = Date.now();
  const falliti = [];

  for (const coppia of lab.coppieGiornaliere) {
    const { candele, errore } = await candeleChiuse({ coppia, intervalloMinuti: INTERVALLO, adessoMs });

    if (errore || candele.length === 0) {
      falliti.push(`${coppia}: ${errore ?? "nessuna candela"}`);
      console.log(`${coppia.padEnd(10)} ERRORE: ${errore ?? "nessuna candela"}`);
      continue;
    }

    const righe = candele.map((c) =>
      [c.momento, c.apertura, c.massimo, c.minimo, c.chiusura, c.volume].join(",")
    );
    scriviAtomico(
      path.join(CARTELLA, `${coppia}-${INTERVALLO}.csv`),
      ["momento,apertura,massimo,minimo,chiusura,volume", ...righe].join("\n") + "\n"
    );

    const buchi = giornateMancanti(candele);
    console.log(
      `${coppia.padEnd(10)} ${String(candele.length).padStart(3)} giorni · ${giorni(candele[0].momento)} → ${giorni(candele.at(-1).momento)}` +
      (buchi > 0 ? ` · ${buchi} giorni mancanti` : "")
    );

    await new Promise((risolvi) => setTimeout(risolvi, PAUSA_MS));
  }

  if (falliti.length > 0) {
    throw new Error(`coppie non scaricate: ${falliti.join("; ")}`);
  }
}

main().catch((errore) => {
  console.error(`dati interrotti: ${errore.message}`);
  process.exitCode = 1;
});
