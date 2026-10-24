/**
 * scripts/b-giornaliera-universo.js — la storia giornaliera e la strategia della variante «B giornaliera», alla partenza.
 *
 *     node scripts/b-giornaliera-universo.js
 *
 * Si lancia una volta sola, il lunedì 26 ottobre 2026, dopo scripts/b-portafoglio-universo.js. Non seleziona nulla:
 * legge le monete da candidati/b-portafoglio-universo.json e, se il file non c'è o è di un'altra data, si ferma.
 * Per ogni moneta costruisce la storia giornaliera: archivio Kraken più una richiesta API (le ultime 720 candele).
 * Scrive dati/giornaliere/<COPPIA>.csv, la strategia in candidati/b-giornaliera.json e
 * report/b-giornaliera-storia.md con le richieste dichiarate. Non attiva nulla.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { candeleChiuse } from "../lib/kraken.js";
import { aggiornaStoriaGiornaliera, problemiGiornaliera } from "../lib/giornalieraProva.js";
import { scriviAtomico, scriviJson, scriviStoriaSettimanale } from "../lib/persistenza.js";

const RADICE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const daRadice = (...parti) => path.join(RADICE, ...parti);
const CARTELLA_ARCHIVIO = daRadice("dati", "archivio", "b-universo-2020");

const PARTENZA = "2026-10-26";
const PAUSA_MS = 1000; // Kraken è pubblico: una richiesta al secondo
const GIORNO = 86400000;
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const sleep = (ms) => new Promise((risolvi) => setTimeout(risolvi, ms));

/** Le candele giornaliere dell'archivio come { momento in secondi, chiusura }, o null se la moneta non è in archivio. */
function leggiArchivio(coppia) {
  const percorso = path.join(CARTELLA_ARCHIVIO, `${coppia}_1440.csv`);
  if (!fs.existsSync(percorso)) return null;
  return fs.readFileSync(percorso, "utf8").trim().split("\n").map((riga) => {
    const v = riga.split(",");
    return { momento: Number(v[0]), chiusura: Number(v[4]) };
  });
}

async function main() {
  const universoPath = daRadice("candidati", "b-portafoglio-universo.json");
  if (!fs.existsSync(universoPath)) {
    throw new Error("manca candidati/b-portafoglio-universo.json: lancia prima scripts/b-portafoglio-universo.js per il 26 ottobre 2026");
  }
  const universo = JSON.parse(fs.readFileSync(universoPath, "utf8"));
  if (universo.partenza !== PARTENZA) throw new Error(`l'universo è per ${universo.partenza}, non per ${PARTENZA}`);
  if (fs.existsSync(daRadice("candidati", "b-giornaliera.json"))) {
    throw new Error("candidati/b-giornaliera.json esiste già: la storia si costruisce una volta sola");
  }

  const coppie = universo.incluse.map((r) => r.coppia);
  const strategia = {
    nome: "b-giornaliera",
    tipo: "giornaliera",
    variante: "B",
    partenza: PARTENZA,
    percentile: 0.8,
    metodoPercentile: "R7",
    lato: "lungo",
    coppie,
    costi: { commissionePercentoPerLato: 0.1, slippagePercento: 0.05 },
    fonte: "Liu e Tsyvinski (2021), NBER w24877; variante «B giornaliera» della regola B. Prova in avanti su carta pre-registrata in registro/esperimenti.md.",
    stato: "candidata: non in esecuzione. Il giro la legge solo dopo lo spostamento in strategie/, fatto a mano con un commit."
  };
  const problemi = problemiGiornaliera(strategia);
  if (problemi.length > 0) throw new Error(`strategia non valida: ${problemi.join("; ")}`);
  if (coppie.length === 0) throw new Error("l'universo non ha monete incluse");

  const oggi = iso(Date.now());
  const righe = [];
  const errori = [];
  for (const [i, coppia] of coppie.entries()) {
    if (i > 0) await sleep(PAUSA_MS);
    const archivio = leggiArchivio(coppia);
    const risposta = await candeleChiuse({ coppia, intervalloMinuti: 1440, adessoMs: Date.now() });
    if (risposta.errore) errori.push(`${coppia}: ${risposta.errore}`);
    if (!archivio && risposta.candele.length === 0) throw new Error(`${coppia}: né archivio né API, storia non costruita`);

    const dallArchivio = aggiornaStoriaGiornaliera([], archivio ?? []);
    const storia = aggiornaStoriaGiornaliera(dallArchivio, risposta.candele);
    scriviStoriaSettimanale(daRadice("dati", "giornaliere", `${coppia}.csv`), storia);
    // la richiesta di oggi è già fatta: il giro non ne fa un'altra questo stesso giorno
    scriviJson(daRadice("dati", "giornaliere", `${coppia}.richieste.json`), { ultimoTentativo: oggi });

    const primo = storia[0]?.data ?? "—";
    const ultimo = storia.at(-1)?.data ?? "—";
    const giorniTotali = storia.length === 0 ? 0 : Math.round((Date.parse(ultimo) - Date.parse(primo)) / GIORNO) + 1;
    const mancanti = giorniTotali - storia.length;
    righe.push(
      `| ${coppia} | ${archivio ? "sì" : "no, solo API"} | ${primo} | ${ultimo} | ${storia.length} | ${mancanti} | ${risposta.errore ?? "ok"} |`
    );
  }

  scriviJson(daRadice("candidati", "b-giornaliera.json"), strategia);
  const report = [
    "# Prova in avanti della variante «B giornaliera»: storia di partenza",
    "",
    `Costruita il ${oggi} per la partenza di lunedì ${PARTENZA}. Una richiesta API per coppia, dichiarata qui. ` +
      "Nessuna selezione: le monete sono quelle di candidati/b-portafoglio-universo.json.",
    "",
    "| moneta | in archivio | primo dato | ultimo dato | giorni con candela | giorni mancanti | richiesta API |",
    "|---|---|---|---|---:|---:|---|",
    ...righe,
    "",
    errori.length > 0
      ? `Richieste in errore: ${errori.length}. Le candele mancanti arrivano con le richieste dei giorni successivi, che restituiscono le ultime 720.`
      : "Nessuna richiesta in errore.",
    "",
    "Le monete senza archivio hanno una storia corta: il percentile usa solo i dati disponibili, e lo si legge con cautela.",
    ""
  ];
  scriviAtomico(daRadice("report", "b-giornaliera-storia.md"), report.join("\n"));
  console.log(`Storia giornaliera di ${coppie.length} monete in dati/giornaliere/; strategia in candidati/b-giornaliera.json. Richieste in errore: ${errori.length}.`);
}

main().catch((errore) => {
  console.error(`storia non costruita: ${errore.message}`);
  process.exitCode = 1;
});
