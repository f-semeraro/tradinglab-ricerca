/**
 * scripts/settimanali.js — costruisce lo storico delle domeniche (dati/settimanali/<COPPIA>.csv)
 * dalle candele giornaliere dell'archivio Kraken in dati/archivio/. Idempotente: aggiunge
 * solo le domeniche che mancano. Il giro, poi, aggiunge ogni settimana la domenica nuova.
 *
 *     node scripts/settimanali.js
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { aggiornaStoria } from "../lib/prova.js";
import { leggiStoriaSettimanale, scriviStoriaSettimanale, scriviAtomico } from "../lib/persistenza.js";

const RADICE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dentro = (...parti) => path.join(RADICE, ...parti);
const COPPIE = ["XBTUSD", "XBTEUR"];

for (const coppia of COPPIE) {
  const sorgente = dentro("dati", "archivio", `${coppia}_1440.csv`);
  if (!fs.existsSync(sorgente)) throw new Error(`manca ${path.relative(RADICE, sorgente)}`);
  const candele = fs.readFileSync(sorgente, "utf8").trim().split("\n").map((riga) => {
    const v = riga.split(",");
    return { momento: Number(v[0]), chiusura: Number(v[4]) };
  });
  const percorso = dentro("dati", "settimanali", `${coppia}.csv`);
  const esistente = leggiStoriaSettimanale(percorso);
  const storia = aggiornaStoria(esistente, candele);
  scriviStoriaSettimanale(percorso, storia);
  const senzaPrezzo = storia.filter((r) => r.chiusura === null).length;
  console.log(`${coppia}: ${storia.length} domeniche, dal ${storia[0]?.data} al ${storia.at(-1)?.data}, senza prezzo: ${senzaPrezzo}`);
}
