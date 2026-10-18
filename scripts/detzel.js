/**
 * scripts/detzel.js — test di Detzel, Liu, Strauss, Zhou e Zhu (2021), medie mobili logaritmiche su
 * Bitcoin. Pre-registrato in registro/esperimenti.md, prima di qualsiasi calcolo.
 *
 *     node scripts/detzel.js
 *
 * Un'esecuzione sola, con due test: il principale (media a 7 giorni su XBTUSD, dal 1 aprile 2022 al
 * 28 giugno 2026, N = 1) decide il verdetto; la replica delle sei esposizioni (2021–2026, N = 6) è
 * secondaria. Scrive report/detzel.md, report/dati/*.json e una riga per esposizione nel registro.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

import {
  segnali,
  esposizione,
  mediaEsposizioni,
  turnoverLineare,
  curvaEsposizione,
  statisticaMedia,
  giudicaEsposizione,
  costoDiPareggio
} from "../lib/detzel.js";
import { drawdownMassimo } from "../lib/settimane.js";

const RADICE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const daRadice = (...parti) => path.join(RADICE, ...parti);

// le cinque medie dello studio, con il costo per lato che azzera il vantaggio (tabella 6)
const VARIANTI = [
  { nome: "7g", etichetta: "L = 1 settimana", giorni: 7, studio: "1,38%" },
  { nome: "14g", etichetta: "L = 2 settimane", giorni: 14, studio: "2,12%" },
  { nome: "28g", etichetta: "L = 4 settimane", giorni: 28, studio: "3,13%" },
  { nome: "70g", etichetta: "L = 10 settimane", giorni: 70, studio: "5,75%" },
  { nome: "140g", etichetta: "L = 20 settimane", giorni: 140, studio: "6,85%" }
];
const COMBINATA = { nome: "ew", etichetta: "combinazione EW (media delle cinque)", giorni: null, studio: "non riportato" };
const TUTTE = [...VARIANTI, COMBINATA];

// il test principale: solo la media a 7 giorni, dopo l'ultimo dato di Wei e colleghi
const PRINCIPALE = { id: "principale", etichetta: "test principale", primoGiornoPrima: "2022-03-31", N: 1 };
// la replica secondaria: le sei esposizioni sul periodo 2021–2026
const REPLICA = { id: "replica", etichetta: "replica secondaria", primoGiornoPrima: "2020-12-31", N: TUTTE.length };

const ULTIMO_GIORNO = "2026-06-28";
const COSTO_LATO = 0.0015; // 0,10% più 0,05% di slippage, per lato e per unità di variazione
const ESCLUDI = 30; // spostamenti entro 30 giorni dallo zero, in entrambe le direzioni
const ALFA = 0.05;
const GIORNI_ANNO = 365.25;
const GIORNO = 86400000;

const numero = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d).replace(".", ",") : "—");
const percento = (v, d = 2) => `${numero(v * 100, d)}%`;
const pareggioTesto = (r) => (r.pareggio === null ? "non definito" : percento(r.pareggio));

/**
 * Le candele giornaliere fino all'ultimo giorno del periodo, compreso: le successive non si leggono.
 * Il file è in ordine di tempo; da gennaio 2020 non ha buchi, e il controllo lo verifica.
 */
function caricaCandele(coppia) {
  const percorso = daRadice("dati", "archivio", `${coppia}_1440.csv`);
  const date = [];
  const close = [];
  for (const riga of fs.readFileSync(percorso, "utf8").trim().split("\n")) {
    const v = riga.split(",");
    const giorno = new Date(Number(v[0]) * 1000).toISOString().slice(0, 10);
    if (giorno > ULTIMO_GIORNO) break;
    date.push(giorno);
    close.push(Number(v[4]));
  }
  for (let k = 1; k < date.length; k++) {
    if (date[k] >= "2020-01-01" && Date.parse(date[k]) - Date.parse(date[k - 1]) !== GIORNO) {
      throw new Error(`${coppia}: giorni mancanti prima di ${date[k]}`);
    }
  }
  if (close.some((c) => !Number.isFinite(c) || c <= 0)) throw new Error(`${coppia}: chiusure non valide`);
  return { coppia, date, close };
}

/** Le esposizioni di tutte le varianti sull'intera serie, allineate a TUTTE; l'ultima è la EW. */
function esposizioniCompleta(serie) {
  const perVariante = VARIANTI.map((v) => esposizione(segnali(serie.close, v.giorni)));
  return [...perVariante, mediaEsposizioni(perVariante)];
}

/** Il risultato di una esposizione su un periodo; il giudizio solo dove serve. */
function analizza(serie, eCompleta, meta, periodo, conGiudizio) {
  const { date, close } = serie;
  const S0 = date.indexOf(periodo.primoGiornoPrima);
  const S1 = date.indexOf(ULTIMO_GIORNO);
  if (S0 < 0 || S1 < 0) throw new Error(`${periodo.id}: date del periodo non trovate`);
  const W = S1 - S0;
  const R = Array.from({ length: W }, (_, i) => close[S0 + 1 + i] / close[S0 + i] - 1);
  const e = Array.from({ length: W }, (_, i) => {
    const x = eCompleta[S0 + 1 + i];
    if (x === null) throw new Error(`${meta.nome}: esposizione mancante il ${date[S0 + 1 + i]}`);
    return x;
  });
  const curva = curvaEsposizione(e, R, COSTO_LATO);
  const curvaBH = curvaEsposizione(new Array(W).fill(1), R, COSTO_LATO);
  const giorni = date.slice(S0, S1 + 1);
  // ultimo indice di ciascun anno; l'indice 0 è la base, cioè il giorno prima del periodo
  const ultimoDi = (anno) => {
    let k = 0;
    for (let i = 0; i <= W; i++) if (giorni[i].startsWith(`${anno}-`)) k = i;
    return k;
  };
  const anniDelPeriodo = [...new Set(giorni.slice(1).map((g) => Number(g.slice(0, 4))))];
  const anni = W / GIORNI_ANNO;
  const rendimentoTotale = curva[W] - 1;
  const rendimentoBH = curvaBH[W] - 1;
  return {
    ...meta,
    W,
    giorni,
    curva,
    curvaBH,
    giudizio: conGiudizio
      ? giudicaEsposizione({ e, R, costo: COSTO_LATO, alfa: ALFA / periodo.N, escludi: ESCLUDI })
      : null,
    cambiAnno: turnoverLineare(e) / anni,
    operazioni: meta.giorni === null ? null : turnoverLineare(e) / 2,
    giorniDentro: e.reduce((somma, x) => somma + x, 0) / W,
    rendimentoTotale,
    rendimentoAnnuo: (1 + rendimentoTotale) ** (1 / anni) - 1,
    rendimentoBH,
    rendimentoAnnuoBH: (1 + rendimentoBH) ** (1 / anni) - 1,
    drawdown: drawdownMassimo(curva, 0, W),
    drawdownBH: drawdownMassimo(curvaBH, 0, W),
    pareggio: costoDiPareggio(e, R),
    vantaggio: statisticaMedia(e, R, COSTO_LATO) - statisticaMedia(new Array(W).fill(1), R, COSTO_LATO),
    annuale: anniDelPeriodo.map((anno, j) => {
      const fine = ultimoDi(anno);
      const inizio = j === 0 ? 0 : ultimoDi(anno - 1);
      return {
        anno,
        regola: curva[fine] / curva[inizio] - 1,
        buyAndHold: curvaBH[fine] / curvaBH[inizio] - 1
      };
    })
  };
}

function tabellaRisultati(risultati) {
  return [
    "| esposizione | cambi all'anno | giorni dentro | rendimento totale | rendimento annuo | drawdown massimo | vantaggio sul buy and hold (p.b. al giorno) | costo di pareggio per lato | statistica (p.b. al giorno) | p | esito |",
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|",
    ...risultati.map(
      (r) =>
        `| ${r.etichetta} | ${numero(r.cambiAnno, 1)} | ${percento(r.giorniDentro)} | ${percento(r.rendimentoTotale)} | ${percento(r.rendimentoAnnuo)} | ${percento(r.drawdown)} | ${numero(r.vantaggio * 10000)} | ${pareggioTesto(r)} | ${numero(r.giudizio.osservata * 10000)} | ${numero(r.giudizio.p, 5)} | ${r.giudizio.passa ? "**passa**" : "non passa"} |`
    )
  ];
}

function tabellaAnnuale(risultati) {
  const bh = risultati[0];
  return [
    `| anno | ${risultati.map((r) => r.etichetta).join(" | ")} | buy and hold |`,
    `|---|${risultati.map(() => "---:").join("|")}|---:|`,
    ...bh.annuale.map(
      (a, i) =>
        `| ${a.anno} | ${risultati.map((r) => percento(r.annuale[i].regola)).join(" | ")} | ${percento(a.buyAndHold)} |`
    )
  ];
}

function tabellaEur(informativa) {
  return [
    "| esposizione | giorni dentro | rendimento totale | buy and hold |",
    "|---|---:|---:|---:|",
    ...informativa.map(
      (r) => `| ${r.etichetta} | ${percento(r.giorniDentro)} | ${percento(r.rendimentoTotale)} | ${percento(r.rendimentoBH)} |`
    )
  ];
}

function rapporto({ principale, eurPrincipale, replica, eurReplica }) {
  const g = principale.giudizio;
  const gr = replica[0].giudizio;
  const passanoReplica = replica.filter((r) => r.giudizio.passa).map((r) => r.etichetta);
  return [
    "# Test di Detzel, Liu, Strauss, Zhou e Zhu (2021): medie mobili su Bitcoin",
    "",
    "Pre-registrazione: registro/esperimenti.md, sezione «test di Detzel, Liu, Strauss, Zhou e Zhu (2021) su XBTUSD», scritta il 18 ottobre 2026 prima dei dati.",
    "",
    `**Verdetto (test principale):** ${g.passa ? "passa" : "non passa"}. p ${numero(g.p, 5)} contro soglia ${numero(ALFA, 2)}; rendimento netto totale ${percento(g.rendimentoNettoTotale)}.`,
    "",
    `**Test secondario (replica):** ${passanoReplica.length ? `passano ${passanoReplica.join(", ")}` : "nessuna esposizione passa"}. Non decide il verdetto.`,
    "",
    "## Test principale: media a 7 giorni, dal 1 aprile 2022 al 28 giugno 2026",
    "",
    `Giudice: rotazione circolare delle esposizioni, ${g.spostamenti} spostamenti (s = 31…${principale.W - 31}), senza seme. N = ${PRINCIPALE.N}, alfa ${numero(ALFA, 2)}, soglia ${numero(ALFA / PRINCIPALE.N, 2)}. Il minimo raggiungibile di p è ${numero(1 / (g.spostamenti + 1), 5)}. Periodo: ${principale.W} giorni.`,
    "",
    `Costi: ${numero(COSTO_LATO * 100)}% per lato e per unità di variazione di esposizione, cioè ${numero(COSTO_LATO * 200)}% per operazione intera.`,
    "",
    ...tabellaRisultati([principale]),
    "",
    `Buy and hold nello stesso periodo: rendimento totale ${percento(principale.rendimentoBH)}, annuo ${percento(principale.rendimentoAnnuoBH)}, drawdown massimo ${percento(principale.drawdownBH)}.`,
    "",
    "Anno per anno (solo informativo; il primo e l'ultimo anno sono parziali):",
    "",
    ...tabellaAnnuale([principale]),
    "",
    "XBTEUR (solo confronto, nessun giudizio):",
    "",
    ...tabellaEur([eurPrincipale]),
    "",
    "## Test secondario: replica delle sei esposizioni, dal 1 gennaio 2021 al 28 giugno 2026",
    "",
    `Giudice: rotazione circolare delle esposizioni, ${gr.spostamenti} spostamenti (s = 31…${replica[0].W - 31}), senza seme. N = ${REPLICA.N}, alfa ${numero(ALFA, 2)}, soglia ${numero(ALFA / REPLICA.N, 5)}. Il minimo raggiungibile di p è ${numero(1 / (gr.spostamenti + 1), 5)}. Periodo: ${replica[0].W} giorni.`,
    "",
    ...tabellaRisultati(replica),
    "",
    `Buy and hold nello stesso periodo: rendimento totale ${percento(replica[0].rendimentoBH)}, annuo ${percento(replica[0].rendimentoAnnuoBH)}, drawdown massimo ${percento(replica[0].drawdownBH)}.`,
    "",
    "Costo per lato che azzera il vantaggio, confronto con la tabella 6 dello studio (versione 2018, riassunta da CXO Advisory). Il nostro è definito come nella pre-registrazione: il confronto è indicativo.",
    "",
    "| esposizione | qui | studio |",
    "|---|---:|---:|",
    ...replica.map((r) => `| ${r.etichetta} | ${pareggioTesto(r)} | ${r.studio} |`),
    "",
    "Anno per anno (solo informativo; il primo e l'ultimo anno sono parziali):",
    "",
    ...tabellaAnnuale(replica),
    "",
    "XBTEUR (solo confronto, nessun giudizio):",
    "",
    ...tabellaEur(eurReplica),
    "",
    "## Scostamenti dal metodo",
    "",
    "(a) Equazione 16 dello studio: S_t · r_t; qui S_t si applica a r_(t+1), l'unica versione eseguibile. (b) Liquidità a rendimento zero; lo studio usa il tasso privo di rischio. (c) Prezzi Kraken invece di CoinDesk; il test principale è su 2022–2026, fuori dal campione dello studio e da quello di Wei e colleghi. (d) Esclusione entro 30 giorni dallo zero: scelta di questo test. (e) Vantaggio sul buy and hold misurato come rendimento netto medio giornaliero: la definizione dello studio potrebbe differire. (f) La regola di Wei e colleghi è letta come segno del rapporto logaritmico con la media a 7 giorni. (g) Nella nulla i costi sono quelli della serie circolare; nella serie osservata la posizione è piatta ai bordi.",
    "",
    "«Non definito» vuol dire che la regola non ha un costo positivo di pareggio: il vantaggio è già negativo a costo zero, o la regola non cambia più del buy and hold.",
    "",
    "---",
    "",
    "Simulazione su carta. Nessuna operazione reale, nessuna chiave, nessuna consulenza."
  ];
}

function main() {
  const registroPath = daRadice("registro", "esperimenti.md");
  const registro = fs.readFileSync(registroPath, "utf8");
  if (registro.includes("| detzel-")) throw new Error("il test di Detzel et al. è già stato eseguito");

  const usd = caricaCandele("XBTUSD");
  const eur = caricaCandele("XBTEUR");
  const eUsd = esposizioniCompleta(usd);
  const eEur = esposizioniCompleta(eur);

  const principale = analizza(usd, eUsd[0], VARIANTI[0], PRINCIPALE, true);
  const eurPrincipale = analizza(eur, eEur[0], VARIANTI[0], PRINCIPALE, false);
  const replica = TUTTE.map((meta, i) => analizza(usd, eUsd[i], meta, REPLICA, true));
  const eurReplica = TUTTE.map((meta, i) => analizza(eur, eEur[i], meta, REPLICA, false));

  fs.mkdirSync(daRadice("report", "dati"), { recursive: true });
  const curve = [
    { periodo: PRINCIPALE.id, r: principale },
    ...replica.map((r) => ({ periodo: REPLICA.id, r }))
  ];
  for (const { periodo, r } of curve) {
    const dati = {
      test: periodo,
      esposizione: r.nome,
      coppia: "XBTUSD",
      nota: "curva a base 1 il giorno prima del periodo; il costo di ingresso iniziale è già nella curva se la posizione è aperta",
      giorni: r.giorni,
      regola: r.curva,
      buyAndHold: r.curvaBH
    };
    fs.writeFileSync(daRadice("report", "dati", `detzel-${periodo}-${r.nome}.json`), JSON.stringify(dati) + "\n", "utf8");
  }

  fs.writeFileSync(
    daRadice("report", "detzel.md"),
    rapporto({ principale, eurPrincipale, replica, eurReplica }).join("\n") + "\n",
    "utf8"
  );

  const dataOggi = new Date().toISOString().slice(0, 16).replace("T", " ");
  const impronta = crypto
    .createHash("sha256")
    .update(JSON.stringify({ VARIANTI, PRINCIPALE, REPLICA, ULTIMO_GIORNO, COSTO_LATO, ESCLUDI, ALFA }))
    .digest("hex")
    .slice(0, 10);
  const righe = curve.map(({ periodo, r }) => {
    const periodoTesto = periodo === PRINCIPALE.id ? "1 apr 2022 → 28 giu 2026" : "1 gen 2021 → 28 giu 2026";
    const operazioni = r.operazioni === null ? "—" : numero(r.operazioni, 0);
    return (
      `| ${dataOggi} | detzel-${periodo}-${r.nome} | XBTUSD | ${impronta} | ${periodoTesto} | ${operazioni} | ` +
      `rendimento ${percento(r.rendimentoTotale)} (buy and hold ${percento(r.rendimentoBH)}) | ` +
      `${numero((r.rendimentoTotale - r.rendimentoBH) * 100)} punti | ${percento(r.drawdown)} | ` +
      `Detzel et al. 2021, ${r.etichetta}, ${periodo}: ${r.giudizio.passa ? "passa" : "non passa"}; costo di pareggio ${pareggioTesto(r)}; statistica ${numero(r.giudizio.osservata * 10000)} p.b. al giorno; p ${numero(r.giudizio.p, 5)} |`
    );
  });
  fs.appendFileSync(registroPath, righe.join("\n") + "\n", "utf8");

  console.log(
    `Test scritto in report/detzel.md: principale ${principale.giudizio.passa ? "passa" : "non passa"}; ` +
      `replica, ${replica.filter((r) => r.giudizio.passa).length} esposizioni su ${TUTTE.length} passano.`
  );
}

try {
  main();
} catch (errore) {
  console.error(`test interrotto: ${errore.message}`);
  process.exitCode = 1;
}
