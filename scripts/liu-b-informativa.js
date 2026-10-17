/**
 * scripts/liu-b-informativa.js — verifica informativa di B sui dati messi da parte (da luglio 2026
 * all'ultima domenica chiusa). Nessun giudizio: solo quante operazioni e che risultato.
 *
 *     node scripts/liu-b-informativa.js
 *
 * Rigioca la prova, settimana per settimana, con la stessa logica del giro (lib/prova.js), usando
 * solo i dati noti in ogni momento. Non scrive stato né storico: solo una riga nel registro.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { candeleChiuse } from "../lib/kraken.js";
import { aggiornaStoria, passoPerCoppia, nuovoStatoProva, decisioniSettimanali, improntaRegola } from "../lib/prova.js";
import { calcolaMetriche } from "../lib/metriche.js";
import { drawdownMassimo } from "../lib/settimane.js";
import { leggiJson, leggiStoriaSettimanale } from "../lib/persistenza.js";

const RADICE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dentro = (...parti) => path.join(RADICE, ...parti);
const COPPIE = ["XBTUSD", "XBTEUR"];
const PRIMA_DOMENICA_DELLA_PROVA = "2026-06-28"; // ultima domenica prima di luglio: l'attivazione
const GIORNO = 86400;
const PAUSA_MS = 1000;

/** Le candele di un file dell'archivio, come {momento, chiusura}. */
function candeleArchivio(nomeFile) {
  const percorso = dentro("dati", "archivio", nomeFile);
  if (!fs.existsSync(percorso)) throw new Error(`manca ${path.relative(RADICE, percorso)}`);
  return fs.readFileSync(percorso, "utf8").trim().split("\n").map((riga) => {
    const v = riga.split(",");
    return { momento: Number(v[0]), chiusura: Number(v[4]) };
  });
}

/** Unisce due elenchi di candele senza duplicati, ordinati; a parità di istante vince il primo. */
function unisci(primo, secondo) {
  const mappa = new Map();
  for (const c of [...primo, ...secondo]) if (!mappa.has(c.momento)) mappa.set(c.momento, c);
  return [...mappa.values()].sort((a, b) => a.momento - b.momento);
}

const attesa = (ms) => new Promise((risolvi) => setTimeout(risolvi, ms));

async function main() {
  const lab = leggiJson(dentro("laboratorio.json"));
  const strategia = leggiJson(dentro("candidati", "liu-b.json"));
  if (!lab || !strategia) throw new Error("mancano laboratorio.json o candidati/liu-b.json");

  const registro = fs.readFileSync(dentro("registro", "esperimenti.md"), "utf8");
  if (registro.includes("| liu-b-informativa |")) throw new Error("la verifica informativa è già stata registrata");

  const adessoMs = Date.now();
  const risultati = [];

  for (const coppia of COPPIE) {
    // dati: archivio fino al 30 settembre, più l'API per le settimane di ottobre
    const giornaliere = unisci(candeleArchivio(`${coppia}_1440.csv`), []);
    const oraApi = await candeleChiuse({ coppia, intervalloMinuti: 1440, adessoMs });
    if (oraApi.errore) throw new Error(`${coppia} giornaliere: ${oraApi.errore}`);
    await attesa(PAUSA_MS);
    const orariaApi = await candeleChiuse({ coppia, intervalloMinuti: 60, adessoMs });
    if (orariaApi.errore) throw new Error(`${coppia} orarie: ${orariaApi.errore}`);

    const giornalierePiene = unisci(giornaliere, oraApi.candele);
    const oraria = unisci(candeleArchivio(`${coppia}_60.csv`), orariaApi.candele);
    const storia = aggiornaStoria(leggiStoriaSettimanale(dentro("dati", "settimanali", `${coppia}.csv`)), giornalierePiene);

    // rigioco: ogni domenica dal 28 giugno, con solo i dati noti fino alla candela di lunedì che serve
    const K0 = storia.findIndex((r) => r.data === PRIMA_DOMENICA_DELLA_PROVA);
    if (K0 === -1) throw new Error(`manca la domenica ${PRIMA_DOMENICA_DELLA_PROVA} nella storia`);
    const stato = nuovoStatoProva({ lab, coppia });
    for (let K = K0; K < storia.length; K++) {
      if (storia[K].chiusura === null) continue;
      const lunedi = Date.parse(storia[K].data) / 1000 + GIORNO;
      const orarieNote = oraria.filter((c) => c.momento <= lunedi + 3600);
      passoPerCoppia({ stato, strategia, storia: storia.slice(0, K + 1), orarie: orarieNote, coppia, lab });
    }

    const ultimaK = storia.length - 1;
    const dec = decisioniSettimanali(storia);
    const settimane = dec.dentro.slice(K0 + 1, ultimaK + 1);
    const dentroPerc = (settimane.filter(Boolean).length / settimane.length) * 100;
    const ultimoPrezzo = storia[ultimaK].chiusura;
    const m = calcolaMetriche(stato, { prezzoMercato: ultimoPrezzo, adessoSecondi: stato.istantanee.at(-1)?.momento ?? null });
    risultati.push({
      coppia,
      operazioni: stato.operazioni.length,
      dentroPerc,
      rendimento: m.variazionePercento,
      buyAndHold: m.benchmark.mercato.variazione,
      drawdown: drawdownMassimo(stato.istantanee.map((i) => i.portafoglio), 0, stato.istantanee.length - 1) * 100,
      ultimaDomenica: storia[ultimaK].data,
      lacune: stato.prova?.lacune.length ?? 0
    });
  }

  const data = new Date().toISOString().slice(0, 16).replace("T", " ");
  const impronta = improntaRegola(strategia);
  const f = (v) => v.toFixed(2).replace(".", ",");
  const righe = risultati.map(
    (r) => `| ${data} | liu-b-informativa | ${r.coppia} | ${impronta} | 6 lug 2026 → ${r.ultimaDomenica} | ${r.operazioni} | ` +
      `rendimento ${f(r.rendimento)}% (buy and hold ${f(r.buyAndHold)}%) | ${f(r.rendimento - r.buyAndHold)} punti | ${f(r.drawdown)}% | ` +
      `verifica informativa, nessun giudizio: ${r.operazioni} operazioni, ${f(r.dentroPerc)}% di settimane dentro, ${r.lacune} lacune; regola congelata |`
  );
  fs.appendFileSync(dentro("registro", "esperimenti.md"), righe.join("\n") + "\n", "utf8");
  for (const r of risultati) {
    console.log(`${r.coppia}: ${r.operazioni} operazioni, rendimento ${f(r.rendimento)}% contro buy and hold ${f(r.buyAndHold)}%, drawdown ${f(r.drawdown)}%, fino a ${r.ultimaDomenica}`);
  }
}

main().catch((errore) => {
  console.error(`informativa interrotta: ${errore.message}`);
  process.exitCode = 1;
});
