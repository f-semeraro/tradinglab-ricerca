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
 *   4. le verifica sull'ULTIMO ANNO, una sola volta per candidato;
 *   5. promuove nel giro (strategie/) solo quelle che passano il giudizio, con
 *      una soglia che tiene conto di tutte le strategie mai provate.
 *
 * Tutto va in registro/ricerca.csv, che è sola aggiunta: ogni prova resta
 * scritta, anche le perdenti. È questo che rende onesto il conto di N.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  generatore,
  campionaStrategia,
  impronta,
  valutaSuCoppie,
  statistiche,
  giudica,
  sogliaT,
  correlazioneMedia,
  coppieEffettive
} from "../lib/ricerca.js";
import { problemiStrategia } from "../lib/configurazione.js";
import { giornoUTCInSecondi, formattaMomento } from "../lib/tempo.js";
import { leggiJson, scriviAtomico, scriviJson } from "../lib/persistenza.js";

const RADICE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dentro = (...parti) => path.join(RADICE, ...parti);
const REGISTRO = dentro("registro", "ricerca.csv");
const INTESTAZIONE =
  "data_utc,seme,id,fase,N,operazioni,media_eccesso,quota_coppie_vincenti,correlazione,coppie_effettive,t,soglia,esito,motivi\n";
const COLONNA_ESITO = 12;
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

/** Le righe già scritte nel registro: quali strategie sono state provate e quali verificate. */
function leggiRegistro() {
  if (!fs.existsSync(REGISTRO)) return [];
  return fs.readFileSync(REGISTRO, "utf8").trim().split("\n").slice(1).map((riga) => {
    const c = riga.split(",");
    return { seme: c[1], id: c[2], fase: c[3], esito: c[COLONNA_ESITO] };
  });
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

  const registro = leggiRegistro();

  /* un seme è una lotteria da giocare una volta: rilanciarlo per sbaglio cercherebbe
     altri candidati e brucerebbe l'ultimo anno. Per una nuova ricerca, un nuovo seme. */
  if (registro.some((r) => r.seme === String(cfg.seme) && r.fase === "ricerca")) {
    throw new Error(`il seme ${cfg.seme} è già stato usato: per una nuova ricerca cambia "seme" in ricerca.json`);
  }

  const giaProvate = new Set(registro.filter((r) => r.fase === "ricerca").map((r) => r.id));
  const giaVerificate = new Set(registro.filter((r) => r.fase === "verifica").map((r) => r.id));

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
    righeRegistro.push(riga([data, cfg.seme, s.id, "ricerca", N, operazioni, stat.media?.toFixed(4), quota.toFixed(4), "", "", "", "", "", ""]));
  }

  /* 3. scegliere le migliori fra quelle che hanno negoziato e non sono ancora state verificate */
  const negoziate = valutati
    .filter((v) => v.operazioni >= cfg.minimoOperazioniRicerca && v.media !== null)
    .filter((v) => !giaVerificate.has(v.s.id))
    .sort((a, b) => b.media - a.media);
  const daVerificare = negoziate.slice(0, cfg.candidatiVerifica);

  /* 4. verificare sull'ultimo anno, una sola volta per candidato */
  // quante coppie contano davvero sull'ultimo anno: le criptovalute si muovono insieme
  const rho = correlazioneMedia(serie, finestraVerifica.da, finestraVerifica.a);

  const verifiche = [];
  for (const v of daVerificare) {
    const risultati = valutaSuCoppie(v.s, serie, finestraVerifica, configurazioneBase);
    const g = giudica(risultati, {
      N,
      alfa: cfg.alfa,
      quotaMinima: cfg.quotaMinima,
      minimoOperazioni: cfg.minimoOperazioni,
      correlazione: rho
    });
    verifiche.push({ ...v, giudizio: g });
    righeRegistro.push(riga([
      data, cfg.seme, v.s.id, "verifica", N, g.operazioni, g.media?.toFixed(4), g.quota.toFixed(4),
      rho === null ? "" : rho.toFixed(4), g.Meff.toFixed(3),
      g.t === null ? "" : g.t.toFixed(3), g.soglia.toFixed(3), g.passa ? "promossa" : "scartata", g.motivi.join("; ")
    ]));
  }

  /* 5. promuovere nel giro solo chi passa, e scrivere il registro */
  aggiungiRegistro(righeRegistro);

  const promosse = verifiche.filter((v) => v.giudizio.passa);
  for (const v of promosse) {
    // le strategie cercate girano sulle candele giornaliere, su tutte le coppie che hanno validato
    const strategia = {
      nome: v.s.nome,
      origine: { seme: cfg.seme, verificataIl: data },
      intervallo: INTERVALLO,
      coppie: coppie,
      ingresso: v.s.ingresso,
      uscita: v.s.uscita,
      rischio: v.s.rischio,
      costi: v.s.costi
    };
    scriviJson(dentro("strategie", `${v.s.nome}.json`), strategia);
  }

  /* il report della corsa: sovrascritto, perché è lo specchio dell'ultima corsa */
  const giorno = (momento) => formattaMomento(momento, fuso, { conAnno: true });
  const righeReport = [
    `# Ricerca — seme ${cfg.seme}`,
    "",
    `Strategie generate: ${candidati.length}. Provate in tutto (N, per la soglia): ${N}.`,
    `Finestra di ricerca: candele dal ${giorno(serie[coppie[0]][0].momento)} fino a quella che apre il ${giorno(finestraRicerca.a - DURATA)} (inclusa).`,
    `Finestra di verifica (l'ultimo anno, una sola volta per candidato): dalla candela che apre il ${giorno(finestraVerifica.da)}.`,
    `Soglia del t con ${N} prove e alfa ${cfg.alfa}: ${numero(sogliaT(N, cfg.alfa))}.`,
    `Correlazione media fra le ${coppie.length} coppie nell'ultimo anno: ${rho === null ? "non misurabile" : numero(rho)}. ` +
    `Contano come ${numero(coppieEffettive(coppie.length, rho), 1)} prove indipendenti, non ${coppie.length}.`,
    "",
    `Scartate perché non hanno mai negoziato (meno di ${cfg.minimoOperazioniRicerca} operazioni): ${valutati.filter((v) => v.operazioni < cfg.minimoOperazioniRicerca).length}.`,
    "",
    "## Verifiche di questa corsa",
    ""
  ];
  if (verifiche.length === 0) {
    righeReport.push("Nessun candidato da verificare: tutte le strategie generate sono state già verificate o non hanno negoziato.", "");
  } else {
    righeReport.push("| strategia | operazioni | media eccesso (punti) | coppie che battono | t | esito |", "|---|---:|---:|---:|---:|---|");
    for (const v of verifiche) {
      const g = v.giudizio;
      righeReport.push(`| ${v.s.nome} | ${g.operazioni} | ${numero(g.media)} | ${Math.round(g.quota * 100)}% | ${numero(g.t)} | ${g.passa ? "**promossa**" : "scartata"} |`);
    }
    righeReport.push("");
    const motivi = verifiche.filter((v) => !v.giudizio.passa);
    if (motivi.length > 0) {
      righeReport.push("Perché le scartate non passano:", "");
      for (const v of motivi) righeReport.push(`- ${v.s.nome}: ${v.giudizio.motivi.join("; ")}`);
      righeReport.push("");
    }
  }
  righeReport.push(
    promosse.length > 0
      ? `Promosse nel giro: ${promosse.map((v) => v.s.nome).join(", ")}. Dal prossimo giro orario sono in strategie/.`
      : "**Nessuna strategia è passata la verifica.** È un risultato valido: significa che in questi dati non c'è niente che batta il «comprato e basta» in modo non casuale.",
    "",
    "---",
    "",
    "Simulazione su carta. Nessun soldo vero, nessuna chiave, nessuna consulenza."
  );
  scriviAtomico(dentro("report", `ricerca-${cfg.seme}.md`), righeReport.join("\n") + "\n");

  console.log(`ricerca seme ${cfg.seme}: ${candidati.length} strategie generate, ${negoziate.length} hanno negoziato, ${verifiche.length} verificate, ${promosse.length} promosse. N = ${N}.`);
}

try {
  main();
} catch (errore) {
  console.error(`ricerca interrotta: ${errore.message}`);
  process.exitCode = 1;
}
