/**
 * scripts/b-portafoglio-universo.js — l'universo della prova in avanti, fissato alla partenza.
 *
 *     node scripts/b-portafoglio-universo.js 2026-11-02
 *
 * Si lancia una volta sola, alla partenza: il lunedì indicato, il primo dopo l'attivazione. Usa l'archivio Kraken
 * fino al 30 settembre 2026 e, per i giorni dopo, l'API di Kraken: una richiesta per coppia EUR, una al secondo.
 * Scrive candidati/b-portafoglio-universo.json e candidati/b-portafoglio.json (la strategia, da spostare in
 * strategie/ a mano con un commit), e lo storico iniziale in dati/settimanali/. Non attiva nulla.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

import { separaCoppia, costruisciUniverso } from "../lib/bUniverso.js";
import { candeleChiuse } from "../lib/kraken.js";
import { aggiornaStoria } from "../lib/prova.js";
import { scriviJson, scriviStoriaSettimanale } from "../lib/persistenza.js";

const RADICE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const daRadice = (...parti) => path.join(RADICE, ...parti);
const CARTELLA_ARCHIVIO = daRadice("dati", "archivio", "b-universo-2020");

const GIORNO = 86400000;
const PAUSA_MS = 1000; // Kraken è pubblico: una richiesta al secondo
const TOP = 20;
const MAX_MANCANTI = 30; // stessa tolleranza dell'estensione 2018–2020
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const sleep = (ms) => new Promise((risolvi) => setTimeout(risolvi, ms));

function mediana(valori) {
  if (valori.length === 0) return 0;
  const x = [...valori].sort((a, b) => a - b);
  const m = Math.floor(x.length / 2);
  return x.length % 2 ? x[m] : (x[m - 1] + x[m]) / 2;
}

/** Le candele giornaliere dell'archivio: momento (secondi), chiusura e volume. */
function leggiArchivio(nome) {
  const candele = [];
  const righe = fs.readFileSync(path.join(CARTELLA_ARCHIVIO, `${nome}_1440.csv`), "utf8").trim().split("\n");
  for (const riga of righe) {
    const v = riga.split(",");
    candele.push({ momento: Number(v[0]), chiusura: Number(v[4]), volume: Number(v[5]) });
  }
  return candele;
}

/** Unisce le candele, a parità di momento vince la più recente (quella dell'API). */
function unisci(...liste) {
  const perMomento = new Map();
  for (const lista of liste) for (const c of lista) perMomento.set(c.momento, c);
  return [...perMomento.values()].sort((a, b) => a.momento - b.momento);
}

async function main() {
  const partenza = process.argv[2];
  if (!partenza || !/^\d{4}-\d{2}-\d{2}$/.test(partenza)) {
    throw new Error("uso: node scripts/b-portafoglio-universo.js AAAA-MM-GG (il lunedì di partenza)");
  }
  if (new Date(`${partenza}T00:00:00Z`).getUTCDay() !== 1) throw new Error(`${partenza} non è un lunedì`);

  const inizioPartenza = Date.parse(partenza);
  const inizioStoria = inizioPartenza - 728 * GIORNO; // 104 settimane complete prima della partenza
  const inizioLiquidita = inizioPartenza - 365 * GIORNO; // 365 giorni prima della partenza
  const fineFinestra = inizioPartenza - GIORNO; // ultimo giorno incluso: il giorno prima della partenza

  const nomi = fs.readdirSync(CARTELLA_ARCHIVIO)
    .filter((f) => f.endsWith("_1440.csv"))
    .map((f) => f.replace(/_1440\.csv$/, ""))
    .filter((n) => separaCoppia(n)?.quota === "EUR");

  const riepilogo = [];
  const candelePerCoppia = new Map();
  const errori = [];
  for (const [i, nome] of nomi.entries()) {
    if (i > 0) await sleep(PAUSA_MS);
    const risposta = await candeleChiuse({ coppia: nome, intervalloMinuti: 1440, adessoMs: Date.now() });
    if (risposta.errore) errori.push(`${nome}: ${risposta.errore}`);
    const candele = unisci(leggiArchivio(nome), risposta.candele);
    candelePerCoppia.set(nome, candele);

    const presenti = new Set(candele.map((c) => iso(c.momento * 1000)));
    const mancanti = [];
    for (let t = inizioStoria; t <= fineFinestra; t += GIORNO) {
      if (!presenti.has(iso(t))) mancanti.push(iso(t));
    }
    const valori = candele
      .filter((c) => c.momento * 1000 >= inizioLiquidita && c.momento * 1000 <= fineFinestra && c.volume > 0)
      .map((c) => c.volume * c.chiusura);
    riepilogo.push({ nome, base: separaCoppia(nome).base, mancanti, mediana2020: mediana(valori) });
  }

  const considerate = costruisciUniverso(riepilogo, { top: TOP, soloEur: true, ammettiBitcoin: true, maxGiorniMancanti: MAX_MANCANTI });
  const incluse = considerate.filter((r) => r.incluso);
  if (incluse.length === 0) throw new Error("nessuna moneta supera la regola di universo");

  // lo storico settimanale iniziale: dall'archivio e dall'API, fino al giorno prima della partenza
  for (const r of incluse) {
    const storia = aggiornaStoria([], candelePerCoppia.get(r.coppia));
    scriviStoriaSettimanale(daRadice("dati", "settimanali", `${r.coppia}.csv`), storia);
  }

  const universo = {
    partenza,
    regole: {
      coppie: "EUR di Kraken, Bitcoin compreso; stablecoin, valute tradizionali e doppioni esclusi",
      storia: `al massimo ${MAX_MANCANTI} giorni senza candela nei 728 giorni prima della partenza`,
      liquidita: "le prime 20 per controvalore mediano giornaliero nei 365 giorni prima della partenza"
    },
    incluse: incluse.map((r) => ({ base: r.base, coppia: r.coppia, controvalorioMediano: r.mediana2020 })),
    considerate: considerate.map((r) => ({ base: r.base, coppia: r.coppia, controvalorioMediano: r.mediana2020, incluso: r.incluso, motivo: r.motivo })),
    richiesteAPI: { coppie: nomi.length, errori }
  };
  scriviJson(daRadice("candidati", "b-portafoglio-universo.json"), universo);

  const strategia = {
    nome: "b-portafoglio",
    tipo: "settimanale",
    portafoglio: true,
    variante: "B",
    settimaneDentro: 1,
    percentile: 0.8,
    metodoPercentile: "R7",
    lato: "lungo",
    partenza,
    coppie: incluse.map((r) => r.coppia),
    costi: { commissionePercentoPerLato: 0.1, slippagePercento: 0.05 },
    rischio: { quotaCapitalePercento: 100, posizioniMassime: 1, perditaMassimaGiornalieraPercento: 6 },
    fonte: "Liu e Tsyvinski (2021), NBER w24877; regola identica a liu-b. Prova in avanti su carta pre-registrata in registro/esperimenti.md.",
    stato: "candidata: non in esecuzione. Il giro la legge solo dopo lo spostamento in strategie/, fatto a mano con un commit."
  };
  scriviJson(daRadice("candidati", "b-portafoglio.json"), strategia);

  console.log(`Universo di ${incluse.length} monete scritto in candidati/b-portafoglio-universo.json (${crypto.createHash("sha256").update(JSON.stringify(strategia.coppie)).digest("hex").slice(0, 10)}).`);
  if (errori.length > 0) console.log(`Richieste all'API in errore: ${errori.length}.`);
}

main().catch((errore) => {
  console.error(`universo non costruito: ${errore.message}`);
  process.exitCode = 1;
});
