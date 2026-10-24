/**
 * scripts/giro.js — un giro del laboratorio, poi esce.
 *
 *     npm run giro
 *
 * Scarica le candele chiuse da Kraken (endpoint pubblico, nessuna chiave), fa
 * avanzare ogni strategia sulle candele che non ha ancora elaborato, salva lo
 * stato, e aggiorna la sintesi. GitHub Actions lo lancia ogni ora.
 *
 * Ogni strategia gira sul suo intervallo e sulle sue coppie. Quelle vecchie
 * (senza `intervallo` né `coppie`) girano sul mercato di laboratorio.json, come
 * sempre, e il loro stato resta in risultati/<nome>/. Le altre hanno uno stato
 * per coppia, in risultati/<nome>/<coppia>/.
 *
 * Si scarica solo quando serve: una candela si può elaborare quando è chiusa da
 * più di un intervallo, quindi un'occhiata a Kraken basta una volta per candela.
 *
 * Due regole di scrittura:
 *   · se un download fallisce, non si scrive niente: meglio un giro saltato che
 *     uno parziale che sembra completo;
 *   · per ogni portafoglio prima lo stato intero, poi il cursore. Se il processo
 *     muore in mezzo, lo stato dice la verità e nessuna candela si conta due volte.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { candeleChiuse } from "../lib/kraken.js";
import { domenicaChiusa, richiesteDaFare } from "../lib/politicaRichieste.js";
import { leggiStrategia, candeleNecessarie } from "../lib/configurazione.js";
import { nuovoStato, avanza, pianoDelGiro, ultimaCandelaElaborata, esecuzioneDi } from "../lib/simulazione.js";
import { calcolaMetriche } from "../lib/metriche.js";
import { formattaMomento } from "../lib/tempo.js";
import { leggiJson, scriviJson, scriviAtomico, leggiStoriaSettimanale, scriviStoriaSettimanale } from "../lib/persistenza.js";
import { aggiornaStoria, passoPerCoppia, nuovoStatoProva, problemiSettimanale, righeSintesiSettimanale } from "../lib/prova.js";

const RADICE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dentro = (...parti) => path.join(RADICE, ...parti);
const PAUSA_TRA_RICHIESTE_MS = 1000; // Kraken è pubblico e gratuito: si chiede con calma

function caricaLaboratorio() {
  const lab = leggiJson(dentro("laboratorio.json"));
  if (!lab) throw new Error("manca laboratorio.json");
  for (const campo of ["mercato", "intervalloMinuti", "capitaleIniziale", "fusoOrario"]) {
    if (lab[campo] === undefined) throw new Error(`laboratorio.json: manca «${campo}»`);
  }
  return lab;
}

function caricaStrategie(lab) {
  const cartella = dentro("strategie");
  const file = fs.readdirSync(cartella).filter((f) => f.endsWith(".json")).sort();
  if (file.length === 0) throw new Error("nessuna strategia in strategie/");
  // una strategia che non passa la validazione ferma il giro: meglio fermo che con valori inventati
  return file.map((f) => {
    const percorso = path.join(cartella, f);
    const nome = path.basename(f, ".json");
    // le strategie settimanali (la prova di Liu e Tsyvinski) hanno una regola diversa: si validano a parte
    const grezza = leggiJson(percorso);
    if (grezza?.tipo === "settimanale") {
      const problemi = problemiSettimanale(grezza);
      if (problemi.length > 0) throw new Error(`strategia settimanale ${nome} non valida: ${problemi.join("; ")}`);
      return { nome, strategia: grezza, settimanale: true, intervallo: 1440, coppie: grezza.coppie, legacy: false };
    }
    const strategia = leggiStrategia(percorso);
    return { nome, strategia, ...esecuzioneDi(strategia, lab) };
  });
}

/** Lo stato delle richieste di una coppia settimanale: l'ultima domenica per cui ciascuna è andata a buon fine. */
function statoRichieste(coppia) {
  const stato = leggiJson(dentro("dati", "settimanali", `${coppia}.richieste.json`)) ?? {};
  return { ultimaGiornaliera: stato.ultimaGiornaliera ?? null, ultimaOraria: stato.ultimaOraria ?? null };
}

/** Le chiavi (coppia, intervallo) che servono davvero adesso: una candela nuova è chiusa da almeno un intervallo. */
function chiaviDaScaricare(strategie, adessoSecondi, adessoMs) {
  const chiavi = new Map();
  for (const { nome, intervallo, coppie, legacy, settimanale } of strategie) {
    const durata = intervallo * 60;
    for (const coppia of coppie) {
      if (settimanale) {
        // al più una richiesta giornaliera e una oraria per coppia a settimana: vedi lib/politicaRichieste.js
        const richieste = richiesteDaFare({ adessoMs, ...statoRichieste(coppia) });
        if (richieste.giornaliera) chiavi.set(`${coppia}|1440`, true);
        if (richieste.oraria) chiavi.set(`${coppia}|60`, true);
        continue;
      }
      const cursore = leggiJson(dentro("risultati", ...(legacy ? [nome] : [nome, coppia]), "cursore.json"));
      // la candela dopo l'ultima elaborata si chiude a ultima + 2 intervalli: prima non c'è niente da fare
      const serve = !cursore || adessoSecondi >= cursore.ultimaCandelaElaborata + 2 * durata;
      const chiave = `${coppia}|${intervallo}`;
      chiavi.set(chiave, chiavi.get(chiave) || serve);
    }
  }
  return [...chiavi].filter(([, serve]) => serve).map(([chiave]) => chiave);
}

const numero = (valore, decimali = 2) =>
  Number.isFinite(valore) ? valore.toFixed(decimali).replace(".", ",") : "—";

/** La sintesi: deterministica, senza orologio di esecuzione, così cambia solo quando cambia lo stato. */
function sintesi(elementi, lab) {
  const fuso = lab.fusoOrario;
  const ultime = elementi.map((e) => ultimaCandelaElaborata(e.stato)).filter((m) => m !== null);
  const ultima = ultime.length > 0 ? Math.max(...ultime) : null;

  const righe = [
    "# Sintesi del laboratorio",
    "",
    `Ogni riga è un portafoglio di carta indipendente, partito con ${numero(lab.capitaleIniziale)} €. ` +
    "Il confronto è con il «comprato e basta» sulla stessa coppia, dallo stesso punto di partenza.",
    ultima === null
      ? "Nessuna candela ancora elaborata."
      : `Ultima candela elaborata: quella che apre alle ${formattaMomento(ultima, fuso, { conAnno: true })} (ora di ${fuso}).`,
    "",
    "| strategia | coppia | candele | capitale | vs comprato e basta | operazioni chiuse | drawdown massimo | posizione aperta |",
    "|---|---|---|---:|---:|---:|---:|---|"
  ];

  const note = [];
  for (const { nome, coppia, intervallo, stato } of elementi.filter((e) => !e.settimanale)) {
    const etichetta = intervallo === 1440 ? "giornaliere" : `${intervallo} min`;
    const ultimo = stato.istantanee.at(-1);
    if (!ultimo) {
      righe.push(`| ${nome} | ${coppia} | ${etichetta} | in attesa di candele | — | — | — | — |`);
      continue;
    }
    const m = calcolaMetriche(stato, {
      prezzoMercato: ultimo.prezzo,
      prezzoBenchmark: null,
      adessoSecondi: ultimo.momento
    });
    const aperta = stato.posizione
      ? `sì, dal ${formattaMomento(stato.posizione.momentoIngresso, fuso, { conAnno: true })}`
      : "no";
    righe.push(
      `| ${nome} | ${coppia} | ${etichetta} | ${numero(m.capitaleAttuale)} € (${numero(m.variazionePercento)}%) | ` +
      `${numero(m.benchmark.differenzaDalMercato)} punti | ` +
      `${m.operazioni.chiuse} | ${m.drawdownMassimo === null ? "—" : numero(m.drawdownMassimo) + "%"} | ${aperta} |`
    );
    if (stato.lacune.length > 0) {
      const candeleMancanti = stato.lacune.reduce((somma, l) => somma + l.candele, 0);
      const buchi = stato.lacune.length === 1 ? "buco" : "buchi";
      note.push(`- ${nome} · ${coppia}: ${candeleMancanti} candele mancanti nei dati (${stato.lacune.length} ${buchi}), dichiarate e non inventate.`);
    }
  }

  const settimanali = elementi.filter((e) => e.settimanale);
  if (settimanali.length > 0) {
    righe.push(
      "",
      "## Strategie settimanali (prova in avanti)",
      "",
      "Esecuzione al prezzo di chiusura della candela oraria del lunedì 00:00–01:00 UTC. Il confronto è con il buy and hold della stessa coppia dalla prima settimana della prova.",
      "",
      "| strategia | coppia | operazioni chiuse | settimane dentro | rendimento contro buy and hold | drawdown massimo | campione |",
      "|---|---|---:|---:|---|---:|---|",
      ...righeSintesiSettimanale(settimanali)
    );
  }

  righe.push("");
  if (note.length > 0) righe.push("## Buchi nei dati", "", ...note, "");
  righe.push(
    "---",
    "",
    "Portafoglio di carta: nessun ordine è inviato a nessun exchange, nessun soldo vero è in gioco. " +
    "Non è consulenza finanziaria."
  );
  return righe.join("\n") + "\n";
}

async function main() {
  const lab = caricaLaboratorio();
  const strategie = caricaStrategie(lab);

  // l'orologio si legge qui, nella parte che parla con il mondo: il resto riceve i numeri
  const adessoMs = Date.now();
  const daScaricare = chiaviDaScaricare(strategie, Math.floor(adessoMs / 1000), adessoMs);

  /* tutti i download prima di scrivere: se uno fallisce, non si scrive niente */
  const candele = new Map();
  const errori = [];
  for (const [i, chiave] of daScaricare.entries()) {
    const [coppia, intervallo] = chiave.split("|");
    if (i > 0) await new Promise((risolvi) => setTimeout(risolvi, PAUSA_TRA_RICHIESTE_MS));
    const risposta = await candeleChiuse({ coppia, intervalloMinuti: Number(intervallo), adessoMs });
    if (risposta.errore) errori.push(`${coppia} (${intervallo} min): ${risposta.errore}`);
    else if (risposta.candele.length === 0) errori.push(`${coppia} (${intervallo} min): nessuna candela chiusa`);
    else candele.set(chiave, risposta.candele);
  }
  if (errori.length > 0) {
    console.error(`mercato non raggiungibile: ${errori.join("; ")}. Riprovo al prossimo giro.`);
    process.exitCode = 1;
    return;
  }

  const elementi = [];
  for (const { nome, strategia, intervallo, coppie, legacy, settimanale } of strategie) {
    for (const coppia of coppie) {
      if (settimanale) {
        // prima lo storico delle domeniche, poi lo stato: un'interruzione tra i due non conta due volte
        const storiaPath = dentro("dati", "settimanali", `${coppia}.csv`);
        const precedente = leggiStoriaSettimanale(storiaPath);
        const storia = aggiornaStoria(precedente, candele.get(`${coppia}|1440`) ?? []);
        if (storia.length !== precedente.length) scriviStoriaSettimanale(storiaPath, storia);
        // una richiesta conta come fatta solo se ha portato la candela che serve: altrimenti si ripete al giro successivo
        const domenica = domenicaChiusa(adessoMs);
        const lunedi = Date.parse(domenica) / 1000 + 86400;
        const fatte = statoRichieste(coppia);
        const ultimaRiga = storia.at(-1);
        if (ultimaRiga?.data === domenica && ultimaRiga.chiusura !== null) fatte.ultimaGiornaliera = domenica;
        if ((candele.get(`${coppia}|60`) ?? []).some((c) => c.momento === lunedi)) fatte.ultimaOraria = domenica;
        scriviJson(dentro("dati", "settimanali", `${coppia}.richieste.json`), fatte);

        const statoPath = dentro("risultati", nome, coppia, "stato.json");
        const stato = leggiJson(statoPath) ?? nuovoStatoProva({ lab, coppia });
        const eseguiti = passoPerCoppia({ stato, strategia, storia, orarie: candele.get(`${coppia}|60`) ?? [], coppia, lab });
        scriviJson(statoPath, stato);
        console.log(`${nome} · ${coppia}: ${eseguiti.length} eventi eseguiti`);
        elementi.push({ nome, coppia, stato, storia, settimanale: true });
        continue;
      }

      const cartella = dentro("risultati", ...(legacy ? [nome] : [nome, coppia]));
      const statoPath = path.join(cartella, "stato.json");
      const cursorePath = path.join(cartella, "cursore.json");
      const etichetta = legacy ? nome : `${nome} · ${coppia}`;

      const stato = leggiJson(statoPath) ?? nuovoStato({
        capitaleIniziale: lab.capitaleIniziale,
        mercato: coppia,
        intervalloMinuti: intervallo,
        fusoOrario: lab.fusoOrario
      });

      const serie = candele.get(`${coppia}|${intervallo}`);
      if (!serie) {
        console.log(`${etichetta}: niente di nuovo`);
      } else {
        const primaValutabile = candeleNecessarie(strategia) - 1;
        const { da, a, lacuna } = pianoDelGiro(stato, serie, primaValutabile, intervallo);

        if (da < a) {
          if (lacuna) stato.lacune.push(lacuna);
          avanza(stato, serie, da, a, strategia);

          // prima lo stato intero, poi il cursore: vedi il commento in testa
          scriviJson(statoPath, stato);
          scriviJson(cursorePath, { ultimaCandelaElaborata: ultimaCandelaElaborata(stato) });
          console.log(`${etichetta}: ${a - da} candele elaborate`);
        } else {
          console.log(`${etichetta}: niente di nuovo`);
        }
      }

      elementi.push({ nome, coppia, intervallo, stato });
    }
  }

  scriviAtomico(dentro("risultati", "SINTESI.md"), sintesi(elementi, lab));
}

main().catch((errore) => {
  console.error(`giro interrotto: ${errore.message}`);
  process.exitCode = 1;
});
