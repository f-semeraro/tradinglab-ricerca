/**
 * lib/dashboard.js — la pagina pubblica del laboratorio: un solo file HTML, con CSS e grafici dentro.
 *
 * Funzioni pure: ricevono gli elementi che il giro ha lasciato su disco e restituiscono testo. Non
 * decidono niente, non leggono file, non usano la rete; la pagina stessa non fa nessuna richiesta.
 *
 * I numeri vengono dalle stesse funzioni che scrivono risultati/SINTESI.md (vedi lib/sintesi.js) e
 * si scrivono con lib/formato.js: la pagina e la sintesi dicono le stesse cose, con le stesse cifre.
 * Un dato che non esiste ancora si scrive «non ancora disponibile», mai come uno zero.
 */

import { avvisi, datiSezionePortafoglio, datiMonete, testoVerdettoPortafoglio } from "./portafoglioSintesi.js";
import { datiSezioneGiornaliera, dettaglioGiornaliera, testoVerdettoGiornaliera } from "./giornalieraProva.js";
import { datiSintesiSettimanale } from "./prova.js";
import { datiLegacy, etichettaCandele } from "./sintesi.js";
import { allarmeGiro, ORE_MASSIME_SENZA_GIRO } from "./verdettoPortafoglio.js";
import { risultatoNonRealizzato } from "./portafoglio.js";
import { formattaMomento } from "./tempo.js";
import { numero, percento } from "./formato.js";

export const MANCANTE = "non ancora disponibile";
const FUSO_PAGINA = "Europe/Rome";
const PUNTI_MASSIMI = 400; // una curva oraria di mesi non serve punto per punto a un grafico largo 640

/* ------------------------------------------------------------------ */
/* i numeri                                                            */
/* ------------------------------------------------------------------ */

const ilNumero = (valore, decimali = 2) => (Number.isFinite(valore) ? numero(valore, decimali) : MANCANTE);
/** Una percentuale già in punti percentuali (come quelle di calcolaMetriche). */
const inPunti = (valore) => (Number.isFinite(valore) ? `${numero(valore)}%` : MANCANTE);
/** Una frazione scritta come percentuale. */
const inFrazione = (valore) => (Number.isFinite(valore) ? percento(valore) : MANCANTE);
const differenza = (valore) => (Number.isFinite(valore) ? `${numero(valore)} punti` : MANCANTE);

/** Lo stato del giro: quando ha girato l'ultima volta e se è fermo da più di 24 ore. */
export function statoGiro({ ultimoGiroMs, adessoMs }) {
  const allarme = allarmeGiro({ ultimoGiroMs, adessoMs });
  const noto = Number.isFinite(ultimoGiroMs);
  return {
    ultimoGiroMs: noto ? ultimoGiroMs : null,
    quando: noto ? formattaMomento(ultimoGiroMs / 1000, FUSO_PAGINA, { conAnno: true }) : null,
    ore: noto ? (adessoMs - ultimoGiroMs) / 3600000 : null,
    fermo: allarme.attivo,
    motivo: allarme.motivo
  };
}

/** La data di un istante in secondi, per esteso: «2 novembre 2026». */
function dataLunga(secondi, fuso) {
  return new Intl.DateTimeFormat("it-IT", { timeZone: fuso, day: "numeric", month: "long", year: "numeric" }).format(new Date(secondi * 1000));
}

const daPartenza = (partenza, fuso) => (partenza ? ` dalla partenza del ${dataLunga(Date.parse(`${partenza}T00:00:00Z`) / 1000, fuso)}` : "");

/** Una curva {momento, valore} in base 100 da una serie di istantanee; le istantanee senza valore si saltano. */
function curvaIstantanee(istantanee, capitale, campo) {
  return istantanee
    .filter((i) => Number.isFinite(i[campo]))
    .map((i) => ({ momento: i.momento, valore: (i[campo] / capitale) * 100 }));
}

/** Una curva in base 1 della variante giornaliera, con la base alla chiusura del giorno prima della partenza. */
function curvaGiornaliera(curva, partenza) {
  const base = Date.parse(`${partenza}T00:00:00Z`) / 1000;
  return curva.map((valore, k) => ({ momento: base + k * 86400, valore: valore * 100 }));
}

/** Le operazioni chiuse di uno stato del portafoglio di carta, nella forma della tabella. */
function operazioniDiStato(prova, stato) {
  return (stato.operazioni ?? []).map((o) => ({
    prova,
    moneta: o.mercato ?? stato.configurazione?.mercato ?? "—",
    ingresso: o.momentoIngresso,
    uscita: o.momentoUscita,
    risultato: o.risultatoPercento,
    motivo: o.motivoUscita ?? o.uscitaScattata ?? "—"
  }));
}

/** La posizione aperta di uno stato, con il risultato non realizzato al prezzo dato, o null. */
function posizioneDiStato(moneta, stato, prezzo) {
  if (!stato.posizione) return null;
  return {
    moneta,
    dal: stato.posizione.momentoIngresso,
    risultato: risultatoNonRealizzato(stato.posizione, prezzo)?.percento ?? null,
    prezzo: "all'ultima chiusura nota"
  };
}

const NESSUN_VERDETTO = "nessun verdetto pre-registrato per questa prova";

function provaPortafoglio(elementi, lab, fuso) {
  const d = datiSezionePortafoglio({ elementi, capitale: lab.capitaleIniziale });
  const nome = elementi[0].nome;
  return {
    id: `prova-${nome}`,
    titolo: nome,
    descrizione: `Regola B di Liu e Tsyvinski su ${elementi.length} monete, a pesi uguali e senza ribilanciamento: una decisione a settimana, alla chiusura della domenica.`,
    curva: d.curvaP,
    curvaBH: d.curvaBH,
    numeri: [
      ["rendimento", inFrazione(d.p.rendimento)],
      ["buy and hold", inFrazione(d.bh.rendimento)],
      ["differenza", differenza(d.differenza)],
      ["drawdown massimo", inFrazione(d.p.drawdown)],
      ["drawdown del buy and hold", inFrazione(d.bh.drawdown)],
      ["operazioni chiuse", String(d.operazioni)],
      ["tempo trascorso", `${d.settimane} settimane${daPartenza(elementi[0].partenza, fuso)}`],
      ["verdetto", testoVerdettoPortafoglio(d.verdetto)],
      ["campione", d.etichetta]
    ],
    posizioni: elementi
      .map((e) => posizioneDiStato(e.coppia, e.stato, e.stato.istantanee?.at(-1)?.prezzo ?? null))
      .filter(Boolean),
    monete: datiMonete(elementi, lab.capitaleIniziale).map((m) => ({
      moneta: m.coppia,
      dentro: m.aperta,
      moneta_dalla_partenza: inFrazione(m.buyAndHold),
      operazioni: String(m.operazioni)
    })),
    operazioni: elementi.flatMap((e) => operazioniDiStato(nome, e.stato)),
    verdettoPortafoglio: d.verdetto
  };
}

function provaGiornaliera(giornaliera, verdettoPortafoglio, fuso) {
  const base = {
    id: `prova-${giornaliera.nome}`,
    titolo: giornaliera.nome,
    descrizione: "Variante giornaliera della regola B sulle stesse monete: rendimento a 7 giorni controllato ogni giorno, posizione tenuta 7 giorni e rinnovata se il segnale c'è ancora."
  };
  if (!giornaliera.dati) {
    return { ...base, curva: [], curvaBH: [], numeri: [["tempo trascorso", `in attesa della partenza di lunedì ${giornaliera.partenza}`]], posizioni: [], monete: [], operazioni: [] };
  }
  const d = datiSezioneGiornaliera(giornaliera.dati);
  const dettaglio = dettaglioGiornaliera(giornaliera.dati, giornaliera.partenza);
  // il verdetto della variante arriva con quello di b-portafoglio: quello che manca è lo stesso
  const quandoArriva = giornaliera.verdetto || !verdettoPortafoglio
    ? ""
    : `, che arriva con quello di b-portafoglio (${testoVerdettoPortafoglio(verdettoPortafoglio)})`;
  return {
    ...base,
    curva: curvaGiornaliera(d.curvaP, giornaliera.partenza),
    curvaBH: curvaGiornaliera(d.curvaBH, giornaliera.partenza),
    numeri: [
      ["rendimento", inFrazione(d.p.rendimento)],
      ["buy and hold", inFrazione(d.bh.rendimento)],
      ["differenza", differenza(Number.isFinite(d.p.rendimento) && Number.isFinite(d.bh.rendimento) ? (d.p.rendimento - d.bh.rendimento) * 100 : null)],
      ["drawdown massimo", inFrazione(d.p.drawdown)],
      ["drawdown del buy and hold", inFrazione(d.bh.drawdown)],
      ["operazioni chiuse", String(d.operazioni)],
      ["tempo trascorso", `${d.giorni} giorni${daPartenza(giornaliera.partenza, fuso)}`],
      ["verdetto", `${testoVerdettoGiornaliera(giornaliera.verdetto)}${quandoArriva}`],
      ["campione", d.etichetta]
    ],
    posizioni: dettaglio
      .filter((m) => m.posizioneAperta)
      .map((m) => ({ moneta: m.coppia, dal: m.posizioneAperta.momentoIngresso, risultato: m.posizioneAperta.risultato * 100, prezzo: "alla chiusura di ieri" })),
    monete: dettaglio.map((m) => ({
      moneta: m.coppia,
      dentro: m.dentro,
      moneta_dalla_partenza: inFrazione(m.buyAndHold),
      operazioni: String(m.operazioniChiuse.length),
      nota: m.tolta ? "tolta dal listino" : ""
    })),
    operazioni: dettaglio.flatMap((m) => m.operazioniChiuse.map((o) => ({
      prova: giornaliera.nome,
      moneta: m.coppia,
      ingresso: o.momentoIngresso,
      uscita: o.momentoUscita,
      risultato: o.risultato * 100,
      motivo: o.motivo
    })))
  };
}

function provaSettimanale(e, lab) {
  const d = datiSintesiSettimanale({ stato: e.stato, storia: e.storia });
  const base = {
    id: `prova-${e.nome}-${e.coppia}`,
    titolo: `${e.nome} · ${e.coppia}`,
    descrizione: `Regola B di Liu e Tsyvinski su ${e.coppia}: dentro la settimana dopo un rendimento settimanale nel quinto più alto, eseguita al lunedì.`,
    curva: curvaIstantanee(e.stato.istantanee, lab.capitaleIniziale, "portafoglio"),
    curvaBH: curvaIstantanee(e.stato.istantanee, lab.capitaleIniziale, "mercato"),
    monete: [],
    operazioni: operazioniDiStato(`${e.nome} · ${e.coppia}`, e.stato)
  };
  if (!d) {
    return { ...base, numeri: [["rendimento", MANCANTE], ["verdetto", NESSUN_VERDETTO]], posizioni: [] };
  }
  const m = d.metriche;
  return {
    ...base,
    numeri: [
      ["rendimento", inPunti(m.variazionePercento)],
      ["buy and hold", inPunti(m.benchmark.mercato.variazione)],
      ["differenza", differenza(m.benchmark.differenzaDalMercato)],
      ["drawdown massimo", e.stato.istantanee.length >= 2 ? inFrazione(d.drawdown) : MANCANTE],
      ["operazioni chiuse", String(m.operazioni.chiuse)],
      ["settimane in posizione", `${numero(d.percentualeDentro, 1)}% di ${d.settimane}`],
      ["tempo trascorso", `${d.settimane} settimane della prova`],
      ["verdetto", NESSUN_VERDETTO],
      ["campione", d.campione]
    ],
    posizioni: [posizioneDiStato(e.coppia, e.stato, d.prezzo)].filter(Boolean)
  };
}

function provaLegacy(e) {
  const d = datiLegacy({ stato: e.stato });
  const base = {
    id: `prova-${e.nome}-${e.coppia}`,
    titolo: `${e.nome} · ${e.coppia}`,
    descrizione: `Strategia a blocchi della guida su ${e.coppia}, candele ${etichettaCandele(e.intervallo)}: decide a ogni candela chiusa.`,
    curva: [],
    curvaBH: [],
    monete: [],
    operazioni: operazioniDiStato(e.nome, e.stato)
  };
  if (!d) {
    return { ...base, numeri: [["capitale", "in attesa di candele"], ["verdetto", NESSUN_VERDETTO]], posizioni: [] };
  }
  const m = d.metriche;
  const capitale = e.stato.configurazione.capitaleIniziale;
  return {
    ...base,
    curva: curvaIstantanee(e.stato.istantanee, capitale, "portafoglio"),
    curvaBH: curvaIstantanee(e.stato.istantanee, capitale, "mercato"),
    numeri: [
      ["capitale", `${ilNumero(m.capitaleAttuale)} €`],
      ["rendimento", inPunti(m.variazionePercento)],
      ["buy and hold", inPunti(m.benchmark.mercato.variazione)],
      ["differenza", differenza(m.benchmark.differenzaDalMercato)],
      ["drawdown massimo", m.drawdownMassimo === null ? MANCANTE : `${numero(m.drawdownMassimo)}%`],
      ["operazioni chiuse", String(m.operazioni.chiuse)],
      ["tempo trascorso", m.giorniFunzionamento === null ? MANCANTE : `${m.giorniFunzionamento} giorni`],
      ["verdetto", NESSUN_VERDETTO],
      ["campione", m.affidabilita.testo]
    ],
    posizioni: [posizioneDiStato(e.coppia, e.stato, d.prezzo)].filter(Boolean)
  };
}

/**
 * Tutto quello che la pagina mostra, già calcolato: lo stato del giro, una sezione per prova, le
 * operazioni chiuse dalla più recente.
 *
 * @param {object} args
 * @param {object} args.lab           laboratorio.json
 * @param {Array} args.elementi       gli elementi della sintesi (lib/laboratorio.js, elementiSalvati)
 * @param {object|null} args.giornaliera  il risultato di sintesiGiornaliera(), o null
 * @param {number|null} args.ultimoGiroMs
 * @param {number} args.adessoMs      quando si genera la pagina
 */
export function datiDashboard({ lab, elementi, giornaliera = null, ultimoGiroMs, adessoMs }) {
  const fuso = lab.fusoOrario;
  const portafoglio = elementi.filter((e) => e.portafoglio);
  const prove = [];
  const pPortafoglio = portafoglio.length > 0 ? provaPortafoglio(portafoglio, lab, fuso) : null;
  if (pPortafoglio) prove.push(pPortafoglio);
  if (giornaliera) prove.push(provaGiornaliera(giornaliera, pPortafoglio?.verdettoPortafoglio ?? null, fuso));
  for (const e of elementi.filter((x) => x.settimanale && !x.portafoglio)) prove.push(provaSettimanale(e, lab));
  for (const e of elementi.filter((x) => !x.settimanale)) prove.push(provaLegacy(e));

  // gli stessi avvisi della sintesi, tranne quello sul giro, che qui ha una riga sua
  const altriAvvisi = [
    ...avvisi({ elementi, adessoMs, ultimoGiroPrecedente: ultimoGiroMs }).filter((r) => !r.startsWith("> ⚠ Il giro:")),
    ...(giornaliera?.avvisi ?? [])
  ].map((r) => r.replace(/^> ⚠ /, ""));

  return {
    fuso,
    capitale: lab.capitaleIniziale,
    generataMs: adessoMs,
    giro: { ...statoGiro({ ultimoGiroMs, adessoMs }), avvisi: altriAvvisi },
    prove,
    operazioni: prove.flatMap((p) => p.operazioni).sort((a, b) => b.uscita - a.uscita)
  };
}

/* ------------------------------------------------------------------ */
/* la pagina                                                           */
/* ------------------------------------------------------------------ */

const esc = (testo) =>
  String(testo).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** Al più `massimo` punti, presi a passo regolare; il primo e l'ultimo restano sempre. */
function diradare(punti, massimo) {
  if (punti.length <= massimo) return punti;
  const passo = (punti.length - 1) / (massimo - 1);
  return Array.from({ length: massimo }, (_, i) => punti[Math.round(i * passo)]);
}

/** Il grafico della curva della prova, con il buy and hold tratteggiato e la linea del capitale iniziale. */
export function graficoCurve(curva, curvaBH, fuso) {
  if (curva.length < 2) {
    return `<p class="mancante">Curva ${MANCANTE}: serve almeno una seconda istantanea dopo la partenza.</p>`;
  }
  const W = 640;
  const H = 220;
  const m = { sinistra: 52, destra: 12, sopra: 12, sotto: 30 };
  const serie = [diradare(curva, PUNTI_MASSIMI), diradare(curvaBH, PUNTI_MASSIMI)];
  const tutti = [...serie[0], ...serie[1]];
  const t0 = Math.min(...tutti.map((p) => p.momento));
  const t1 = Math.max(...tutti.map((p) => p.momento));
  let yMin = Math.min(100, ...tutti.map((p) => p.valore));
  let yMax = Math.max(100, ...tutti.map((p) => p.valore));
  const margine = (yMax - yMin) * 0.08 || 1;
  yMin -= margine;
  yMax += margine;
  const x = (t) => m.sinistra + ((t - t0) / (t1 - t0 || 1)) * (W - m.sinistra - m.destra);
  const y = (v) => m.sopra + (1 - (v - yMin) / (yMax - yMin)) * (H - m.sopra - m.sotto);
  const linea = (punti) => punti.map((p) => `${x(p.momento).toFixed(1)},${y(p.valore).toFixed(1)}`).join(" ");
  const giorno = (s) => new Intl.DateTimeFormat("it-IT", { timeZone: fuso, day: "numeric", month: "short" }).format(new Date(s * 1000));
  const fine = serie[0].at(-1).valore;
  const descrizione = `Capitale da 100 a ${numero(fine)}, contro il buy and hold, dal ${giorno(t0)} al ${giorno(t1)}`;
  return [
    `<svg class="grafico" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(descrizione)}">`,
    `<title>${esc(descrizione)}</title>`,
    `<line class="base" x1="${m.sinistra}" x2="${W - m.destra}" y1="${y(100).toFixed(1)}" y2="${y(100).toFixed(1)}"/>`,
    `<text class="asse" x="${m.sinistra - 6}" y="${(y(100) + 4).toFixed(1)}" text-anchor="end">100</text>`,
    `<text class="asse" x="${m.sinistra - 6}" y="${(m.sopra + 10).toFixed(1)}" text-anchor="end">${numero(yMax, 1)}</text>`,
    `<text class="asse" x="${m.sinistra - 6}" y="${H - m.sotto}" text-anchor="end">${numero(yMin, 1)}</text>`,
    `<text class="asse" x="${m.sinistra}" y="${H - 8}">${esc(giorno(t0))}</text>`,
    `<text class="asse" x="${W - m.destra}" y="${H - 8}" text-anchor="end">${esc(giorno(t1))}</text>`,
    serie[1].length >= 2 ? `<polyline class="bh" points="${linea(serie[1])}"/>` : "",
    `<polyline class="prova" points="${linea(serie[0])}"/>`,
    "</svg>",
    '<p class="legenda"><span class="segno prova"></span>la prova <span class="segno bh"></span>buy and hold <span class="segno base"></span>capitale iniziale (100)</p>'
  ].join("\n");
}

function tabella(intestazione, righe, numeriche = []) {
  const th = intestazione.map((t, i) => `<th${numeriche.includes(i) ? ' class="num"' : ""}>${esc(t)}</th>`).join("");
  const tr = righe.map((r) => `<tr>${r.map((c, i) => `<td${numeriche.includes(i) ? ' class="num"' : ""}>${esc(c)}</td>`).join("")}</tr>`).join("\n");
  return `<div class="tabella"><table><thead><tr>${th}</tr></thead><tbody>\n${tr}\n</tbody></table></div>`;
}

function sezioneProva(p, fuso) {
  const quando = (s) => formattaMomento(s, fuso, { conAnno: true });
  const numeri = p.numeri
    .map(([etichetta, valore]) => `<div><dt>${esc(etichetta)}</dt><dd class="${/\d/.test(valore) && valore.length < 40 ? "num" : ""}">${esc(valore)}</dd></div>`)
    .join("\n");
  const posizioni = p.posizioni.length === 0
    ? "<p>Nessuna posizione aperta.</p>"
    : tabella(
        ["moneta", "dal", "risultato non realizzato", "prezzo"],
        p.posizioni.map((x) => [x.moneta, quando(x.dal), inPunti(x.risultato), x.prezzo]),
        [2]
      );
  const monete = p.monete.length === 0
    ? ""
    : `<h3>Per moneta</h3>\n${tabella(
        ["moneta", "posizione", "la moneta dalla partenza", "operazioni chiuse"],
        p.monete.map((m) => [m.moneta + (m.nota ? ` (${m.nota})` : ""), m.dentro ? "dentro" : "fuori", m.moneta_dalla_partenza, m.operazioni]),
        [2, 3]
      )}\n<p class="nota">«La moneta dalla partenza» è il buy and hold della moneta, con il costo d'ingresso. Solo come informazione: il giudizio è sul portafoglio.</p>`;
  return [
    `<section id="${esc(p.id)}">`,
    `<h2>${esc(p.titolo)}</h2>`,
    `<p class="descrizione">${esc(p.descrizione)}</p>`,
    graficoCurve(p.curva, p.curvaBH, fuso),
    `<dl class="numeri">\n${numeri}\n</dl>`,
    "<h3>Posizioni aperte</h3>",
    posizioni,
    monete,
    "</section>"
  ].join("\n");
}

const STILE = `
:root { color-scheme: light dark; --sfondo: #f7f7f4; --carta: #ffffff; --testo: #1c1c1a; --tenue: #66665f; --bordo: #dcdcd5; --prova: #1d5fc4; --bh: #8a8a82; --rosso: #a51d16; --rosso-sfondo: #fde9e7; }
@media (prefers-color-scheme: dark) { :root { --sfondo: #141413; --carta: #1c1c1a; --testo: #ebebe6; --tenue: #a4a49c; --bordo: #34342f; --prova: #82b1ff; --bh: #9b9b93; --rosso: #ff8f85; --rosso-sfondo: #3b1714; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--sfondo); color: var(--testo); font: 16px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
main { max-width: 960px; margin: 0 auto; padding: 16px; }
h1 { font-size: 1.5rem; margin: 8px 0 4px; }
h2 { font-size: 1.25rem; margin: 0 0 4px; }
h3 { font-size: 1rem; margin: 20px 0 8px; }
section, .stato { background: var(--carta); border: 1px solid var(--bordo); border-radius: 10px; padding: 16px; margin: 16px 0; }
.descrizione, .nota, .legenda, .sottotitolo { color: var(--tenue); font-size: 0.9rem; }
.avviso { background: var(--rosso-sfondo); color: var(--rosso); border: 1px solid var(--rosso); border-radius: 8px; padding: 10px 12px; font-weight: 600; margin: 8px 0; }
.mancante { color: var(--tenue); font-style: italic; }
nav { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 0.95rem; }
a { color: var(--prova); }
.numeri { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 4px 24px; margin: 12px 0 0; }
.numeri div { display: flex; justify-content: space-between; gap: 12px; border-bottom: 1px solid var(--bordo); padding: 4px 0; }
.numeri dt { color: var(--tenue); }
.numeri dd { margin: 0; text-align: right; }
.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.tabella { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; font-size: 0.92rem; }
th, td { padding: 6px 8px; border-bottom: 1px solid var(--bordo); text-align: left; vertical-align: top; }
th { color: var(--tenue); font-weight: 600; }
.grafico { width: 100%; height: auto; display: block; margin-top: 8px; }
.grafico .prova { fill: none; stroke: var(--prova); stroke-width: 2; }
.grafico .bh { fill: none; stroke: var(--bh); stroke-width: 1.6; stroke-dasharray: 6 4; }
.grafico .base { stroke: var(--bordo); stroke-width: 1; }
.grafico .asse { fill: var(--tenue); font-size: 11px; font-variant-numeric: tabular-nums; }
.segno { display: inline-block; width: 22px; height: 0; vertical-align: middle; margin: 0 4px 0 10px; border-top: 2px solid var(--prova); }
.segno.bh { border-top: 2px dashed var(--bh); }
.segno.base { border-top: 1px solid var(--bordo); }
footer { color: var(--tenue); font-size: 0.9rem; text-align: center; padding: 16px 0 32px; }
`;

/** La pagina intera, pronta da scrivere in _site/index.html. */
export function paginaDashboard(dati) {
  const { giro, fuso } = dati;
  const quando = (s) => formattaMomento(s, fuso, { conAnno: true });
  const ultimo = giro.quando === null
    ? `<p>Ultimo giro: <strong>${MANCANTE}</strong>.</p>`
    : `<p>Ultimo giro: <strong>${esc(giro.quando)}</strong> (ora di Roma).</p>`;
  const avvisoFermo = giro.ultimoGiroMs === null
    ? `<p class="avviso" id="giro-fermo">Il giro: ${esc(giro.motivo)}.</p>`
    : `<p class="avviso" id="giro-fermo"${giro.fermo ? "" : " hidden"}>Il giro è fermo da più di ${ORE_MASSIME_SENZA_GIRO} ore: da <span>${giro.fermo ? numero(giro.ore, 1) : ""}</span> ore. I numeri qui sotto sono fermi a quel giro.</p>`;
  const altri = giro.avvisi.map((a) => `<p class="avviso">${esc(a)}</p>`).join("\n");
  // il controllo si rifà nel browser, con l'orologio di chi guarda: una pagina che non si aggiorna più deve dirlo da sola
  const script = giro.ultimoGiroMs === null ? "" : `<script>
(function () {
  var ultimo = ${giro.ultimoGiroMs};
  var ore = (Date.now() - ultimo) / 3600000;
  var avviso = document.getElementById("giro-fermo");
  if (avviso && ore > ${ORE_MASSIME_SENZA_GIRO}) {
    avviso.hidden = false;
    avviso.querySelector("span").textContent = ore.toFixed(1).replace(".", ",");
  }
})();
</script>`;

  const indice = dati.prove.map((p) => `<a href="#${esc(p.id)}">${esc(p.titolo)}</a>`).join("\n");
  const operazioni = dati.operazioni.length === 0
    ? "<p>Nessuna operazione chiusa, per ora.</p>"
    : tabella(
        ["prova", "moneta", "ingresso", "uscita", "risultato", "motivo"],
        dati.operazioni.map((o) => [o.prova, o.moneta, quando(o.ingresso), quando(o.uscita), inPunti(o.risultato), o.motivo]),
        [4]
      );

  return `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>TradingLab · laboratorio di ricerca</title>
<link rel="icon" href="data:,">
<style>${STILE}</style>
</head>
<body>
<main>
<h1>TradingLab · laboratorio di ricerca</h1>
<p class="sottotitolo">Prove in avanti su un portafoglio di carta, aggiornate a ogni giro. Capitale di partenza ${esc(numero(dati.capitale))} € per prova e per moneta.</p>
<div class="stato">
<h2>Stato del giro</h2>
${ultimo}
${avvisoFermo}
${altri}
<p class="nota">Pagina generata il ${esc(quando(dati.generataMs / 1000))} (ora di Roma).</p>
<nav>
${indice}
<a href="#operazioni">operazioni chiuse</a>
</nav>
</div>
${dati.prove.map((p) => sezioneProva(p, fuso)).join("\n")}
<section id="operazioni">
<h2>Operazioni chiuse</h2>
<p class="descrizione">Tutte le prove, dalla più recente. Risultato al netto dei costi.</p>
${operazioni}
</section>
<footer>Portafoglio di carta, nessun soldo vero. Non è consulenza finanziaria.</footer>
</main>
${script}
</body>
</html>
`;
}
