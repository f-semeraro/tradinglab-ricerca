/**
 * scripts/ricerca.js — il generatore: prova molte strategie, verifica le migliori.
 *
 *     npm run ricerca
 *
 * Passi:
 *   1. genera `candidati` strategie dal seme di ricerca.json (sempre le stesse
 *      per lo stesso seme);
 *   2. le valuta sulla finestra di RICERCA (tutto tranne l'ultimo anno);
 *   3. sceglie le migliori `candidatiVerifica`, che non sono mai state verificate;
 *   4. le verifica sull'ULTIMO ANNO, una sola volta per candidato, con il giudizio
 *      a permutazione (lib/giudice.js);
 *   5. mette in candidati/ chi passa. Il giro non legge quella cartella: promuovere
 *      una strategia in strategie/ richiede un commit esplicito.
 *
 * Il registro di questa versione è registro/candidati.csv, sola aggiunta. Il
 * registro/ricerca.csv della prima corsa resta com'è, con il giudizio t: serve
 * solo a sapere quali candidati sono già stati verificati e quante ipotesi sono
 * state provate in tutto (N).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  generatore,
  campionaStrategia,
  impronta,
  valutaSuCoppie,
  statistiche
} from "../lib/ricerca.js";
import { giudicaPermutazione } from "../lib/giudice.js";
import { problemiStrategia } from "../lib/configurazione.js";
import { formattaMomento } from "../lib/tempo.js";
import { leggiJson, scriviAtomico, scriviJson } from "../lib/persistenza.js";

const RADICE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dentro = (...parti) => path.join(RADICE, ...parti);
const REGISTRO_PRIMA_CORSA = dentro("registro", "ricerca.csv");
const REGISTRO = dentro("registro", "candidati.csv");
const INTESTAZIONE =
  "data_utc,seme,id,fase,N,operazioni,media_eccesso,statistica_netta,statistica_lorda,p,soglia_p,esito,motivi\n";
const COLONNA_ESITO = 11;
const DURATA = 86400; // le candele di ricerca sono giornaliere
const INTERVALLO = 1440;

const numero = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d).replace(".", ",") : "—");

function leggiCsv(percorso) {
  if (!fs.existsSync(percorso)) throw new Error(`manca ${path.relative(RADICE, percorso)}: lancia prima npm run dati`);
  const righe = fs.readFileSync(percorso, "utf8").trim().split("\n");
  righe.shift();
  return righe
    .map((r) => {
      const v = r.split(",").map(Number);
      return { momento: v[0], apertura: v[1], massimo: v[2], minimo: v[3], chiusura: v[4], volume: v[5] };
    })
    .filter((c) => Object.values(c).every(Number.isFinite))
    .sort((a, b) => a.momento - b.momento);
}

/** Le righe dei due registri: colonne seme, id, fase; l'esito solo per questo registro. */
function leggiRegistri() {
  const righe = [];
  // la prima corsa ha il vecchio formato: seme e id sono nelle stesse colonne
  if (fs.existsSync(REGISTRO_PRIMA_CORSA)) {
    for (const r of fs.readFileSync(REGISTRO_PRIMA_CORSA, "utf8").trim().split("\n").slice(1)) {
      const c = r.split(",");
      righe.push({ seme: c[1], id: c[2], fase: c[3] });
    }
  }
  if (fs.existsSync(REGISTRO)) {
    for (const r of fs.readFileSync(REGISTRO, "utf8").trim().split("\n").slice(1)) {
      const c = r.split(",");
      righe.push({ seme: c[1], id: c[2], fase: c[3], esito: c[COLONNA_ESITO] });
    }
  }
  return righe;
}

function aggiungiRegistro(righe) {
  if (!fs.existsSync(REGISTRO)) scriviAtomico(REGISTRO, INTESTAZIONE);
  fs.appendFileSync(REGISTRO, righe.join("\n") + "\n", "utf8");
}

/* una riga di CSV: i campi con virgole, virgolette o a capo vanno tra virgolette, come da standard */
const campo = (v) => {
  if (v === null || v === undefined) return "";
  const testo = String(v);
  return /[",\n]/.test(testo) ? `"${testo.replace(/"/g, '""')}"` : testo;
};
const riga = (valori) => valori.map(campo).join(",");

function main() {
  const lab = leggiJson(dentro("laboratorio.json"));
  const cfg = leggiJson(dentro("ricerca.json"));
  const base = leggiJson(dentro("strategie", "rsi-base.json"));
  if (!lab || !cfg || !base) throw new Error("mancano laboratorio.json, ricerca.json o strategie/rsi-base.json");

  const coppie = lab.coppieGiornaliere;
  const serie = Object.fromEntries(coppie.map((c) => [c, leggiCsv(dentro("dati", "storico", `${c}-${INTERVALLO}.csv`))]));
  const fuso = lab.fusoOrario;
  const rng = generatore(cfg.seme);

  // l'orologio si legge qui: decide dove finisce la ricerca e dove comincia l'ultimo anno.
  // Il confine si allinea a mezzanotte UTC: così la prima candela della verifica è un giorno intero
  const adesso = Math.floor(Date.now() / 1000);
  const confine = Math.floor((adesso - lab.escludiUltimiGiorni * 86400) / DURATA) * DURATA;
  const finestraRicerca = { da: 0, a: confine, intervallo: INTERVALLO };
  const finestraVerifica = { da: confine, a: Infinity, intervallo: INTERVALLO };
  const configurazioneBase = { capitaleIniziale: lab.capitaleIniziale, fusoOrario: fuso };
  const data = new Date().toISOString().slice(0, 16).replace("T", " ");

  const registri = leggiRegistri();

  /* un seme è una lotteria da giocare una volta: rilanciarlo per sbaglio cercherebbe
     altri candidati e brucerebbe l'ultimo anno. Per una nuova ricerca, un nuovo seme. */
  if (registri.some((r) => r.seme === String(cfg.seme) && r.fase === "ricerca")) {
    throw new Error(`il seme ${cfg.seme} è già stato usato: per una nuova ricerca cambia "seme" in ricerca.json`);
  }

  const giaProvate = new Set(registri.filter((r) => r.fase === "ricerca").map((r) => r.id));
  const giaVerificate = new Set(registri.filter((r) => r.fase === "verifica").map((r) => r.id));

  /* 1. generare i candidati, scartando quelli non validi e i duplicati */
  const candidati = [];
  const visti = new Set(giaProvate);
  let tentativi = 0;
  while (candidati.length < cfg.candidati && tentativi < cfg.candidati * 20) {
    tentativi += 1;
    const s = campionaStrategia(rng, base);
    if (problemiStrategia(s).length > 0) continue;
    const id = impronta(s);
    if (visti.has(id)) continue;
    visti.add(id);
    candidati.push({ ...s, id, nome: `ricerca-${id}` });
  }
  const N = giaProvate.size + candidati.length;

  /* 2. valutare sulla finestra di ricerca */
  const righeRegistro = [];
  const valutati = [];
  for (const s of candidati) {
    const risultati = valutaSuCoppie(s, serie, finestraRicerca, configurazioneBase);
    const stat = statistiche(risultati.map((r) => r.eccesso));
    const operazioni = risultati.reduce((somma, r) => somma + r.operazioni, 0);
    const quota = risultati.length ? risultati.filter((r) => r.eccesso > 0).length / risultati.length : 0;
    valutati.push({ s, media: stat.media, quota, operazioni });
    righeRegistro.push(riga([data, cfg.seme, s.id, "ricerca", N, operazioni, stat.media?.toFixed(4), "", "", "", "", "", ""]));
  }

  /* 3. scegliere le migliori fra quelle che hanno negoziato e non sono ancora state verificate */
  const negoziate = valutati
    .filter((v) => v.operazioni >= cfg.minimoOperazioniRicerca && v.media !== null)
    .filter((v) => !giaVerificate.has(v.s.id))
    .sort((a, b) => b.media - a.media);
  const daVerificare = negoziate.slice(0, cfg.candidatiVerifica);

  /* 4. verificare sull'ultimo anno, una sola volta per candidato, con il giudizio a permutazione.
     Le ricollocazioni usano un seme derivato dal seme di ricerca: stessa corsa, stesso risultato. */
  // il numero di ricollocazioni deve permettere di misurare la soglia: almeno 2·N/alfa
  const permutazioni = Math.max(cfg.permutazioni, Math.ceil((2 * N) / cfg.alfa));
  const rngGiudizio = generatore(cfg.seme + 1);

  const verifiche = [];
  for (const v of daVerificare) {
    const risultati = valutaSuCoppie(v.s, serie, finestraVerifica, configurazioneBase);
    const costoAndataRitorno = 2 * (v.s.costi.commissionePercentoPerLato + v.s.costi.slippagePercento);
    const comprato = statistiche(risultati.map((r) => r.comprato)).media;
    const g = giudicaPermutazione({
      gruppi: risultati.map((r) => r.gruppo),
      costoAndataRitorno,
      permutazioni,
      rng: rngGiudizio,
      N,
      alfa: cfg.alfa,
      minimoOperazioni: cfg.minimoOperazioni
    });
    verifiche.push({ ...v, giudizio: g, comprato });
    righeRegistro.push(riga([
      data, cfg.seme, v.s.id, "verifica", N, g.operazioni, "",
      g.statisticaNetta.toFixed(4), g.statisticaLorda.toFixed(4), g.p.toExponential(3), g.soglia.toExponential(3),
      g.passa ? "promossa" : "scartata", g.motivi.join("; ")
    ]));
  }

  /* 5. scrivere il registro, e mettere in candidati/ chi passa */
  aggiungiRegistro(righeRegistro);

  const promosse = verifiche.filter((v) => v.giudizio.passa);
  for (const v of promosse) {
    // in candidati/: il giro non la legge. Diventa strategia solo con un commit esplicito
    const candidato = {
      nome: v.s.nome,
      origine: { seme: cfg.seme, verificataIl: data, giudice: "permutazione" },
      intervallo: INTERVALLO,
      coppie,
      ingresso: v.s.ingresso,
      uscita: v.s.uscita,
      rischio: v.s.rischio,
      costi: v.s.costi
    };
    scriviJson(dentro("candidati", `${v.s.nome}.json`), candidato);
  }

  /* il report della corsa: sovrascritto, perché è lo specchio dell'ultima corsa */
  const giorno = (momento) => formattaMomento(momento, fuso, { conAnno: true });
  const righeReport = [
    `# Ricerca — seme ${cfg.seme}`,
    "",
    `Strategie generate: ${candidati.length}. Provate in tutto (N, per la soglia): ${N}.`,
    `Finestra di ricerca: candele dal ${giorno(serie[coppie[0]][0].momento)} fino a quella che apre il ${giorno(finestraRicerca.a - DURATA)} (inclusa).`,
    `Finestra di verifica (l'ultimo anno, una sola volta per candidato): dalla candela che apre il ${giorno(finestraVerifica.da)}.`,
    `Giudizio: permutazione del tempismo, ${permutazioni} ricollocazioni. Soglia p = alfa ${cfg.alfa} diviso ${N} ipotesi.`,
    "",
    `Scartate perché non hanno mai negoziato (meno di ${cfg.minimoOperazioniRicerca} operazioni): ${valutati.filter((v) => v.operazioni < cfg.minimoOperazioniRicerca).length}.`,
    "",
    "## Verifiche di questa corsa",
    ""
  ];
  if (verifiche.length === 0) {
    righeReport.push("Nessun candidato da verificare: tutte le strategie generate sono state già verificate o non hanno negoziato.", "");
  } else {
    righeReport.push(
      "Il risultato netto è dopo i costi; il lordo è senza costi. Il buy and hold è la media delle coppie, sullo stesso periodo.",
      "",
      "| strategia | operazioni | netto (punti) | lordo (punti) | p | soglia p | buy and hold (media) | esito |",
      "|---|---:|---:|---:|---:|---:|---:|---|"
    );
    for (const v of verifiche) {
      const g = v.giudizio;
      righeReport.push(
        `| ${v.s.nome} | ${g.operazioni} | ${numero(g.statisticaNetta)} | ${numero(g.statisticaLorda)} | ` +
        `${g.p.toExponential(2)} | ${g.soglia.toExponential(2)} | ${numero(v.comprato)}% | ${g.passa ? "**promossa**" : "scartata"} |`
      );
    }
    righeReport.push("");
    const scartate = verifiche.filter((v) => !v.giudizio.passa);
    if (scartate.length > 0) {
      righeReport.push("Perché le scartate non passano:", "");
      for (const v of scartate) righeReport.push(`- ${v.s.nome}: ${v.giudizio.motivi.join("; ")}`);
      righeReport.push("");
    }
  }
  righeReport.push(
    promosse.length > 0
      ? `Messe in candidati/: ${promosse.map((v) => v.s.nome).join(", ")}. Il giro non le esegue: per usarle serve un commit che le sposti in strategie/.`
      : "**Nessuna strategia è passata la verifica.** È un risultato valido: in questi dati non c'è niente che batta il caso in modo significativo, al netto dei costi.",
    "",
    "---",
    "",
    "Simulazione su carta. Nessun soldo vero, nessuna chiave, nessuna consulenza."
  );
  scriviAtomico(dentro("report", `ricerca-${cfg.seme}.md`), righeReport.join("\n") + "\n");

  console.log(`ricerca seme ${cfg.seme}: ${candidati.length} strategie generate, ${negoziate.length} hanno negoziato, ${verifiche.length} verificate, ${promosse.length} in candidati/. N = ${N}.`);
}

try {
  main();
} catch (errore) {
  console.error(`ricerca interrotta: ${errore.message}`);
  process.exitCode = 1;
}
