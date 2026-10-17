/**
 * scripts/liu.js — la replica fuori campione di Liu e Tsyvinski (2021).
 *
 *     node scripts/liu.js --solo-copertura   (conta le domeniche valide, senza risultati)
 *     node scripts/liu.js                    (il test pre-registrato, una sola volta)
 *
 * Coppia giudicata: XBTUSD. XBTEUR è solo un confronto, fuori dal giudizio.
 * Periodo: da domenica 3 gennaio 2021 a domenica 28 giugno 2026, cioè le domeniche di
 * fine delle settimane complete da lunedì 4 gennaio 2021 a domenica 28 giugno 2026.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

import {
  domeniche,
  rendimentiSettimanali,
  segnali,
  settimaneDentro,
  permanenze,
  curvaCapitale,
  drawdownMassimo
} from "../lib/settimane.js";
import { giudicaPermutazione } from "../lib/giudice.js";
import { generatore } from "../lib/ricerca.js";

const RADICE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dentro = (...parti) => path.join(RADICE, ...parti);

// i parametri della pre-registrazione
const DA_DOMENICA = "2021-01-03";
const FINE_DOMENICA = "2026-06-28";
const VARIANTI = { A: 1, B: 1, C: 3 }; // settimane tenute dopo il segnale
const COSTO = (2 * (0.1 + 0.05)) / 100; // 0,30% andata e ritorno
const PERMUTAZIONI = 10000;
const SEME = 20261019;
const N = Object.keys(VARIANTI).length;
const ALFA = 0.05;
const COPPIA = "XBTUSD";
const CONFRONTO = "XBTEUR";

const soloCopertura = process.argv.includes("--solo-copertura");
const verificaP = process.argv.includes("--verifica-p");

function leggiCandele(nomeFile) {
  const percorso = dentro("dati", "archivio", nomeFile);
  if (!fs.existsSync(percorso)) throw new Error(`manca ${path.relative(RADICE, percorso)}`);
  return fs.readFileSync(percorso, "utf8").trim().split("\n").map((riga) => {
    const v = riga.split(",");
    return { momento: Number(v[0]), chiusura: Number(v[4]) };
  });
}

const bps = (frazione) => (frazione * 10000).toFixed(1).replace(".", ",");
const pct = (frazione) => (frazione * 100).toFixed(2).replace(".", ",");
const media = (valori) => (valori.length === 0 ? null : valori.reduce((s, v) => s + v, 0) / valori.length);

/** Gli indici di domenica che delimitano la finestra giudicata, dentro la serie. */
function finestra(date) {
  const S0 = date.indexOf(DA_DOMENICA);
  const S1 = date.indexOf(FINE_DOMENICA);
  if (S0 === -1 || S1 === -1) throw new Error("la finestra non è coperta dalla serie delle domeniche");
  return { S0, S1 };
}

/** Le domeniche della finestra senza prezzo: se ce ne sono, il test non può girare. */
function domenicheMancanti(d, { S0, S1 }) {
  const buchi = [];
  for (let k = S0; k <= S1; k++) if (d.close[k] === null) buchi.push(d.date[k]);
  return buchi;
}

/** Tutto il calcolo di una coppia: segnali, permanenze, curve e statistiche per variante. */
function analizza(candele) {
  const d = domeniche(candele);
  const { S0, S1 } = finestra(d.date);
  const rend = rendimentiSettimanali(d.close);
  const settimane = S1 - S0;

  const risultati = {};
  for (const [variante, L] of Object.entries(VARIANTI)) {
    const sig = segnali(variante, rend);
    const dentroArr = settimaneDentro(sig, L);
    const perm = permanenze(dentroArr, S0 + 1, S1);
    const operazioni = perm.map((p) => ({
      inizio: p.entrata - S0,
      fine: p.uscita - S0,
      data: d.date[p.entrata],
      lordo: d.close[p.uscita] / d.close[p.entrata] - 1
    }));
    const settimaneTenute = dentroArr.slice(S0 + 1, S1 + 1).filter(Boolean).length;
    const curva = curvaCapitale(d.close, dentroArr, S0, S1, COSTO);
    risultati[variante] = {
      operazioni,
      percentualeDentro: settimaneTenute / settimane,
      rendimentoTotale: curva[S1] - 1,
      drawdown: drawdownMassimo(curva, S0, S1),
      curva,
      dentroArr,
      perm
    };
  }

  // il buy and hold dello stesso periodo: sempre dentro, con lo stesso costo di andata e ritorno
  const tuttaDentro = new Array(d.close.length).fill(false);
  for (let k = S0 + 1; k <= S1; k++) tuttaDentro[k] = true;
  const curvaBH = curvaCapitale(d.close, tuttaDentro, S0, S1, COSTO);
  return {
    d,
    S0,
    S1,
    risultati,
    buyAndHold: { rendimentoTotale: curvaBH[S1] - 1, drawdown: drawdownMassimo(curvaBH, S0, S1), curva: curvaBH }
  };
}

/** Il giudizio di una variante. Per il test pre-registrato, seme e permutazioni sono quelli della pre-registrazione. */
function giudica(analisi, variante, { seme = SEME, permutazioni = PERMUTAZIONI } = {}) {
  const { d, S0, S1, risultati } = analisi;
  const r = risultati[variante];
  const prezzi = d.close.slice(S0, S1 + 1);
  return giudicaPermutazione({
    gruppi: [{ prezzi, W: prezzi.length, operazioni: r.perm.map((p) => ({ inizio: p.entrata - S0, fine: p.uscita - S0 })) }],
    costoAndataRitorno: COSTO,
    permutazioni,
    rng: generatore(seme),
    N,
    alfa: ALFA,
    minimoOperazioni: 1
  });
}

// la verifica informativa del p: seme e permutazioni fissati e scritti nel report prima di eseguire
const SEME_VERIFICA = 20261020;
const PERMUTAZIONI_VERIFICA = 100000;
const RIGA_PIANO = "Stato: in attesa di esecuzione.";

/** Rifà il giudizio con 100.000 permutazioni e un altro seme, solo per vedere quanto è stabile il p. Il verdetto non cambia. */
function verificaInformativa(usd) {
  const percorsoReport = dentro("report", "liu-replica.md");
  const report = fs.readFileSync(percorsoReport, "utf8");
  if (!report.includes(RIGA_PIANO) || !report.includes(`seme ${SEME_VERIFICA}`)) {
    throw new Error(`la verifica non è pianificata nel report con il seme ${SEME_VERIFICA}: va scritta prima di eseguire`);
  }
  const registro = fs.readFileSync(dentro("registro", "esperimenti.md"), "utf8");
  if (Object.keys(VARIANTI).some((v) => registro.includes(`| liu-${v}-verifica |`))) {
    throw new Error("la verifica informativa è già stata eseguita");
  }

  const giudizi = {};
  for (const v of Object.keys(VARIANTI)) {
    giudizi[v] = giudica(usd, v, { seme: SEME_VERIFICA, permutazioni: PERMUTAZIONI_VERIFICA });
  }
  const errore = (p) => Math.sqrt((p * (1 - p)) / PERMUTAZIONI_VERIFICA);
  const data = new Date().toISOString().slice(0, 16).replace("T", " ");

  const tabella = [
    "| variante | p (100.000 perm.) | errore standard Monte Carlo | soglia | esito informativo | verdetto pre-registrato |",
    "|---|---:|---:|---:|---|---|"
  ];
  for (const v of Object.keys(VARIANTI)) {
    const g = giudizi[v];
    const verdettoPre = v === "B" ? "passa (invariato)" : "non passa (invariato)";
    tabella.push(
      `| ${v} | ${g.p.toExponential(2)} | ${errore(g.p).toExponential(2)} | ${(ALFA / N).toFixed(4)} | ` +
      `${g.passa ? "passa" : "non passa"} | ${verdettoPre} |`
    );
  }
  const testo = [
    `Eseguita il ${data}, con seme ${SEME_VERIFICA} e ${PERMUTAZIONI_VERIFICA} permutazioni, come pianificato.`,
    "",
    ...tabella,
    "",
    "Il verdetto pre-registrato non cambia, qualunque sia il risultato: B passa con p 0,0160 su 10.000 permutazioni e seme 20261019, come scritto nei risultati sopra. Questa sezione misura solo quanto il p dipende dal caso."
  ].join("\n");

  fs.writeFileSync(percorsoReport, report.replace(RIGA_PIANO, testo), "utf8");

  const impronta = crypto
    .createHash("sha256")
    .update(JSON.stringify({ SEME_VERIFICA, PERMUTAZIONI_VERIFICA, COSTO, N, ALFA }))
    .digest("hex")
    .slice(0, 10);
  const righeRegistro = Object.keys(VARIANTI).map((v) => {
    const g = giudizi[v];
    return `| ${data} | liu-${v}-verifica | ${COPPIA} | ${impronta} | 4 gen 2021 → 28 giu 2026 | — | — | ` +
      `p ${g.p.toExponential(2)} (errore ${errore(g.p).toExponential(2)}) | — | verifica informativa, seme ${SEME_VERIFICA}; ` +
      `verdetto pre-registrato invariato: ${v === "B" ? "B passa" : `${v} non passa`} |`;
  });
  fs.appendFileSync(dentro("registro", "esperimenti.md"), righeRegistro.join("\n") + "\n", "utf8");
  console.log(`Verifica informativa scritta nel report e nel registro. Verdetto pre-registrato invariato.`);
}

function main() {
  const usd = analizza(leggiCandele("XBTUSD_1440.csv"));
  const buchi = domenicheMancanti(usd.d, usd);

  if (verificaP) {
    if (buchi.length > 0) throw new Error(`domeniche senza prezzo nel periodo (${buchi.join(", ")})`);
    verificaInformativa(usd);
    return;
  }

  if (soloCopertura) {
    console.log(`domeniche nella finestra: ${usd.S1 - usd.S0 + 1}, senza prezzo: ${buchi.length}${buchi.length ? ` (${buchi.join(", ")})` : ""}`);
    for (const v of Object.keys(VARIANTI)) {
      console.log(`${v}: operazioni ${usd.risultati[v].operazioni.length}`);
    }
    console.log("nessun risultato calcolato: solo copertura.");
    return;
  }

  if (buchi.length > 0) {
    throw new Error(`domeniche senza prezzo nel periodo (${buchi.join(", ")}): il test non può girare senza una regola nuova`);
  }

  const registro = fs.readFileSync(dentro("registro", "esperimenti.md"), "utf8");
  if (Object.keys(VARIANTI).some((v) => registro.includes(`| liu-${v} |`))) {
    throw new Error("la replica è già stata eseguita: il test pre-registrato si fa una sola volta");
  }

  const eur = analizza(leggiCandele("XBTEUR_1440.csv"));
  const giudizi = {};
  for (const v of Object.keys(VARIANTI)) giudizi[v] = giudica(usd, v);

  const impronta = crypto
    .createHash("sha256")
    .update(JSON.stringify({ VARIANTI, COSTO, PERMUTAZIONI, SEME, N, ALFA, DA_DOMENICA, FINE_DOMENICA }))
    .digest("hex")
    .slice(0, 10);
  const data = new Date().toISOString().slice(0, 16).replace("T", " ");
  const anni = [2021, 2022, 2023, 2024, 2025, 2026];

  /* il report */
  const righe = [
    "# Replica fuori campione: Liu e Tsyvinski (2021)",
    "",
    `Coppia giudicata: ${COPPIA}. Confronto, fuori dal giudizio: ${CONFRONTO}. Periodo: settimane da lunedì 4 gennaio 2021 a domenica 28 giugno 2026.`,
    `Giudizio: permutazione delle operazioni tra le settimane del periodo, ${PERMUTAZIONI} ricollocazioni, seme ${SEME}, N = ${N}, alfa ${ALFA}, soglia p = ${(ALFA / N).toFixed(4)}.`,
    `Costi: ${bps(COSTO)} punti base per operazione, andata e ritorno.`,
    "",
    "## Risultati",
    "",
    "| variante | operazioni | settimane dentro | lordo medio (p.b.) | netto medio (p.b.) | rendimento totale | drawdown massimo | p | esito |",
    "|---|---:|---:|---:|---:|---:|---:|---:|---|"
  ];
  for (const v of Object.keys(VARIANTI)) {
    const r = usd.risultati[v];
    const g = giudizi[v];
    const lordoMedio = media(r.operazioni.map((o) => o.lordo));
    righe.push(
      `| ${v} | ${r.operazioni.length} | ${pct(r.percentualeDentro)}% | ${lordoMedio === null ? "—" : bps(lordoMedio)} | ` +
      `${lordoMedio === null ? "—" : bps(lordoMedio - COSTO)} | ${pct(r.rendimentoTotale)}% | ${pct(r.drawdown)}% | ` +
      `${g.p.toExponential(2)} | ${g.passa ? "**passa**" : "non passa"} |`
    );
  }
  righe.push(
    `| buy and hold | 1 | 100% | — | — | ${pct(usd.buyAndHold.rendimentoTotale)}% | ${pct(usd.buyAndHold.drawdown)}% | — | confronto |`,
    "",
    "## Anno per anno (solo informativo)",
    "",
    "| anno | " + Object.keys(VARIANTI).map((v) => `${v}: ops, rendimento`).join(" | ") + " | buy and hold |",
    "|---|" + Object.keys(VARIANTI).map(() => "---:").join("|") + "|---:|"
  );
  for (const anno of anni) {
    const celle = Object.keys(VARIANTI).map((v) => {
      const r = usd.risultati[v];
      const ops = r.operazioni.filter((o) => o.data.startsWith(String(anno))).length;
      return `${ops}, ${pct(rendimentoAnno(usd, r.curva, anno))}%`;
    });
    righe.push(`| ${anno} | ${celle.join(" | ")} | ${pct(rendimentoAnno(usd, usd.buyAndHold.curva, anno))}% |`);
  }
  righe.push(
    "",
    `## Confronto ${CONFRONTO} (fuori dal giudizio)`,
    "",
    "| variante | operazioni | lordo medio (p.b.) | rendimento totale |",
    "|---|---:|---:|---:|"
  );
  for (const v of Object.keys(VARIANTI)) {
    const r = eur.risultati[v];
    const lordoMedio = media(r.operazioni.map((o) => o.lordo));
    righe.push(`| ${v} | ${r.operazioni.length} | ${lordoMedio === null ? "—" : bps(lordoMedio)} | ${pct(r.rendimentoTotale)}% |`);
  }
  righe.push(
    "",
    "## Scostamenti dal metodo",
    "",
    "(a) Il percentile di B e C usa tutti i dati Kraken dal 2013, non il campione CoinDesk dal 2011. (b) Il periodo non si sovrappone al campione dello studio. (c) Le soglie della tabella 15 usano l'intero campione; qui solo il passato. (d) Le permanenze iniziate prima del periodo entrano alla prima domenica del periodo. (e) Nessuna domenica senza prezzo nel periodo.",
    "",
    "---",
    "",
    "Simulazione su carta. Nessuna operazione reale, nessuna chiave, nessuna consulenza."
  );
  fs.mkdirSync(dentro("report"), { recursive: true });
  fs.writeFileSync(dentro("report", "liu-replica.md"), righe.join("\n") + "\n", "utf8");

  /* il registro: una riga per variante, come da pre-registrazione */
  const righeRegistro = Object.keys(VARIANTI).map((v) => {
    const r = usd.risultati[v];
    const g = giudizi[v];
    const lordoMedio = media(r.operazioni.map((o) => o.lordo));
    const differenza = (r.rendimentoTotale - usd.buyAndHold.rendimentoTotale) * 100;
    const nota = `Liu e Tsyvinski 2021, ${v}: ${g.passa ? "passa" : "non passa"}; ` +
      `lordo medio ${lordoMedio === null ? "—" : bps(lordoMedio)} p.b.; settimane dentro ${pct(r.percentualeDentro)}%; p ${g.p.toExponential(2)}`;
    return `| ${data} | liu-${v} | ${COPPIA} | ${impronta} | 4 gen 2021 → 28 giu 2026 | ${r.operazioni.length} | ` +
      `rendimento ${pct(r.rendimentoTotale)}% (buy and hold ${pct(usd.buyAndHold.rendimentoTotale)}%) | ` +
      `${differenza.toFixed(1).replace(".", ",")} punti | ${pct(r.drawdown)}% | ${nota} |`;
  });
  fs.appendFileSync(dentro("registro", "esperimenti.md"), righeRegistro.join("\n") + "\n", "utf8");

  console.log("Replica scritta in report/liu-replica.md, 3 righe nel registro.");
}

/** Il rendimento della curva nell'anno: dall'ultima domenica dell'anno precedente all'ultima dell'anno. */
function rendimentoAnno(analisi, curva, anno) {
  const { d, S0, S1 } = analisi;
  let fine = -1;
  let inizio = S0;
  for (let k = S0; k <= S1; k++) {
    const y = Number(d.date[k].slice(0, 4));
    if (y === anno) fine = k;
    if (y < anno) inizio = k;
  }
  if (fine === -1) return 0;
  return curva[fine] / curva[inizio] - 1;
}

try {
  main();
} catch (errore) {
  console.error(`liu interrotto: ${errore.message}`);
  process.exitCode = 1;
}
