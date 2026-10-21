// Einsatzverläufe: Was die ersten Kräfte vor Ort tatsächlich vorfinden und wie sich die Lage entwickelt.
// Statt einer festen Lagemeldung direkt bei Eintreffen wird je Einsatz ein Verlauf ausgewürfelt:
// Erkundung mit Dauer, ggf. Erstmeldung und Zwischenmeldung, Feststellung (Täuschungsalarm, Entwarnung,
// Lage wie gemeldet oder größer) und gelegentlich eine Lageänderung während der Abarbeitung.

export interface VerlaufPatient {
  specialty: string;
  desc: string;
}

export interface VerlaufInput {
  tplId: string;
  stichwort: string;
  where: string;
  lage: string;
  needs: Record<string, number>;
  patients: number;
  objekt?: string;
  melder?: number;
}

/** Lageänderung während der Abarbeitung (bei einem Anteil des Arbeitsfortschritts) */
export interface Entwicklung {
  at: number;
  text: string;
  needs?: Record<string, number>;
  patients?: VerlaufPatient[];
  /** Verlängert bzw. verkürzt die Restarbeit */
  workFactor?: number;
  /** Patienten entfallen (z. B. Transportverweigerung) */
  keinTransport?: boolean;
}

export interface Verlauf {
  /** Dauer von der Ankunft bis zur Lagemeldung */
  erkundungMs: number;
  /** Kurze Rückmeldung bei Eintreffen, bevor die Lage feststeht */
  erstmeldung?: string;
  /** Meldung während einer längeren Erkundung */
  zwischenmeldung?: string;
  /** Feststellung nach der Erkundung */
  lage: string;
  /** Tatsächlich benötigte Kräfte */
  needs: Record<string, number>;
  /** Fahrzeugtypen, die nach der Lagemeldung abbestellt werden können */
  abbestellen: string[];
  workFactor: number;
  keinTransport?: boolean;
  patients?: VerlaufPatient[];
  /** Feuerwehr erhöht das Stichwort */
  erhoehung?: string;
  entwicklung?: Entwicklung;
}

type Rng = () => number;

interface Ausgang {
  w: number;
  apply: (v: Verlauf) => void;
}

function pick<T>(rng: Rng, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

function weighted(rng: Rng, list: Ausgang[]): Ausgang {
  const items = list.filter((a) => a.w > 0);
  const total = items.reduce((s, a) => s + a.w, 0);
  let r = rng() * total;
  for (const a of items) {
    r -= a.w;
    if (r <= 0) return a;
  }
  return items[items.length - 1];
}

const sec = (rng: Rng, a: number, b: number) => (a + rng() * (b - a)) * 1000;

/** Erste Feuerwehreinheit laut AAO (nur sie wird bei Entwarnung noch gebraucht) */
function nurErstesFwFahrzeug(needs: Record<string, number>): Record<string, number> {
  for (const t of ['HLF', 'LF', 'TSF', 'MLF', 'TLF']) if (needs[t]) return { [t]: 1 };
  const first = Object.keys(needs).find((t) => !['RTW', 'NEF', 'KTW', 'RTH', 'ELW', 'DLK'].includes(t));
  return first ? { [first]: 1 } : {};
}

function add(needs: Record<string, number>, extra: Record<string, number>) {
  for (const [k, n] of Object.entries(extra)) needs[k] = (needs[k] ?? 0) + n;
}

function weggefallen(vorher: Record<string, number>, nachher: Record<string, number>): string[] {
  return Object.keys(vorher).filter((k) => (nachher[k] ?? 0) < vorher[k]);
}

/**
 * Würfelt den Verlauf eines Einsatzes aus.
 * has(typ): ob der Fahrzeugtyp im Szenario existiert (Nachforderungen nur mit vorhandenen Typen).
 */
export function rollVerlauf(input: VerlaufInput, rng: Rng, has: (type: string) => boolean): Verlauf {
  const sw = input.stichwort;
  const v: Verlauf = {
    erkundungMs: sec(rng, 25, 60),
    lage: input.lage,
    needs: { ...input.needs },
    abbestellen: [],
    workFactor: 1,
  };
  const nachfordern = (extra: Record<string, number>) => {
    const ok = Object.fromEntries(Object.entries(extra).filter(([k]) => has(k)));
    add(v.needs, ok);
    return Object.keys(ok).length > 0;
  };

  if (sw === 'B BMA') bma(v, input, rng, nachfordern);
  else if (sw.startsWith('B')) brand(v, input, rng, nachfordern);
  else if (sw.startsWith('THL')) thl(v, input, rng, nachfordern);
  else if (sw.startsWith('ABC')) abc(v, input, rng);
  else if (sw.startsWith('RD') && sw !== 'RD KTP') rd(v, input, rng, nachfordern);

  v.abbestellen = weggefallen(input.needs, v.needs);
  return v;
}

// ---------- Brandmeldeanlage ----------
function bma(v: Verlauf, input: VerlaufInput, rng: Rng, nachfordern: (e: Record<string, number>) => boolean) {
  const mg = input.melder ? `Meldergruppe ${input.melder}` : 'ausgelöste Meldergruppe';
  v.erstmeldung = pick(rng, [
    `Eingetroffen an der BMA, Feuerwehrschlüsseldepot wird geöffnet, Erkundung ${mg} läuft.`,
    `Eingetroffen, keine Rauchentwicklung von außen sichtbar, Trupp erkundet ${mg} mit Laufkarte.`,
    `Eingetroffen, Betreiber vor Ort, Erkundung ${mg} läuft.`,
  ]);
  v.erkundungMs = sec(rng, 150, 360);
  // Ausgelöster Melder schwer zu finden: Erkundung dauert deutlich länger
  if (rng() < 0.2) {
    v.erkundungMs += sec(rng, 120, 240);
    v.zwischenmeldung = pick(rng, [
      `Erkundung dauert an, ausgelöster Melder befindet sich in der Zwischendecke, Kontrolle mit Leiter und Wärmebildkamera.`,
      `Erkundung dauert an, ${mg} umfasst mehrere Geschosse, Begehung läuft.`,
      `Erkundung dauert an, ausgelöster Melder im Doppelboden des Serverraums, Kontrolle läuft.`,
    ]);
  }
  const erledigt = ' Anlage zurückgestellt und an den Betreiber übergeben. Weitere Kräfte nicht erforderlich.';
  const fehl = (x: Verlauf, text: string) => {
    x.lage = text + erledigt;
    x.needs = nurErstesFwFahrzeug(x.needs);
    x.workFactor = 0.5;
  };
  const ausgang = weighted(rng, [
    {
      w: 40,
      apply: (x) =>
        fehl(
          x,
          'Täuschungsalarm: ' +
            pick(rng, [
              'Wasserdampf aus der Dusche hat den Rauchmelder ausgelöst.',
              'Staubentwicklung durch Bauarbeiten, Schleifarbeiten im Bereich des Melders.',
              'Kochdämpfe aus der Teeküche.',
              'Melder durch Zigarettenrauch ausgelöst.',
              'Insektenspray im Bereich des Melders versprüht.',
              'Nebelmaschine bei einer Veranstaltung.',
            ]),
        ),
    },
    {
      w: 20,
      apply: (x) =>
        fehl(
          x,
          'Fehlalarm durch technischen Defekt: ' +
            pick(rng, ['Melder verschmutzt.', 'Störung an der Meldelinie.', 'Feuchtigkeit im Melder nach Wassereintritt.']),
        ),
    },
    {
      w: 10,
      apply: (x) =>
        fehl(
          x,
          pick(rng, [
            'Handfeuermelder böswillig eingeschlagen, keine Feststellung.',
            'Handfeuermelder versehentlich durch Mitarbeiter betätigt, keine Feststellung.',
          ]),
        ),
    },
    {
      w: 5,
      apply: (x) => fehl(x, 'Auslösung durch Wartungsarbeiten an der Anlage, Wartungsfirma hatte die Abschaltung nicht angemeldet.'),
    },
    {
      w: 15,
      apply: (x) => {
        x.lage = pick(rng, [
          'BMA ausgelöst, Entstehungsbrand in einem Technikraum, mit Kleinlöschgerät abgelöscht, Belüftung läuft.',
          'BMA ausgelöst, verschmorter Elektroverteiler, Strom freigeschaltet, Kontrolle mit Wärmebildkamera, Belüftung läuft.',
          'BMA ausgelöst, brennender Papierkorb durch Mitarbeiter mit Feuerlöscher gelöscht, Belüftung läuft.',
        ]);
        x.workFactor = 1.4;
      },
    },
    {
      w: 10,
      apply: (x) => {
        const mehr = nachfordern({ HLF: 1, DLK: 1, ELW: 1, RTW: 1 });
        x.lage = pick(rng, [
          'Brand im Lagerbereich bestätigt, starke Rauchausbreitung im Gebäude, Räumung läuft.',
          'Brand im 2. OG bestätigt, Flur verraucht, Brandbekämpfung mit einem Trupp unter PA eingeleitet.',
        ]);
        if (mehr) {
          x.erhoehung = 'B 3';
          x.lage += ' Wir erhöhen auf B 3.';
        }
        x.workFactor = 2.5;
      },
    },
  ]);
  ausgang.apply(v);
}

// ---------- Brand ----------
function brand(v: Verlauf, input: VerlaufInput, rng: Rng, nachfordern: (e: Record<string, number>) => boolean) {
  const sw = input.stichwort;
  const gross = /^B [34]/.test(sw);
  const gebaeude = input.where === 'wohnung' || input.where === 'objekt' || /wohnung|keller|scheune|kamin/.test(input.tplId);
  v.erkundungMs = sec(rng, gross ? 60 : 30, gross ? 150 : 90);
  if (gross || rng() < 0.5)
    v.erstmeldung = pick(rng, [
      'Eingetroffen, Rauch sichtbar, Erkundung läuft.',
      'Eingetroffen, Feuerschein erkennbar, erkunden.',
      'Eingetroffen, Erkundung läuft, Lagemeldung folgt.',
    ]);
  const ausgang = weighted(rng, [
    { w: 62, apply: () => {} },
    {
      // Entwarnung: Lage kleiner als gemeldet
      w: sw === 'B 4' ? 4 : 16,
      apply: (x) => {
        x.lage = gebaeude
          ? pick(rng, [
              'Angebranntes Essen auf dem Herd, Wohnung verraucht, Belüftung läuft.',
              'Brand bereits durch Bewohner mit Feuerlöscher gelöscht, Kontrolle mit Wärmebildkamera, Belüftung.',
              'Rauchentwicklung durch defekten Wäschetrockner, Gerät stromlos und ins Freie gebracht, kein Brand.',
            ])
          : pick(rng, [
              'Brand bereits durch Passanten gelöscht, Nachlöscharbeiten mit Kübelspritze.',
              'Nur geringe Rauchentwicklung, Brandstelle abgelöscht, keine Ausbreitung.',
              'Kontrolliertes Feuer des Grundstückbesitzers, angemeldet, keine Gefahr, abgelöscht.',
            ]);
        x.needs = nurErstesFwFahrzeug(x.needs);
        if (input.patients) for (const t of ['RTW']) if (input.needs[t]) x.needs[t] = input.needs[t];
        if (input.patients) x.lage += ' Eine Person mit leichter Rauchgasintoxikation an den Rettungsdienst übergeben.';
        x.lage += ' Weitere Kräfte nicht erforderlich.';
        x.workFactor = 0.4;
      },
    },
    {
      // Lage größer als gemeldet
      w: 14,
      apply: (x) => {
        const extra: Record<string, number> = { HLF: 1 };
        if (gebaeude && !x.needs.DLK) extra.DLK = 1;
        if (gross && !x.needs.ELW) extra.ELW = 1;
        if (!nachfordern(extra)) return;
        x.lage += gebaeude
          ? pick(rng, [
              ' Brandausbreitung über die Fassade in das Dachgeschoss, zusätzliche Kräfte erforderlich.',
              ' Brand hat auf die Nachbarwohnung übergegriffen, zusätzliche Kräfte erforderlich.',
            ])
          : pick(rng, [
              ' Brand breitet sich durch Wind schnell aus, zusätzliche Kräfte erforderlich.',
              ' Brand droht auf benachbarte Fahrzeuge und einen Carport überzugreifen, zusätzliche Kräfte erforderlich.',
            ]);
        if (!gross) {
          x.erhoehung = sw === 'B 1' ? 'B 2' : 'B 3';
          x.lage += ` Wir erhöhen auf ${x.erhoehung}.`;
        }
        x.workFactor = 1.4;
      },
    },
    {
      // zweiter Rettungsweg
      w: /^B 3/.test(sw) && gebaeude && !v.needs.DLK ? 8 : 0,
      apply: (x) => {
        if (nachfordern({ DLK: 1 })) x.lage += ' Personen am Fenster, zweiter Rettungsweg über Drehleiter erforderlich.';
      },
    },
  ]);
  ausgang.apply(v);
  if (v.workFactor < 1) return;
  // Lageänderung während der Brandbekämpfung
  const r = rng();
  if (gross && r < 0.3 && v.needs.HLF !== undefined)
    v.entwicklung = {
      at: 0.4 + rng() * 0.2,
      text: 'Atemschutzgeräteträger erschöpft, wir benötigen Ablösung: 1x HLF mit Atemschutz.',
      needs: { HLF: 1 },
      workFactor: 1.15,
    };
  else if (r > 0.88)
    v.entwicklung = {
      at: 0.6 + rng() * 0.2,
      text: gebaeude
        ? 'Glutnester in der Zwischendecke festgestellt, Decke wird geöffnet, Nachlöscharbeiten dauern länger.'
        : 'Rückzündung an der Brandstelle, erneuter Löschangriff, Nachlöscharbeiten dauern länger.',
      workFactor: 1.4,
    };
}

// ---------- Technische Hilfe ----------
function thl(v: Verlauf, input: VerlaufInput, rng: Rng, nachfordern: (e: Record<string, number>) => boolean) {
  const id = input.tplId;
  v.erkundungMs = sec(rng, 30, 90);
  const ausgang: Ausgang[] = [{ w: 70, apply: () => {} }];
  if (/oel/.test(id)) {
    ausgang.push(
      {
        w: 15,
        apply: (x) => {
          x.lage = 'Ölspur deutlich länger als gemeldet, ca. 2 km durch mehrere Ortsteile, Straßenmeisterei mit Kehrmaschine anfordern.';
          x.workFactor = 2;
        },
      },
      {
        w: 15,
        apply: (x) => {
          x.lage = 'Ölspur bereits durch die Straßenmeisterei abgestreut, keine Maßnahmen der Feuerwehr erforderlich.';
          x.workFactor = 0.25;
        },
      },
    );
  } else if (/baum/.test(id)) {
    ausgang.push(
      {
        w: 15,
        apply: (x) => {
          x.lage = 'Mehrere Bäume auf ca. 300 m umgestürzt, Straße voll gesperrt, Beseitigung dauert an.';
          nachfordern({ HLF: 1 });
          x.workFactor = 1.8;
        },
      },
      {
        w: 15,
        apply: (x) => {
          x.lage = 'Baum bereits durch Anwohner an den Fahrbahnrand gezogen, Restholz entfernt, Straße frei.';
          x.workFactor = 0.3;
        },
      },
    );
  } else if (/tuer/.test(id)) {
    ausgang.push(
      {
        w: 12,
        apply: (x) => {
          x.lage = 'Angehöriger mit Schlüssel eingetroffen, Wohnung ohne Gewalt geöffnet, Patientin nach Sturz am Boden, Übergabe an RD.';
          x.workFactor = 0.6;
        },
      },
      {
        w: 10,
        apply: (x) => {
          x.lage = 'Wohnung geöffnet, niemand angetroffen, Bewohnerin laut Nachbarn im Krankenhaus. Wohnung an Polizei übergeben.';
          x.keinTransport = true;
          x.workFactor = 0.6;
        },
      },
    );
  } else if (/vu/.test(id)) {
    const klemm = /klemm|ab_vu/.test(id);
    if (klemm)
      ausgang.push({
        w: 15,
        apply: (x) => {
          x.lage = 'VU, eingeklemmte Person konnte sich vor Eintreffen selbst befreien, Patientenversorgung durch RD, Absicherung und Betriebsstoffe.';
          for (const t of ['RW']) delete x.needs[t];
          if ((x.needs.HLF ?? 0) > 1) x.needs.HLF = 1;
          x.workFactor = 0.6;
        },
      });
    ausgang.push({
      w: 12,
      apply: (x) => {
        if (!nachfordern({ RTW: 1 })) return;
        x.lage += ' Weitere Person im Fahrzeug mit HWS-Beschwerden, zusätzlicher RTW erforderlich.';
        x.patients = [{ specialty: 'Unfallchirurgie', desc: 'HWS-Distorsion nach VU' }];
      },
    });
    if (klemm)
      v.entwicklung =
        rng() < 0.25
          ? {
              at: 0.3 + rng() * 0.2,
              text: 'Eingeklemmte Person verschlechtert sich, Rettung wird beschleunigt, Crashrettung eingeleitet.',
              workFactor: 0.7,
            }
          : undefined;
  } else if (/aufzug/.test(id)) {
    ausgang.push({
      w: 20,
      apply: (x) => {
        x.lage = 'Aufzugsmonteur bereits vor Ort, Personen befreit, keine Maßnahmen der Feuerwehr erforderlich.';
        x.workFactor = 0.25;
      },
    });
  } else if (/wasser/.test(id)) {
    ausgang.push({
      w: 15,
      apply: (x) => {
        x.lage = 'Wasserschaden größer als gemeldet, Keller ca. 40 cm unter Wasser, Abpumpen mit mehreren Pumpen.';
        x.workFactor = 1.8;
      },
    });
  }
  weighted(rng, ausgang).apply(v);
}

// ---------- ABC / Gefahrstoffe ----------
function abc(v: Verlauf, input: VerlaufInput, rng: Rng) {
  v.erkundungMs = sec(rng, 60, 150);
  v.erstmeldung = 'Eingetroffen, Erkundung mit Messgerät läuft.';
  if (/gas/.test(input.tplId) && rng() < 0.35) {
    v.lage = 'Messung negativ, kein Gasaustritt feststellbar, Geruch vermutlich aus der Kanalisation, Gebäude wieder freigegeben.';
    v.needs = nurErstesFwFahrzeug(v.needs);
    v.workFactor = 0.4;
  }
}

// ---------- Rettungsdienst ----------
function rd(v: Verlauf, input: VerlaufInput, rng: Rng, nachfordern: (e: Record<string, number>) => boolean) {
  const sw = input.stichwort;
  const id = input.tplId;
  // Patientenkontakt und Erstuntersuchung
  v.erkundungMs = sec(rng, 45, 150);
  if (id.startsWith('kvb') || sw === 'RD 3') return;
  const ausgang: Ausgang[] = [{ w: 70, apply: () => {} }];
  if (/cpr/.test(id)) {
    ausgang.push({
      w: 45,
      apply: (x) => {
        x.lage = 'Reanimation nach 30 Minuten ohne ROSC durch den Notarzt abgebrochen, Patient verstorben, Polizei zur Leichensache und KIT verständigen.';
        x.keinTransport = true;
        x.workFactor = 1.1;
      },
    });
  }
  if (sw === 'RD 2' && input.needs.NEF && !/cpr|stroke|chest|breath/.test(id)) {
    ausgang.push({
      w: 18,
      apply: (x) => {
        x.lage += ' Patient stabil, Notarzt nicht erforderlich, NEF kann abbestellt werden.';
        delete x.needs.NEF;
      },
    });
  }
  if (sw === 'RD 1' && input.patients) {
    ausgang.push(
      {
        w: 8,
        apply: (x) => {
          x.lage = `${x.lage.replace(/,?\s*Transport[^.]*\./, '.')} Patient lehnt nach Aufklärung den Transport ab, Unterschrift eingeholt, Hausarzt empfohlen.`;
          x.keinTransport = true;
          x.workFactor = 0.7;
        },
      },
      {
        w: 10,
        apply: (x) => {
          if (nachfordern({ NEF: 1 })) x.lage += ' Patient trübt zunehmend ein, Notarzt erforderlich.';
        },
      },
    );
  }
  if (input.patients && input.where === 'wohnung')
    ausgang.push({
      w: 7,
      apply: (x) => {
        if (nachfordern({ HLF: 1 })) x.lage += ' Patient ca. 150 kg, 3. OG ohne Aufzug, Tragehilfe durch die Feuerwehr erforderlich.';
      },
    });
  weighted(rng, ausgang).apply(v);
  // Verschlechterung während der Versorgung
  if (sw === 'RD 1' && input.patients && !v.keinTransport && !v.needs.NEF && rng() < 0.08)
    v.entwicklung = {
      at: 0.3 + rng() * 0.3,
      text: 'Zustand des Patienten verschlechtert sich, Patient zunehmend kreislaufinstabil, wir fordern Notarzt nach.',
      needs: { NEF: 1 },
      workFactor: 1.2,
    };
}
