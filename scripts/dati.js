/**
 * scripts/dati.js — scarica le candele giornaliere delle coppie di ricerca.
 *
 *     npm run dati
 *
 * Per ogni coppia in laboratorio.json (`coppieGiornaliere`) prende le ultime candele giornaliere
 * chiuse da Kraken e le AGGIUNGE a dati/storico/<COPPIA>-1440.csv, la stessa convenzione del
 * backtest. Kraken ne restituisce al massimo 720: le candele già nel file restano, quelle nuove si
 * aggiungono, e a parità di giorno vale il dato appena scaricato. La storia più lunga di 720 giorni
 * si costruisce così, rilanciando il comando prima che le candele più vecchie escano dalla finestra
 * di Kraken; se passa più tempo, il buco resta e viene contato.
 *
 * Una coppia che non risponde non ferma le altre: si segnala, e il comando termina con errore alla
 * fine, così non si lavora su un insieme incompleto senza saperlo.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { candeleChiuse } from "../lib/kraken.js";
import { unisciCandele, candeleMancanti } from "../lib/storico.js";
import { dataISO } from "../lib/formato.js";
import { leggiJson, leggiCandele, scriviCandele } from "../lib/persistenza.js";

const RADICE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CARTELLA = path.join(RADICE, "dati", "storico");
const INTERVALLO = 1440;
const PAUSA_MS = 1000; // il pubblico di Kraken è gratuito: si chiede con calma

const giorno = (candela) => dataISO(candela.momento * 1000);

async function main() {
  const lab = leggiJson(path.join(RADICE, "laboratorio.json"));
  if (!lab || !Array.isArray(lab.coppieGiornaliere) || lab.coppieGiornaliere.length === 0) {
    throw new Error("laboratorio.json: manca l'elenco «coppieGiornaliere»");
  }

  const adessoMs = Date.now();
  const falliti = [];

  for (const coppia of lab.coppieGiornaliere) {
    const { candele: scaricate, errore } = await candeleChiuse({ coppia, intervalloMinuti: INTERVALLO, adessoMs });

    if (errore || scaricate.length === 0) {
      falliti.push(`${coppia}: ${errore ?? "nessuna candela"}`);
      console.log(`${coppia.padEnd(10)} ERRORE: ${errore ?? "nessuna candela"}`);
      continue;
    }

    const percorso = path.join(CARTELLA, `${coppia}-${INTERVALLO}.csv`);
    const precedenti = fs.existsSync(percorso) ? leggiCandele(percorso) : [];
    const candele = unisciCandele(precedenti, scaricate);
    scriviCandele(percorso, candele);

    const buchi = candeleMancanti(candele, INTERVALLO);
    console.log(
      `${coppia.padEnd(10)} ${String(candele.length).padStart(4)} giorni (${candele.length - precedenti.length} nuovi) · ` +
      `${giorno(candele[0])} → ${giorno(candele.at(-1))}` +
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
