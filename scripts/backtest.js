/**
 * scripts/backtest.js — la strategia sul passato, dal CSV in dati/storico/.
 *
 *     npm run backtest -- --strategia rsi-base --da 2026-03-04 --a 2026-05-31
 *     npm run backtest -- --nota "primo confronto"
 *
 * Usa le stesse funzioni del giro (lib/simulazione.js → lib/strategia.js →
 * valuta()) su un CSV di candele chiuse.
 *
 * L'ultimo anno di dati è ESCLUSO per configurazione (laboratorio.json,
 * escludiUltimiGiorni). Si include solo con --usa-ultimo-anno, che va scritto
 * apposta nel comando: l'ultimo anno è quello che si guarda per primo, e quello
 * su cui è più facile sbagliare.
 *
 * Non tocca risultati/: quello è lo stato dal vivo. Scrive report/<strategia>.md
 * (sovrascritto) e aggiunge una riga a registro/esperimenti.md (mai riscritto).
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

import { leggiStrategia, candeleNecessarie } from "../lib/configurazione.js";
import { nuovoStato, avanza } from "../lib/simulazione.js";
import { calcolaMetriche } from "../lib/metriche.js";
import { giornoUTCInSecondi, formattaMomento } from "../lib/tempo.js";
import { leggiJson, scriviAtomico } from "../lib/persistenza.js";

const RADICE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dentro = (...parti) => path.join(RADICE, ...parti);
const REGISTRO = dentro("registro", "esperimenti.md");

const INTESTAZIONE_REGISTRO = [
  "# Registro degli esperimenti",
  "",
  "Sola aggiunta: ogni backtest aggiunge una riga e non riscrive mai quelle precedenti.",
  "Il risultato è sempre confrontato col «comprato e basta» sullo stesso periodo.",
  "",
  "| data (UTC) | strategia | impronta | periodo | operazioni | capitale | vs comprato e basta | drawdown | nota |",
  "|---|---|---|---|---:|---:|---:|---:|---|",
  ""
].join("\n");

function parseArgomenti(argv) {
  const opzioni = { strategie: [], da: null, a: null, usaUltimoAnno: false, nota: "" };
  const valore = (i, nome) => {
    if (argv[i + 1] === undefined) throw new Error(`${nome} vuole un valore`);
    return argv[i + 1];
  };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--strategia": opzioni.strategie.push(valore(i, "--strategia")); i++; break;
      case "--da": opzioni.da = valore(i, "--da"); i++; break;
      case "--a": opzioni.a = valore(i, "--a"); i++; break;
      case "--nota": opzioni.nota = valore(i, "--nota"); i++; break;
      case "--usa-ultimo-anno": opzioni.usaUltimoAnno = true; break;
      default: throw new Error(`opzione sconosciuta: ${argv[i]}`);
    }
  }
  return opzioni;
}

/** Il CSV: intestazione fissa, righe numeriche. Le righe guaste si scartano. */
function leggiCsv(percorso) {
  if (!fs.existsSync(percorso)) {
    throw new Error(`manca ${path.relative(RADICE, percorso)}`);
  }
  const righe = fs.readFileSync(percorso, "utf8").trim().split("\n");
  const intestazione = righe.shift().split(",");
  const attesa = ["momento", "apertura", "massimo", "minimo", "chiusura", "volume"];
  if (intestazione.join(",") !== attesa.join(",")) {
    throw new Error("intestazione del CSV diversa da quella attesa");
  }
  return righe
    .map((r) => {
      const v = r.split(",").map(Number);
      return { momento: v[0], apertura: v[1], massimo: v[2], minimo: v[3], chiusura: v[4], volume: v[5] };
    })
    .filter((c) => Object.values(c).every(Number.isFinite))
    .sort((x, y) => x.momento - y.momento);
}

const numero = (valore, decimali = 2) =>
  Number.isFinite(valore) ? valore.toFixed(decimali).replace(".", ",") : "—";

const pulisci = (testo) => String(testo).replace(/[|\r\n]+/g, " ").trim();

function appendiRegistro(riga) {
  if (!fs.existsSync(REGISTRO)) {
    scriviAtomico(REGISTRO, INTESTAZIONE_REGISTRO);
  }
  fs.appendFileSync(REGISTRO, riga + "\n", "utf8");
}

function reportStrategia({ nome, impronta, lab, csvRel, candele, periodo, esclusi, stato, m }) {
  const operazioni = stato.operazioni;
  const righe = [
    `# Backtest — ${nome}`,
    "",
    `Dati: \`${csvRel}\`, candele da ${lab.intervalloMinuti} minuti.`,
    `Periodo: ${periodo} (${numero(candele.length * lab.intervalloMinuti / 1440, 1)} giorni di candele).`,
    esclusi > 0
      ? `Escluse ${esclusi} candele dell'ultimo anno (configurazione: ${lab.escludiUltimiGiorni} giorni). Per includerle: \`--usa-ultimo-anno\`.`
      : "Ultimo anno incluso per scelta esplicita (`--usa-ultimo-anno`).",
    `Impronta della configurazione: \`${impronta}\`.`,
    "",
    "| | |",
    "|---|---|",
    `| capitale finale | ${numero(m.capitaleAttuale)} € (${numero(m.variazionePercento)}%) |`,
    `| vs comprato e basta | ${numero(m.benchmark.differenzaDalMercato)} punti |`,
    `| operazioni chiuse | ${m.operazioni.chiuse} |`,
    `| win rate | ${m.operazioni.winRate === null ? "—" : numero(m.operazioni.winRate, 1) + "%"} |`,
    `| drawdown massimo | ${m.drawdownMassimo === null ? "—" : numero(m.drawdownMassimo) + "%"} |`,
    `| segnali fermati dal rischio | ${stato.blocchi.length} |`,
    `| posizione ancora aperta a fine periodo | ${stato.posizione ? "sì" : "no"} |`,
    ""
  ];

  if (operazioni.length > 0) {
    righe.push("## Operazioni", "", "| # | ingresso | uscita | prezzo ingresso | prezzo uscita | risultato | come è uscita |", "|---:|---|---|---:|---:|---:|---|");
    for (const o of operazioni) {
      righe.push(
        `| ${o.numero} | ${formattaMomento(o.momentoIngresso, lab.fusoOrario, { conAnno: true })} | ` +
        `${formattaMomento(o.momentoUscita, lab.fusoOrario, { conAnno: true })} | ` +
        `${numero(o.prezzoIngresso)} | ${numero(o.prezzoUscita)} | ${numero(o.risultatoPercento)}% | ${o.uscitaScattata ?? "—"} |`
      );
    }
    righe.push("");
  }

  righe.push("---", "", "Simulazione su carta. Nessun soldo vero, nessuna chiave, nessuna consulenza.");
  return righe.join("\n") + "\n";
}

function main() {
  const lab = leggiJson(dentro("laboratorio.json"));
  if (!lab) throw new Error("manca laboratorio.json");
  const opzioni = parseArgomenti(process.argv.slice(2));

  const nomi = opzioni.strategie.length > 0
    ? opzioni.strategie
    : fs.readdirSync(dentro("strategie")).filter((f) => f.endsWith(".json")).map((f) => path.basename(f, ".json")).sort();

  const csvRel = `dati/storico/${lab.mercato}-${lab.intervalloMinuti}.csv`;
  const durata = lab.intervalloMinuti * 60;
  let candele = leggiCsv(dentro(csvRel));

  if (opzioni.da) {
    const da = giornoUTCInSecondi(opzioni.da);
    if (da === null) throw new Error(`--da vuole una data AAAA-MM-GG vera, non ${opzioni.da}`);
    candele = candele.filter((c) => c.momento >= da);
  }
  if (opzioni.a) {
    const a = giornoUTCInSecondi(opzioni.a);
    if (a === null) throw new Error(`--a vuole una data AAAA-MM-GG vera, non ${opzioni.a}`);
    candele = candele.filter((c) => c.momento < a + 86400); // il giorno indicato è compreso
  }

  // l'orologio si legge qui: serve solo a decidere dove finisce «l'ultimo anno»
  const limite = Math.floor(Date.now() / 1000) - lab.escludiUltimiGiorni * 86400;
  let esclusi = 0;
  if (!opzioni.usaUltimoAnno) {
    const prima = candele.length;
    candele = candele.filter((c) => c.momento + durata <= limite);
    esclusi = prima - candele.length;
  }

  if (candele.length === 0) {
    throw new Error("nessuna candela nella finestra richiesta (ricorda: l'ultimo anno è escluso di default)");
  }

  const periodo = `${formattaMomento(candele[0].momento, lab.fusoOrario, { conAnno: true })} → ` +
                  `${formattaMomento(candele.at(-1).momento, lab.fusoOrario, { conAnno: true })}`;

  for (const nome of nomi) {
    const strategia = leggiStrategia(dentro("strategie", `${nome}.json`));
    const primaValutabile = candeleNecessarie(strategia) - 1;
    if (candele.length <= primaValutabile) {
      throw new Error(`${nome}: servono almeno ${primaValutabile + 1} candele, nella finestra ce ne sono ${candele.length}`);
    }

    const stato = nuovoStato({
      capitaleIniziale: lab.capitaleIniziale,
      mercato: lab.mercato,
      intervalloMinuti: lab.intervalloMinuti,
      fusoOrario: lab.fusoOrario
    });
    avanza(stato, candele, primaValutabile, candele.length, strategia);

    const ultimo = stato.istantanee.at(-1);
    const m = calcolaMetriche(stato, {
      prezzoMercato: ultimo.prezzo,
      prezzoBenchmark: null,
      adessoSecondi: ultimo.momento
    });

    // l'impronta: stessa configurazione, stessa impronta. Serve a riconoscere un esperimento ripetuto
    const impronta = crypto.createHash("sha256").update(JSON.stringify(strategia)).digest("hex").slice(0, 10);

    scriviAtomico(dentro("report", `${nome}.md`), reportStrategia({
      nome, impronta, lab, csvRel, candele, periodo, esclusi, stato, m
    }));

    const data = new Date().toISOString().slice(0, 16).replace("T", " ");
    appendiRegistro([
      `| ${data}`,
      nome,
      impronta,
      periodo,
      m.operazioni.chiuse,
      `${numero(m.capitaleAttuale)} € (${numero(m.variazionePercento)}%)`,
      `${numero(m.benchmark.differenzaDalMercato)} punti`,
      m.drawdownMassimo === null ? "—" : `${numero(m.drawdownMassimo)}%`,
      `${pulisci(opzioni.nota)} |`
    ].join(" | "));

    console.log(
      `${nome}: ${m.operazioni.chiuse} operazioni · capitale ${numero(m.capitaleAttuale)} € ` +
      `(${numero(m.variazionePercento)}%) · vs comprato e basta ${numero(m.benchmark.differenzaDalMercato)} punti`
    );
  }

  if (esclusi > 0) {
    console.log(`\n(${esclusi} candele dell'ultimo anno escluse: configurazione. Per includerle: --usa-ultimo-anno)`);
  }
  console.log("Report in report/. Riga aggiunta a registro/esperimenti.md.");
}

try {
  main();
} catch (errore) {
  console.error(`backtest interrotto: ${errore.message}`);
  process.exitCode = 1;
}
