import { test } from "node:test";
import assert from "node:assert/strict";

import { valuta, condizioniIngresso, prezzoDiPareggio } from "../lib/strategia.js";

/* Configurazione di prova: medie corte, così bastano poche candele costruite a
   mano perché le condizioni si accendano davvero. L'RSI resta a 14 periodi,
   che è il caso vero. */
const CONFIGURAZIONE = {
  mercato: "PROVA/EUR",
  ingresso: {
    rsi: { periodi: 14, sotto: 32 },
    incrocioMedie: { veloce: 2, lenta: 4, direzione: "alto" },
    volume: { periodi: 2, almeno: 1.25 }
  },
  uscita: {
    presaDiProfittoPercento: 8,
    stopDiPerditaPercento: 4,
    tempoMassimoCandele: 5
  },
  rischio: { quotaCapitalePercento: 100, posizioniMassime: 1, perditaMassimaGiornalieraPercento: 6 },
  costi: { commissionePercentoPerLato: 0.26, slippagePercento: 0.05 }
};

const PRIMO_MOMENTO = Math.floor(Date.UTC(2026, 7, 20, 0, 0, 0) / 1000);
const DURATA = 15 * 60;

/** Una candela «piatta»: apertura e chiusura uguali, senza ombre. */
function candela(indice, prezzo, volume = 100, { massimo, minimo } = {}) {
  return {
    momento: PRIMO_MOMENTO + indice * DURATA,
    apertura: prezzo,
    massimo: massimo ?? prezzo,
    minimo: minimo ?? prezzo,
    chiusura: prezzo,
    volume
  };
}

/**
 * Discesa lunga e costante (che tiene l'RSI in basso) seguita da un rimbalzo
 * secco sull'ultima candela (che fa incrociare le medie corte verso l'alto).
 */
function discesaPoiRimbalzo({ rimbalzo = 6, volumeUltima = 200 } = {}) {
  const candele = [];
  let prezzo = 100;
  for (let i = 0; i < 23; i++) {
    candele.push(candela(i, prezzo, 100));
    prezzo -= 2;
  }
  const ultimoPrezzo = candele[candele.length - 1].chiusura + rimbalzo;
  candele.push(candela(23, ultimoPrezzo, volumeUltima));
  return candele;
}

/* --------------------------- ingresso ------------------------------ */

test("valuta: quando valgono tutte e tre le condizioni nasce un segnale di acquisto", () => {
  const segnale = valuta(discesaPoiRimbalzo(), null, CONFIGURAZIONE);

  assert.ok(segnale, "mi aspettavo un segnale");
  assert.equal(segnale.azione, "compra");
  assert.equal(segnale.mercato, "PROVA/EUR");
  assert.equal(segnale.prezzo, 62);

  // le tre condizioni sono davvero tutte accese
  assert.deepEqual(segnale.condizioni.soddisfatte, { rsi: true, incrocio: true, volume: true });
  assert.ok(segnale.condizioni.rsi < 32);
  assert.equal(segnale.condizioni.incrocio, "alto");
  assert.ok(segnale.condizioni.rapportoVolume >= 1.25);

  // il motivo si legge, e contiene i numeri che servono a capire
  assert.match(segnale.motivo, /RSI a/);
  assert.match(segnale.motivo, /sotto la soglia di 32/);
  assert.match(segnale.motivo, /volume/);
});

test("valuta: se ne vale una sola, non si compra", () => {
  // prezzi fermi: nessuna discesa, nessun incrocio. Solo il volume è alto.
  const candele = Array.from({ length: 24 }, (_, i) => candela(i, 100, i === 23 ? 300 : 100));
  const segnale = valuta(candele, null, CONFIGURAZIONE);
  assert.equal(segnale, null);
});

test("valuta: condizioni che valgono ma su candele diverse non fanno un segnale", () => {
  // il volume esplode sulla PENULTIMA candela, non su quella dell'incrocio
  const candele = discesaPoiRimbalzo({ volumeUltima: 100 });
  candele[candele.length - 2] = { ...candele[candele.length - 2], volume: 400 };

  const segnale = valuta(candele, null, CONFIGURAZIONE);
  assert.equal(segnale, null, "le condizioni devono valere sulla STESSA candela chiusa");
});

test("valuta: con dati insufficienti restituisce null, non un mezzo segnale", () => {
  const poche = Array.from({ length: 5 }, (_, i) => candela(i, 100 - i * 2, 100));
  assert.equal(valuta(poche, null, CONFIGURAZIONE), null);
  assert.equal(valuta([], null, CONFIGURAZIONE), null);
  assert.equal(valuta(undefined, null, CONFIGURAZIONE), null);
});

/* ---------------------------- uscite -------------------------------- */

const POSIZIONE = {
  prezzoIngresso: 100,
  quantita: 1,
  candelaIngresso: PRIMO_MOMENTO
};

/** Candele dopo l'ingresso, con l'ultima costruita su misura. */
function dopoIngresso(ultima, quante = 2) {
  const candele = [];
  for (let i = 1; i <= quante; i++) candele.push(candela(i, 100, 100));
  candele.push({ ...ultima, momento: PRIMO_MOMENTO + (quante + 1) * DURATA });
  return candele;
}

test("valuta: lo stop scatta se il MINIMO della candela lo ha toccato, anche se la chiusura è risalita", () => {
  // stop a 96. Il minimo tocca 95,5 ma la candela chiude a 99: il simulato
  // ingenuo non se ne accorgerebbe.
  const segnale = valuta(
    dopoIngresso({ apertura: 99, massimo: 99.5, minimo: 95.5, chiusura: 99, volume: 100 }),
    POSIZIONE,
    CONFIGURAZIONE
  );

  assert.ok(segnale);
  assert.equal(segnale.azione, "vendi");
  assert.equal(segnale.condizioni.scattata, "stop");
  assert.equal(segnale.prezzo, 96); // il LIVELLO, non la chiusura
  assert.match(segnale.motivo, /minimo della candela/);
});

test("valuta: la presa di profitto scatta sul MASSIMO della candela", () => {
  const segnale = valuta(
    dopoIngresso({ apertura: 105, massimo: 108.4, minimo: 104, chiusura: 106, volume: 100 }),
    POSIZIONE,
    CONFIGURAZIONE
  );

  assert.ok(segnale);
  assert.equal(segnale.condizioni.scattata, "presaDiProfitto");
  assert.equal(segnale.prezzo, 108);
  assert.match(segnale.motivo, /massimo della candela/);
});

test("valuta: se nella stessa candela sono stati toccati entrambi i livelli, vince lo stop", () => {
  // dentro la candela non sai in che ordine è successo: nel dubbio, l'ipotesi
  // peggiore per noi
  const segnale = valuta(
    dopoIngresso({ apertura: 100, massimo: 109, minimo: 95, chiusura: 101, volume: 100 }),
    POSIZIONE,
    CONFIGURAZIONE
  );

  assert.ok(segnale);
  assert.equal(segnale.condizioni.scattata, "stop");
  assert.match(segnale.motivo, /non sappiamo in che ordine/);
});

test("valuta: l'uscita per tempo scatta dopo il numero di candele configurato", () => {
  // 5 candele dall'ingresso, nessun livello toccato
  const candele = [];
  for (let i = 1; i <= 5; i++) candele.push(candela(i, 100.5, 100));
  const segnale = valuta(candele, POSIZIONE, CONFIGURAZIONE);

  assert.ok(segnale);
  assert.equal(segnale.condizioni.scattata, "tempo");
  assert.equal(segnale.condizioni.candeleTrascorse, 5);
  assert.match(segnale.motivo, /Uscita per tempo/);
});

test("valuta: senza sapere su quale candela siamo entrati, l'uscita per tempo NON scatta", () => {
  // in JavaScript `900 > null` è vero: senza guardia, ogni candela conterebbe
  // come «passata» e la posizione si chiuderebbe alla prima valutazione
  const candele = [];
  for (let i = 1; i <= 10; i++) candele.push(candela(i, 100.5, 100));

  const posizioneSenzaCandela = { prezzoIngresso: 100, quantita: 1, candelaIngresso: null };
  assert.equal(valuta(candele, posizioneSenzaCandela, CONFIGURAZIONE), null);

  const posizioneIndefinita = { prezzoIngresso: 100, quantita: 1 };
  assert.equal(valuta(candele, posizioneIndefinita, CONFIGURAZIONE), null);
});

test("valuta: senza candela d'ingresso, stop e presa di profitto funzionano lo stesso", () => {
  // il tempo non si sa, ma i livelli di prezzo sì: quelli devono ancora valere
  const segnale = valuta(
    [{ ...candela(1, 95, 100), massimo: 95, minimo: 95 }],
    { prezzoIngresso: 100, quantita: 1, candelaIngresso: null },
    CONFIGURAZIONE
  );
  assert.ok(segnale);
  assert.equal(segnale.condizioni.scattata, "stop");
});

test("valuta: con una posizione aperta e niente che scatta, non fa niente", () => {
  const candele = [];
  for (let i = 1; i <= 3; i++) candele.push(candela(i, 101, 100));
  assert.equal(valuta(candele, POSIZIONE, CONFIGURAZIONE), null);
});

test("valuta: con una posizione aperta non valuta MAI un ingresso", () => {
  // queste candele, senza posizione, produrrebbero un acquisto
  const candele = discesaPoiRimbalzo();
  const posizioneTranquilla = { prezzoIngresso: 61, quantita: 1, candelaIngresso: candele[candele.length - 1].momento };
  const segnale = valuta(candele, posizioneTranquilla, CONFIGURAZIONE);
  assert.equal(segnale, null);
});

/* -------------------------- la prova che conta ---------------------- */

test("valuta: due chiamate identiche danno risultati identici. Sempre.", () => {
  const candele = discesaPoiRimbalzo();
  const primo = valuta(candele, null, CONFIGURAZIONE);
  const secondo = valuta(candele, null, CONFIGURAZIONE);
  assert.deepEqual(primo, secondo);

  // e anche a distanza di tempo: se dentro ci fosse un orologio, si vedrebbe
  const terzo = valuta(candele, null, CONFIGURAZIONE);
  assert.deepEqual(primo, terzo);
});

test("valuta: non modifica le candele che riceve", () => {
  const candele = discesaPoiRimbalzo();
  const copia = JSON.parse(JSON.stringify(candele));
  valuta(candele, null, CONFIGURAZIONE);
  assert.deepEqual(candele, copia);
});

/* ------------- la finestra dell'incrocio (entroCandele) ------------- */

/** La stessa configurazione, con una finestra diversa per l'incrocio. */
const conFinestra = (entroCandele) => ({
  ...CONFIGURAZIONE,
  ingresso: {
    ...CONFIGURAZIONE.ingresso,
    incrocioMedie: { ...CONFIGURAZIONE.ingresso.incrocioMedie, entroCandele }
  }
});

/**
 * Discesa lunga, rimbalzo secco (che fa incrociare le medie verso l'alto), e
 * poi di nuovo giù per tre candele con un picco di volume sull'ultima.
 *
 * È il caso che tutta la finestra esiste per catturare: RSI basso e volume alto
 * ADESSO, incrocio al rialzo tre candele fa. Sulla stessa candela non capitano
 * mai insieme, ed è il motivo per cui la strategia di partenza non scattava.
 */
function rimbalzoPoiAncoraGiu() {
  const candele = [];
  let prezzo = 100;
  for (let i = 0; i < 23; i++) {
    candele.push(candela(i, prezzo, 100));
    prezzo -= 2;
  }
  candele.push(candela(23, candele[22].chiusura + 6, 100)); // il rimbalzo: incrocio qui
  candele.push(candela(24, candele[23].chiusura - 3, 100));
  candele.push(candela(25, candele[24].chiusura - 3, 100));
  candele.push(candela(26, candele[25].chiusura - 3, 250)); // e il volume esplode qui
  return candele;
}

test("entroCandele: senza finestra un incrocio di tre candele fa non conta", () => {
  const candele = rimbalzoPoiAncoraGiu();
  const condizioni = condizioniIngresso(candele, conFinestra(1));

  // RSI e volume ci sono entrambi: manca solo l'incrocio, e basta a fermare tutto
  assert.equal(condizioni.rsi.soddisfatta, true);
  assert.equal(condizioni.volume.soddisfatta, true);
  assert.equal(condizioni.incrocio.soddisfatta, false);
  assert.equal(valuta(candele, null, conFinestra(1)), null);
});

test("entroCandele: con la finestra abbastanza larga lo stesso caso produce un segnale", () => {
  const candele = rimbalzoPoiAncoraGiu();

  assert.equal(valuta(candele, null, conFinestra(3)), null, "tre candele non bastano: l'incrocio è a distanza 3");

  const segnale = valuta(candele, null, conFinestra(4));
  assert.ok(segnale, "con finestra 4 il segnale deve nascere");
  assert.equal(segnale.azione, "compra");
  assert.deepEqual(segnale.condizioni.soddisfatte, { rsi: true, incrocio: true, volume: true });
});

test("entroCandele: il motivo dice quanto è vecchia la rottura", () => {
  const segnale = valuta(rimbalzoPoiAncoraGiu(), null, conFinestra(10));
  assert.match(segnale.motivo, /da 3 candele/);
  assert.doesNotMatch(segnale.motivo, /da questa candela/);
});

test("entroCandele: con finestra 1 il motivo torna a dire «da questa candela»", () => {
  const segnale = valuta(discesaPoiRimbalzo(), null, conFinestra(1));
  assert.ok(segnale);
  assert.match(segnale.motivo, /da questa candela/);
});

test("entroCandele: un incrocio al ribasso più recente non annulla quello al rialzo", () => {
  // Nella serie le medie si sono reincrociate al RIBASSO due candele fa: la
  // scheda deve mostrare quello (è l'ultima cosa successa), ma la regola cerca
  // l'incrocio al rialzo e lo trova comunque. Senza questa scelta la regola non
  // scatterebbe mai, perché con un RSI a 14 le medie sono sempre già ridiscese.
  const condizioni = condizioniIngresso(rimbalzoPoiAncoraGiu(), conFinestra(10));

  assert.equal(condizioni.incrocio.direzione, "basso", "l'ultimo incrocio avvenuto è verso il basso");
  assert.equal(condizioni.incrocio.candeleFa, 2);
  assert.equal(condizioni.incrocio.veloceSopraLenta, false, "la veloce è tornata sotto");
  assert.equal(condizioni.incrocio.soddisfatta, true, "ma l'incrocio al rialzo nella finestra c'è stato");
});

test("entroCandele: se manca vale 1, e una configurazione vecchia non cambia significato", () => {
  const senzaParametro = {
    ...CONFIGURAZIONE,
    ingresso: {
      ...CONFIGURAZIONE.ingresso,
      incrocioMedie: { veloce: 2, lenta: 4, direzione: "alto" } // niente entroCandele
    }
  };
  const candele = rimbalzoPoiAncoraGiu();

  assert.equal(valuta(candele, null, senzaParametro), null);
  assert.deepEqual(
    condizioniIngresso(candele, senzaParametro),
    condizioniIngresso(candele, conFinestra(1))
  );
});

/* ---------------- i blocchi nuovi: tendenza e rottura ---------------- */

/**
 * Salita costante con volumi piatti: la veloce sta stabilmente sopra la
 * lenta (tendenza vera) ma non c'è nessun incrocio recente, e l'RSI è alto.
 */
function salitaCostante() {
  const candele = [];
  let prezzo = 100;
  for (let i = 0; i < 30; i++) {
    candele.push(candela(i, prezzo, 100));
    prezzo += 1;
  }
  return candele;
}

test("tendenza: è lo stato delle medie, non l'evento dell'incrocio", () => {
  const configurazione = {
    ...CONFIGURAZIONE,
    ingresso: {
      rsi: null,
      incrocioMedie: null,
      volume: null,
      tendenza: { veloce: 2, lenta: 4 }
    }
  };

  const co = condizioniIngresso(salitaCostante(), configurazione);
  assert.deepEqual(Object.keys(co), ["tendenza"], "risponde solo il blocco acceso");
  assert.equal(co.tendenza.soddisfatta, true, "in salita costante la veloce sta sopra");

  const segnale = valuta(salitaCostante(), null, configurazione);
  assert.ok(segnale, "con la sola tendenza accesa il segnale nasce");
  assert.match(segnale.motivo, /sopra la 4/);
});

test("rottura: la chiusura deve superare il massimo delle precedenti", () => {
  const configurazione = {
    ...CONFIGURAZIONE,
    ingresso: { rsi: null, incrocioMedie: null, volume: null, rottura: { periodi: 5 } }
  };

  // prezzi fermi a 100, poi una chiusura a 106: rompe il massimo delle 5 precedenti
  const piatte = [100, 100, 100, 100, 100, 100, 106];
  const candele = piatte.map((p, i) => candela(i, p));

  const segnale = valuta(candele, null, configurazione);
  assert.ok(segnale, "la rottura deve produrre il segnale");
  assert.match(segnale.motivo, /sopra il massimo delle 5 candele precedenti/);
  assert.equal(segnale.condizioni.massimoPrecedente, 100);

  // senza rottura (chiusura uguale al massimo) niente segnale
  const ferme = [100, 100, 100, 100, 100, 100, 100].map((p, i) => candela(i, p));
  assert.equal(valuta(ferme, null, configurazione), null);
});

test("un blocco spento non compare né nelle condizioni né nel motivo", () => {
  const configurazione = {
    ...CONFIGURAZIONE,
    ingresso: {
      rsi: { periodi: 14, sotto: 32 },
      incrocioMedie: null,
      volume: { periodi: 2, almeno: 1.25 }
    }
  };

  const co = condizioniIngresso(discesaPoiRimbalzo(), configurazione);
  assert.deepEqual(Object.keys(co), ["rsi", "volume"]);
  assert.equal(co.incrocio, undefined);

  const segnale = valuta(discesaPoiRimbalzo({ volumeUltima: 200 }), null, configurazione);
  assert.ok(segnale, "senza l'incrocio richiesto, RSI e volume bastano");
  assert.doesNotMatch(segnale.motivo, /incrociato/);
  assert.deepEqual(Object.keys(segnale.condizioni.soddisfatte), ["rsi", "volume"]);
});

test("la configurazione classica produce lo stesso identico segnale di prima", () => {
  // la garanzia di non aver cambiato il vivo: il motivo, i campi delle
  // condizioni e i valori devono essere quelli storici
  const segnale = valuta(discesaPoiRimbalzo(), null, CONFIGURAZIONE);
  assert.ok(segnale);
  assert.match(segnale.motivo, /^RSI a .* sotto la soglia di 32, media 2 ha incrociato la 4 verso l'alto da questa candela .*, volume .* volte la media delle 2 candele precedenti\.$/);
  assert.deepEqual(Object.keys(segnale.condizioni.soddisfatte), ["rsi", "incrocio", "volume"]);
  assert.ok("mediaVeloce" in segnale.condizioni);
  assert.ok("rapportoVolume" in segnale.condizioni);
});

/* ------------------------- il trailing stop ------------------------- */

const conTrailing = (trailing, resto = {}) => ({
  ...CONFIGURAZIONE,
  uscita: { ...CONFIGURAZIONE.uscita, ...resto, trailing }
});

/** Una posizione aperta a 100 sulla candela indicata. */
const posizioneA100 = (candelaIngresso) => ({
  prezzoIngresso: 100,
  quantita: 1,
  controvaloreIngresso: 100,
  commissioneIngresso: 0.26,
  momentoIngresso: candelaIngresso,
  candelaIngresso
});

test("trailing: sotto la soglia di attivazione non fa niente", () => {
  // sale a +0,5%, sotto la soglia dell'1%: il trailing non esiste ancora
  const candele = [candela(0, 100), candela(1, 100.5), candela(2, 100.1)];
  const configurazione = conTrailing({ attivaSopraPercento: 1, scendeDiPercento: 0.5 });

  const segnale = valuta(candele, posizioneA100(candele[0].momento), configurazione);
  assert.equal(segnale, null, "senza aver superato la soglia non si esce");
});

test("trailing: superata la soglia, insegue il massimo e chiude sul ripiegamento", () => {
  // sale a +3% (massimo 103), poi ripiega: con scendeDi 1% il livello è 101,97
  const candele = [
    candela(0, 100),
    candela(1, 103, 103, 102),
    candela(2, 101.5, 102, 101.5)   // il minimo 101,5 sfonda 101,97
  ];
  const configurazione = conTrailing({ attivaSopraPercento: 1, scendeDiPercento: 1 });

  const segnale = valuta(candele, posizioneA100(candele[0].momento), configurazione);
  assert.ok(segnale, "il trailing deve chiudere");
  assert.equal(segnale.condizioni.scattata, "trailing");
  assert.ok(segnale.prezzo > 100, "esce in guadagno, non in perdita");
  assert.match(segnale.motivo, /ripiegato/);
});

test("trailing: il livello segue il massimo, non l'ultimo prezzo", () => {
  const candele = [
    candela(0, 100),
    candela(1, 105, 105, 104),   // massimo 105
    candela(2, 102, 102.5, 102)  // sceso, ma il livello resta agganciato a 105
  ];
  const configurazione = conTrailing({ attivaSopraPercento: 1, scendeDiPercento: 2 });

  const segnale = valuta(candele, posizioneA100(candele[0].momento), configurazione);
  assert.ok(segnale);
  // 105 × 0,98 = 102,9: il minimo di 102 lo sfonda
  assert.ok(Math.abs(segnale.prezzo - 102.9) < 0.001, `atteso 102,9 ottenuto ${segnale.prezzo}`);
  assert.equal(segnale.condizioni.massimoDaIngresso, 105);
});

test("trailing: lo stop di perdita viene comunque prima", () => {
  // stessa candela: sfonda sia il trailing sia lo stop. Nel dubbio, lo stop.
  const candele = [
    candela(0, 100),
    candela(1, 103, 103, 102),
    candela(2, 95, 103, 95)
  ];
  const configurazione = conTrailing({ attivaSopraPercento: 1, scendeDiPercento: 1 });

  const segnale = valuta(candele, posizioneA100(candele[0].momento), configurazione);
  assert.equal(segnale.condizioni.scattata, "stop", "l'ipotesi peggiore vince, come per la presa di profitto");
});

test("trailing: spento o assente, l'uscita è quella di sempre", () => {
  const candele = [
    candela(0, 100),
    candela(1, 103, 103, 102),
    candela(2, 101.5, 102, 101.5)
  ];
  const posizione = posizioneA100(candele[0].momento);

  assert.equal(valuta(candele, posizione, conTrailing(null)), null, "null = spento");
  assert.equal(valuta(candele, posizione, CONFIGURAZIONE), null, "assente = spento, come nelle configurazioni vecchie");
});

test("trailing: le condizioni dicono sempre a che livello sta, o che non è attivo", () => {
  const candele = [candela(0, 100), candela(1, 100.2)];
  const configurazione = conTrailing({ attivaSopraPercento: 1, scendeDiPercento: 0.5 });
  const posizione = posizioneA100(candele[0].momento);

  // non scatta, ma la scheda deve poter dire perché: massimo raggiunto, trailing non attivo
  const strategiaConUscitaLontana = { ...configurazione, uscita: { ...configurazione.uscita, tempoMassimoCandele: 1 } };
  const segnale = valuta(candele, posizione, strategiaConUscitaLontana);
  assert.equal(segnale.condizioni.trailingAttivo, false);
  assert.equal(segnale.condizioni.livelloTrailing, null);
  assert.equal(segnale.condizioni.massimoDaIngresso, 100.2);
});

/* ---------------- lo stop che si sposta al pareggio ---------------- */

const conPareggio = (pareggio, resto = {}) => ({
  ...CONFIGURAZIONE,
  uscita: { ...CONFIGURAZIONE.uscita, ...resto, pareggio },
  costi: { commissionePercentoPerLato: 0.4, slippagePercento: 0.05 }
});

test("prezzoDiPareggio: è il prezzo a cui si esce esattamente in pari", () => {
  const costi = { commissionePercentoPerLato: 0.4, slippagePercento: 0.05 };
  const p = prezzoDiPareggio(costi, 100);

  // +0,854% sopra l'ingresso, con questi costi
  assert.ok(Math.abs(p - 100.8536) < 0.001, `atteso ~100,854 ottenuto ${p}`);

  // la verifica vera: rifacendo i conti del portafoglio si torna a zero
  const c = 0.004, s = 0.0005;
  const costoPerUnita = 100 * (1 + c);
  const incassoPerUnita = p * (1 - s) * (1 - c);
  assert.ok(Math.abs(incassoPerUnita - costoPerUnita) < 1e-9, "deve chiudere esattamente in pari");
});

test("pareggio: prima di raggiungerlo vale lo stop iniziale", () => {
  // sale solo a +0,3%, sotto il pareggio di +0,854%: la protezione non si attiva
  const candele = [candela(0, 100), candela(1, 100.3, 100.3, 100.2), candela(2, 96, 100.3, 96)];
  const configurazione = conPareggio({ marginePercento: 0 }, { stopDiPerditaPercento: 1 });

  const segnale = valuta(candele, posizioneA100(candele[0].momento), configurazione);
  assert.equal(segnale.condizioni.scattata, "stop", "è lo stop iniziale, non il pareggio");
  assert.equal(segnale.condizioni.pareggioRaggiunto, false);
  assert.match(segnale.motivo, /non era mai stato raggiunto/);
});

test("pareggio: raggiunto il livello, lo stop ci si sposta e non si perde più", () => {
  // tocca 101,5 (sopra il pareggio di 100,854), poi torna a 100,2
  const candele = [
    candela(0, 100),
    candela(1, 101.5, 101.5, 101),
    candela(2, 100.2, 101, 100.2)
  ];
  const configurazione = conPareggio({ marginePercento: 0 }, { stopDiPerditaPercento: 1 });

  const segnale = valuta(candele, posizioneA100(candele[0].momento), configurazione);
  assert.ok(segnale, "deve chiudere: il minimo 100,2 sfonda il pareggio a 100,854");
  assert.equal(segnale.condizioni.scattata, "pareggio");
  assert.equal(segnale.condizioni.pareggioRaggiunto, true);
  assert.ok(Math.abs(segnale.prezzo - 100.8536) < 0.001, "esce al livello di pareggio");
  assert.match(segnale.motivo, /senza perdere/);
});

test("pareggio: lo stop si sposta solo verso l'alto, mai verso il basso", () => {
  // stop iniziale a -1% = 99; il pareggio è 100,854, quindi più alto: vince lui
  const candele = [candela(0, 100), candela(1, 102, 102, 101)];
  const configurazione = conPareggio({ marginePercento: 0 }, { stopDiPerditaPercento: 1 });
  const condizioni = valuta(
    [...candele, candela(2, 101, 101.5, 101)],
    posizioneA100(candele[0].momento),
    { ...configurazione, uscita: { ...configurazione.uscita, tempoMassimoCandele: 1 } }
  ).condizioni;

  assert.ok(condizioni.livelloStopEffettivo > condizioni.livelloStop,
    "con il pareggio raggiunto la protezione sale sopra lo stop iniziale");
});

test("pareggio: il margine alza il livello sopra lo zero esatto", () => {
  const senza = conPareggio({ marginePercento: 0 });
  const con = conPareggio({ marginePercento: 0.2 });
  const candele = [candela(0, 100), candela(1, 103, 103, 102), candela(2, 100.5, 102, 100.5)];
  const posizione = posizioneA100(candele[0].momento);

  const a = valuta(candele, posizione, senza);
  const b = valuta(candele, posizione, con);
  assert.ok(b.prezzo > a.prezzo, "col margine si esce un po' più in alto, quindi in guadagno");
});

test("pareggio: spento o assente, lo stop resta quello di sempre", () => {
  const candele = [candela(0, 100), candela(1, 103, 103, 102), candela(2, 100.2, 102, 100.2)];
  const posizione = posizioneA100(candele[0].momento);

  assert.equal(valuta(candele, posizione, conPareggio(null)), null, "null = spento");
  assert.equal(valuta(candele, posizione, CONFIGURAZIONE), null, "assente = spento");
});

/* ------------------------- il blocco crollo ------------------------- */

test("crollo: scatta solo se il calo raggiunge la soglia", () => {
  const configurazione = {
    ...CONFIGURAZIONE,
    ingresso: { rsi: null, incrocioMedie: null, volume: null, crollo: { periodi: 4, almenoPercento: 3 } }
  };

  // da 100 a 96,5 in quattro candele = −3,5%: basta
  const crolla = [100, 99, 98, 97, 96.5].map((p, i) => candela(i, p));
  const segnale = valuta(crolla, null, configurazione);
  assert.ok(segnale, "un calo del 3,5% supera la soglia del 3%");
  assert.match(segnale.motivo, /giù del/);
  assert.ok(segnale.condizioni.crollo < -3);

  // da 100 a 98 = −2%: non basta
  const scende = [100, 99.5, 99, 98.5, 98].map((p, i) => candela(i, p));
  assert.equal(valuta(scende, null, configurazione), null);
});

test("crollo: una salita non è un crollo, per quanto grande", () => {
  const configurazione = {
    ...CONFIGURAZIONE,
    ingresso: { rsi: null, incrocioMedie: null, volume: null, crollo: { periodi: 4, almenoPercento: 3 } }
  };
  const sale = [100, 105, 110, 115, 120].map((p, i) => candela(i, p));
  assert.equal(valuta(sale, null, configurazione), null);
});

test("crollo: dentro una tendenza viva servono tutti e due", () => {
  const configurazione = {
    ...CONFIGURAZIONE,
    ingresso: {
      rsi: null, incrocioMedie: null, volume: null,
      tendenza: { veloce: 2, lenta: 4 },
      crollo: { periodi: 4, almenoPercento: 3 }
    }
  };
  // scende soltanto: il crollo c'è, la tendenza no
  const soloCrollo = [100, 99, 98, 97, 96].map((p, i) => candela(i, p));
  const co = condizioniIngresso(soloCrollo, configurazione);
  assert.equal(co.crollo.soddisfatta, true);
  assert.equal(co.tendenza.soddisfatta, false);
  assert.equal(valuta(soloCrollo, null, configurazione), null, "senza tendenza non si entra");
});

/* ------------- l'uscita che segue la tendenza (sottoMedia) ------------- */

test("sottoMedia: si resta dentro finché la chiusura sta sopra la media", () => {
  const configurazione = {
    ...CONFIGURAZIONE,
    uscita: { ...CONFIGURAZIONE.uscita, presaDiProfittoPercento: 1000, tempoMassimoCandele: null, sottoMedia: { periodi: 3 } }
  };
  // salita costante: la chiusura sta sempre sopra la media, non si esce
  const sale = [100, 102, 104, 106, 108, 110].map((p, i) => candela(i, p));
  assert.equal(valuta(sale, posizioneA100(sale[0].momento), configurazione), null);
});

test("sottoMedia: si esce quando la chiusura perde la media", () => {
  const configurazione = {
    ...CONFIGURAZIONE,
    uscita: { ...CONFIGURAZIONE.uscita, presaDiProfittoPercento: 1000, tempoMassimoCandele: null, sottoMedia: { periodi: 3 } }
  };
  // sale e poi crolla sotto la media a 3 periodi
  // 100 sta sotto la media a 3 periodi (~103,5) ma sopra lo stop a -4% (96):
  // così si misura l'uscita sulla tendenza e non quella sullo stop
  const gira = [100, 104, 108, 112, 116, 100].map((p, i) => candela(i, p));
  const segnale = valuta(gira, posizioneA100(gira[0].momento), configurazione);

  assert.ok(segnale, "persa la media si esce");
  assert.equal(segnale.condizioni.scattata, "tendenzaFinita");
  assert.match(segnale.motivo, /tendenza che aveva motivato l'ingresso è finita/);
  assert.ok(Number.isFinite(segnale.condizioni.mediaUscita));
});

test("sottoMedia: lo stop di perdita viene comunque prima", () => {
  const configurazione = {
    ...CONFIGURAZIONE,
    uscita: { ...CONFIGURAZIONE.uscita, presaDiProfittoPercento: 1000, stopDiPerditaPercento: 4, tempoMassimoCandele: null, sottoMedia: { periodi: 3 } }
  };
  // crolla sotto la media E sotto lo stop nella stessa candela: vince lo stop
  const crolla = [100, 104, 108, 112, 116, 80].map((p, i) => candela(i, p));
  const segnale = valuta(crolla, posizioneA100(crolla[0].momento), configurazione);
  assert.equal(segnale.condizioni.scattata, "stop", "l'ipotesi peggiore vince, come sempre");
});

test("sottoMedia: spenta o assente, l'uscita è quella di sempre", () => {
  // 100 sta sotto la media a 3 periodi (~103,5) ma sopra lo stop a -4% (96):
  // così si misura l'uscita sulla tendenza e non quella sullo stop
  const gira = [100, 104, 108, 112, 116, 100].map((p, i) => candela(i, p));
  const posizione = posizioneA100(gira[0].momento);
  const senza = { ...CONFIGURAZIONE, uscita: { ...CONFIGURAZIONE.uscita, presaDiProfittoPercento: 1000, tempoMassimoCandele: null, sottoMedia: null } };

  assert.equal(valuta(gira, posizione, senza), null, "null = spento");
});
