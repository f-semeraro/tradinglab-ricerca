/**
 * lib/prova.js — la prova in avanti della variante B di Liu e Tsyvinski (quinto più alto, una settimana).
 *
 * Funzioni pure: le candele e lo stato arrivano da fuori.
 *
 * Regola (congelata): la settimana appena chiusa, da domenica a domenica UTC, supera
 * l'80° percentile R7 delle settimane precedenti della stessa coppia → si tiene la coppia
 * la settimana successiva, solo lunga, con i costi di rsi-base. Qualunque modifica va
 * registrata come nuova strategia.
 *
 * Esecuzione su carta: ogni evento si esegue al prezzo di chiusura della candela oraria
 * del lunedì 00:00–01:00 UTC, cioè dopo le 01:00 del lunedì. È uno scostamento
 * dal backtest, che entra alla chiusura di domenica: si registra nel report.
 */

import { createHash } from "node:crypto";

import { rendimentiSettimanali, segnali, settimaneDentro, drawdownMassimo } from "./settimane.js";
import { nuovoStato } from "./simulazione.js";
import { apriPosizione, chiudiPosizione, valorePortafoglio, EsecuzioneImpossibile } from "./portafoglio.js";
import { registraRiferimento, valoreBenchmark } from "./benchmark.js";
import { calcolaMetriche } from "./metriche.js";

const GIORNO_MS = 86400000;
const SETTIMANA_MS = 7 * GIORNO_MS;
const ORA_SEC = 3600;

const iso = (ms) => new Date(ms).toISOString().slice(0, 10);

/**
 * Aggiunge alla storia le domeniche chiuse che mancano. La storia è una lista di
 * { data: "AAAA-MM-GG", chiusura: numero | null }, una riga per domenica, senza buchi:
 * una domenica senza candela ha chiusura null.
 */
export function aggiornaStoria(storia, candeleGiornaliere) {
  const domeniche = new Map();
  for (const c of candeleGiornaliere) {
    const d = new Date(c.momento * 1000);
    if (d.getUTCDay() === 0) domeniche.set(iso(d.getTime()), c.chiusura);
  }
  if (domeniche.size === 0) return storia;
  const date = [...domeniche.keys()].sort();
  const ultimaDisponibile = date[date.length - 1];
  const primaNuova = storia.length === 0 ? date[0] : iso(Date.parse(storia[storia.length - 1].data) + SETTIMANA_MS);
  if (Date.parse(primaNuova) > Date.parse(ultimaDisponibile)) return storia;

  const nuova = [...storia];
  for (let t = Date.parse(primaNuova); t <= Date.parse(ultimaDisponibile); t += SETTIMANA_MS) {
    const d = iso(t);
    nuova.push({ data: d, chiusura: domeniche.has(d) ? domeniche.get(d) : null });
  }
  return nuova;
}

/**
 * Le decisioni note all'ultima domenica chiusa K: la settimana W = K+1 è tenuta se il
 * segnale di K è vero. Non usa nessun dato dopo K.
 */
export function decisioniSettimanali(storia) {
  if (storia.length === 0) return null;
  const sig = segnali("B", rendimentiSettimanali(storia.map((r) => r.chiusura)));
  sig.push(null); // la settimana K+1 non ha un segnale proprio: dipende solo da quello di K
  const dentro = settimaneDentro(sig, 1);
  const K = storia.length - 1;
  return {
    K,
    W: K + 1,
    dentro,
    apre: dentro[K + 1] === true && dentro[K] === false,
    chiude: dentro[K + 1] === false && dentro[K] === true
  };
}

/** L'impronta della regola: se cambia, la prova si ferma. */
export function improntaRegola(strategia) {
  const canonico = (v) => {
    if (Array.isArray(v)) return v.map(canonico);
    if (v && typeof v === "object") return Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonico(v[k])]));
    return v;
  };
  const regola = {
    variante: strategia.variante,
    settimaneDentro: strategia.settimaneDentro,
    percentile: strategia.percentile,
    metodoPercentile: strategia.metodoPercentile,
    lato: strategia.lato,
    costi: strategia.costi,
    coppie: strategia.coppie
  };
  return createHash("sha256").update(JSON.stringify(canonico(regola))).digest("hex").slice(0, 12);
}

/** I problemi di una strategia settimanale. Lista vuota se è valida. */
export function problemiSettimanale(strategia) {
  const problemi = [];
  if (strategia.tipo !== "settimanale") problemi.push('tipo deve essere "settimanale"');
  if (strategia.variante !== "B") problemi.push('variante deve essere "B": è l\'unica prova in avanti prevista');
  if (strategia.settimaneDentro !== 1) problemi.push("settimaneDentro deve essere 1");
  if (strategia.percentile !== 0.8) problemi.push("percentile deve essere 0,8");
  if (strategia.metodoPercentile !== "R7") problemi.push('metodoPercentile deve essere "R7"');
  if (strategia.lato !== "lungo") problemi.push('lato deve essere "lungo": niente vendite allo scoperto');
  if (!Array.isArray(strategia.coppie) || strategia.coppie.length === 0) problemi.push("coppie: serve un elenco");
  if (!strategia.costi || strategia.costi.commissionePercentoPerLato === undefined || strategia.costi.slippagePercento === undefined) {
    problemi.push("costi: servono commissionePercentoPerLato e slippagePercento");
  }
  if (strategia.rischio === undefined) {
    problemi.push("rischio: serve la quota di capitale (quotaCapitalePercento)");
  }
  return problemi;
}

/**
 * Un passo della prova per una coppia: aggiorna le posizioni e le istantanee con
 * le decisioni note e le candele orarie chiuse. Si può ripetere senza effetti doppi:
 * ogni settimana si esegue una volta sola.
 *
 * @param {object} args
 * @param {object} args.stato        lo stato della coppia; si modifica
 * @param {object} args.strategia    la strategia settimanale validata
 * @param {Array<{data:string, chiusura:number|null}>} args.storia  la storia delle domeniche, aggiornata
 * @param {Array<{momento:number, chiusura:number}>} args.orarie    le candele orarie chiuse
 * @param {string} args.coppia
 * @param {object} args.lab          laboratorio.json (per fuso e capitale)
 * @returns {Array<object>} gli eventi eseguiti in questo passo
 */
export function passoPerCoppia({ stato, strategia, storia, orarie, coppia }) {
  const dec = decisioniSettimanali(storia);
  if (!dec) return [];
  const eseguiti = [];
  const impronta = improntaRegola(strategia);

  if (!stato.prova) {
    stato.prova = { impronta, K0: dec.K, eseguite: [], ultimaK: null, inSospeso: null, lacune: [] };
  }
  const prova = stato.prova;
  if (prova.impronta !== impronta) {
    throw new Error(`la regola di ${coppia} è cambiata rispetto alla prova in corso: registra una nuova strategia`);
  }

  const lunedi = Date.parse(iso(Date.parse(storia[dec.K].data) + GIORNO_MS)) / 1000;
  const candela = orarie.find((c) => c.momento === lunedi);
  const momentoEsecuzione = lunedi + ORA_SEC;

  // il benchmark: buy and hold della coppia dalla prima settimana della prova
  if (!stato.benchmark?.mercato && candela) {
    registraRiferimento(stato, { ruolo: "mercato", coppia, prezzo: candela.chiusura, strategia, momento: momentoEsecuzione });
  }

  // un evento rimasto in sospeso per una settimana precedente, mai eseguito: è una lacuna dichiarata
  if (prova.inSospeso && prova.inSospeso.W < dec.W) {
    prova.lacune.push({ W: prova.inSospeso.W, tipo: prova.inSospeso.tipo, motivo: "candela oraria mancante al momento di eseguire" });
    prova.inSospeso = null;
  }

  // gli ingressi valgono solo per decisioni prese dopo l'attivazione: nessuna posizione ereditata
  const apriAdesso = dec.apre && dec.K > prova.K0 && stato.posizione === null;
  const chiudiAdesso = dec.chiude && stato.posizione !== null;

  if (!prova.eseguite.includes(dec.W) && (apriAdesso || chiudiAdesso)) {
    if (!candela) {
      prova.inSospeso = { W: dec.W, tipo: apriAdesso ? "apertura" : "chiusura" };
    } else {
      const segnale = { id: `${coppia}-${dec.W}`, mercato: coppia, motivo: apriAdesso ? "quinto più alto" : "fine della settimana" };
      try {
        if (apriAdesso) {
          apriPosizione(stato, { prezzoMercato: candela.chiusura, strategia, segnale, momento: momentoEsecuzione, candela: lunedi });
          eseguiti.push({ tipo: "apertura", W: dec.W, prezzo: candela.chiusura });
        } else {
          chiudiPosizione(stato, { prezzoMercato: candela.chiusura, strategia, segnale, momento: momentoEsecuzione });
          eseguiti.push({ tipo: "chiusura", W: dec.W, prezzo: candela.chiusura });
        }
        prova.eseguite.push(dec.W);
        prova.inSospeso = null;
      } catch (errore) {
        if (!(errore instanceof EsecuzioneImpossibile)) throw errore;
        prova.lacune.push({ W: dec.W, tipo: apriAdesso ? "apertura" : "chiusura", motivo: errore.message });
        prova.eseguite.push(dec.W);
      }
    }
  }

  // un'istantanea per ogni domenica nuova: serve alla curva e al drawdown
  if (prova.ultimaK !== dec.K) {
    const riga = storia[dec.K];
    if (riga.chiusura !== null) {
      const momentoDomenica = Date.parse(riga.data) / 1000 + 86400;
      stato.istantanee.push({
        momento: momentoDomenica,
        candela: Date.parse(riga.data) / 1000,
        portafoglio: valorePortafoglio(stato, riga.chiusura),
        mercato: valoreBenchmark(stato, "mercato", riga.chiusura),
        prezzo: riga.chiusura
      });
    }
    prova.ultimaK = dec.K;
  }

  return eseguiti;
}

/** Le righe della sintesi per le strategie settimanali. */
export function righeSintesiSettimanale(elementi) {
  const righe = [];
  for (const { nome, coppia, stato, storia } of elementi) {
    const dec = decisioniSettimanali(storia);
    const prova = stato.prova;
    const ultimo = storia.length ? storia[storia.length - 1].chiusura : null;
    if (!prova || !dec || ultimo === null) {
      righe.push(`| ${nome} | ${coppia} | in attesa di dati | — | — | — | — |`);
      continue;
    }
    const m = calcolaMetriche(stato, { prezzoMercato: ultimo, adessoSecondi: stato.istantanee.at(-1)?.momento ?? null });
    const settimane = dec.dentro.slice(prova.K0 + 1, dec.K + 1);
    const percentualeDentro = settimane.length ? (settimane.filter(Boolean).length / settimane.length) * 100 : 0;
    const drawdown = drawdownMassimo(stato.istantanee.map((i) => i.portafoglio), 0, stato.istantanee.length - 1);
    const campione = m.operazioni.chiuse < 30 ? "campione troppo piccolo per concludere qualcosa" : "—";
    righe.push(
      `| ${nome} | ${coppia} | ${m.operazioni.chiuse} | ${percentualeDentro.toFixed(1).replace(".", ",")}% | ` +
      `${(m.variazionePercento ?? NaN).toFixed(2).replace(".", ",")}% contro ${(m.benchmark.mercato.variazione ?? NaN).toFixed(2).replace(".", ",")}% | ` +
      `${(drawdown * 100).toFixed(2).replace(".", ",")}% | ${campione} |`
    );
  }
  return righe;
}

/** Una stato nuovo per la prova di una coppia, con il capitale del laboratorio. */
export function nuovoStatoProva({ lab, coppia }) {
  return nuovoStato({
    capitaleIniziale: lab.capitaleIniziale,
    mercato: coppia,
    intervalloMinuti: 1440,
    fusoOrario: lab.fusoOrario
  });
}
