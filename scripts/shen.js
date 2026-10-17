/**
 * scripts/shen.js — la replica fuori campione di Shen, Urquhart e Wang (2022).
 *
 *     node scripts/shen.js --solo-copertura   (conta i giorni validi, senza risultati)
 *     node scripts/shen.js                    (il test pre-registrato)
 *
 * Coppia giudicata: XBTUSD. XBTEUR è solo un confronto, fuori dal giudizio.
 * Il test si fa una volta sola: il report sovrascrive quello precedente solo se
 * è la stessa pre-registrazione, e il registro riceve una riga per variante.
 *
 * I parametri sono quelli della pre-registrazione in registro/esperimenti.md.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

import {
  giorniISO,
  mappaChiusure,
  rendimentiGiorno,
  segnoVariante,
  eleggibile
} from "../lib/sessioni.js";
import { giudicaGiorni } from "../lib/giudice.js";
import { generatore } from "../lib/ricerca.js";

const RADICE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dentro = (...parti) => path.join(RADICE, ...parti);

// i parametri della pre-registrazione
const FUSO = "America/New_York";
const DA = "2021-01-01";
const A = "2026-06-30";
const VARIANTI = ["inizio", "penultima", "combinata"];
const COSTO = (2 * (0.1 + 0.05)) / 100; // 0,10% per lato più 0,05% di slippage, andata e ritorno
const PERMUTAZIONI = 10000;
const SEME = 20261018;
const N = VARIANTI.length;
const ALFA = 0.05;
const COPPIA = "XBTUSD";
const CONFRONTO = "XBTEUR";

const soloCopertura = process.argv.includes("--solo-copertura");

function leggiCandele(nomeFile) {
  const percorso = dentro("dati", "archivio", nomeFile);
  if (!fs.existsSync(percorso)) throw new Error(`manca ${path.relative(RADICE, percorso)}`);
  return fs.readFileSync(percorso, "utf8").trim().split("\n").map((riga) => {
    const v = riga.split(",");
    return { momento: Number(v[0]), chiusura: Number(v[4]) };
  });
}

const bps = (frazione) => (frazione * 10000).toFixed(1).replace(".", ",");
const media = (valori) => (valori.length === 0 ? null : valori.reduce((s, v) => s + v, 0) / valori.length);

/** Tutti i giorni in cui una variante ha deciso, con i rendimenti. */
function analizza(candele) {
  const mappa = mappaChiusure(candele);
  const giorni = giorniISO(DA, A).map((d) => rendimentiGiorno(mappa, d, FUSO));
  const risultati = {};
  for (const variante of VARIANTI) {
    const eleggibili = giorni.filter((g) => eleggibile(variante, g));
    const operazioni = [];
    eleggibili.forEach((g, indice) => {
      const segno = segnoVariante(variante, g);
      if (segno !== 0) operazioni.push({ indice, segno, data: g.data, lordo: segno * g.rLH });
    });
    risultati[variante] = {
      giorniValidi: eleggibili.length,
      giorniSaltati: giorni.length - eleggibili.length,
      eleggibili: eleggibili.map((g) => g.rLH),
      operazioni,
      lunghe: operazioni.filter((o) => o.segno === 1)
    };
  }
  return { giorni, risultati };
}

/** Il giudizio di una variante: eseguibile (solo lunghe, con costi) e replica (lunga e corta, lorda). */
function giudica(dati) {
  const { eleggibili, operazioni, lunghe } = dati;
  const eseguibile = giudicaGiorni({
    eleggibili,
    osservate: lunghe.map((o) => ({ indice: o.indice, segno: 1 })),
    costoPerOperazione: COSTO,
    permutazioni: PERMUTAZIONI,
    rng: generatore(SEME),
    N,
    alfa: ALFA
  });
  // la replica non si giudica: il suo p serve solo a vedere se l'effetto esiste ancora
  const replica = giudicaGiorni({
    eleggibili,
    osservate: operazioni.map((o) => ({ indice: o.indice, segno: o.segno })),
    costoPerOperazione: 0,
    permutazioni: PERMUTAZIONI,
    rng: generatore(SEME),
    N,
    alfa: ALFA
  });
  return { eseguibile, replica };
}

function main() {
  const candeleUSD = leggiCandele("XBTUSD_15.csv");
  const candeleEUR = leggiCandele("XBTEUR_15.csv");

  const usd = analizza(candeleUSD);
  if (soloCopertura) {
    for (const v of VARIANTI) {
      const r = usd.risultati[v];
      console.log(`${v}: giorni validi ${r.giorniValidi}, saltati ${r.giorniSaltati}, operazioni lunghe ${r.lunghe.length}, operazioni totali ${r.operazioni.length}`);
    }
    console.log("nessun risultato calcolato: solo copertura.");
    return;
  }

  // il test si fa una volta sola: se il registro ha già le sue righe, non si rilancia
  const registro = fs.readFileSync(dentro("registro", "esperimenti.md"), "utf8");
  if (VARIANTI.some((v) => registro.includes(`| shen-${v} |`))) {
    throw new Error("la replica è già stata eseguita: il test pre-registrato si fa una sola volta");
  }

  const eur = analizza(candeleEUR);
  const giudizi = {};
  for (const v of VARIANTI) giudizi[v] = giudica({ ...usd.risultati[v], eleggibili: usd.risultati[v].eleggibili });

  const impronta = crypto.createHash("sha256").update(JSON.stringify({ VARIANTI, COSTO, PERMUTAZIONI, SEME, N, ALFA, DA, A })).digest("hex").slice(0, 10);
  const data = new Date().toISOString().slice(0, 16).replace("T", " ");

  /* il report */
  const righe = [
    "# Replica fuori campione: Shen, Urquhart e Wang (2022)",
    "",
    `Coppia giudicata: ${COPPIA}. Confronto, fuori dal giudizio: ${CONFRONTO}. Periodo: ${DA} – ${A}, decisioni alle 16:30 di ogni giorno.`,
    `Giudizio: permutazione dei giorni, ${PERMUTAZIONI} ricollocazioni, seme ${SEME}, N = ${N}, alfa ${ALFA}, soglia p = ${(ALFA / N).toFixed(4)}.`,
    `Costi dell'eseguibile: ${bps(COSTO)} punti base andata e ritorno. Fuso: ${FUSO}, con ora legale.`,
    "",
    "## Risultati",
    "",
    "| variante | versione | operazioni | lordo medio (p.b.) | netto medio (p.b.) | costo di pareggio (p.b.) | p | esito |",
    "|---|---|---:|---:|---:|---:|---:|---|"
  ];
  for (const v of VARIANTI) {
    const r = usd.risultati[v];
    const { eseguibile, replica } = giudizi[v];
    const lordoLunghe = media(r.lunghe.map((o) => o.lordo));
    const lordoTutte = media(r.operazioni.map((o) => o.lordo));
    righe.push(
      `| ${v} | eseguibile | ${r.lunghe.length} | ${bps(lordoLunghe ?? NaN)} | ${bps((lordoLunghe ?? NaN) - COSTO)} | ${bps(lordoLunghe ?? NaN)} | ${eseguibile.p.toExponential(2)} | ${eseguibile.passa ? "**passa**" : "non passa"} |`,
      `| ${v} | replica (non giudicata) | ${r.operazioni.length} | ${bps(lordoTutte ?? NaN)} | — | ${bps(lordoTutte ?? NaN)} | ${replica.p.toExponential(2)} | informativa |`
    );
  }
  righe.push(
    "",
    "## Confronto con la tabella 8 dello studio",
    "",
    "Campione completo dello studio (2013–2020), senza leva: costo di pareggio di 3, 7 e 10 punti base, con profitto medio per operazione di 0,028%, 0,061% e 0,096%, nell'ordine inizio, penultima e combinata.",
    "",
    "## Anno per anno (solo informativo)",
    "",
    "| anno | " + VARIANTI.map((v) => `${v} eseguibile (ops, lordo p.b.)`).join(" | ") + " |",
    "|---|" + VARIANTI.map(() => "---:").join("|") + "|"
  );
  for (const anno of ["2021", "2022", "2023", "2024", "2025", "2026"]) {
    const celle = VARIANTI.map((v) => {
      const lunghe = usd.risultati[v].lunghe.filter((o) => o.data.startsWith(anno));
      return `${lunghe.length}, ${bps(media(lunghe.map((o) => o.lordo)) ?? NaN)}`;
    });
    righe.push(`| ${anno} | ${celle.join(" | ")} |`);
  }
  righe.push(
    "",
    `## Confronto ${CONFRONTO} (fuori dal giudizio)`,
    "",
    "| variante | operazioni lunghe | lordo medio lunghe (p.b.) |",
    "|---|---:|---:|"
  );
  for (const v of VARIANTI) {
    const lunghe = eur.risultati[v].lunghe;
    righe.push(`| ${v} | ${lunghe.length} | ${bps(media(lunghe.map((o) => o.lordo)) ?? NaN)} |`);
  }
  righe.push(
    "",
    "## Scostamenti dal metodo",
    "",
    "(a) Fuso con ora legale, al posto di «EST». (b) I giorni con candele mancanti si saltano: " +
    `${VARIANTI.map((v) => `${v} ${usd.risultati[v].giorniSaltati}`).join(", ")}. (c) Il periodo non si sovrappone al campione dello studio.`,
    "",
    "---",
    "",
    "Simulazione su carta. Nessuna operazione reale, nessuna chiave, nessuna consulenza."
  );
  scriviReport(righe.join("\n") + "\n");

  /* il registro: una riga per variante, come da pre-registrazione */
  const righeRegistro = VARIANTI.map((v) => {
    const { eseguibile, replica } = giudizi[v];
    const lunghe = usd.risultati[v].lunghe;
    const lordo = media(lunghe.map((o) => o.lordo)) ?? NaN;
    const nota = `Shen et al. 2022, ${v}: eseguibile ${eseguibile.passa ? "passa" : "non passa"}; replica lorda ${bps(media(usd.risultati[v].operazioni.map((o) => o.lordo)) ?? NaN)} p.b., p ${replica.p.toExponential(2)}`;
    return `| ${data} | shen-${v} | ${COPPIA} | ${impronta} | 1 gen 2021 → 30 giu 2026 | ${lunghe.length} | — | pareggio ${bps(lordo)} p.b. · p ${eseguibile.p.toExponential(2)} | — | ${nota} |`;
  });
  fs.appendFileSync(dentro("registro", "esperimenti.md"), righeRegistro.join("\n") + "\n", "utf8");

  console.log(`Replica scritta in report/shen-replica.md, ${VARIANTI.length} righe nel registro.`);
}

function scriviReport(testo) {
  const percorso = dentro("report", "shen-replica.md");
  fs.mkdirSync(path.dirname(percorso), { recursive: true });
  fs.writeFileSync(percorso, testo, "utf8");
}

try {
  main();
} catch (errore) {
  console.error(`shen interrotto: ${errore.message}`);
  process.exitCode = 1;
}
