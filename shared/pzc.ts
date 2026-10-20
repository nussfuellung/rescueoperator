// Patientenzuweisungscodes Bayern (PZC-Liste V 1.3, IVENA-Beirat 17.06.2024, auf Grundlage der bundeseinheitlichen PZC).
// Ein PZC besteht aus Rückmeldeindikation (3 Stellen), Alter (2 Stellen, Säuglinge 00) und Behandlungsdringlichkeit
// (1 Notfallversorgung, 2 stationär, 3 ambulant): 345833 = Hypertensiver Notfall, 83 Jahre, ambulant.

export interface PzcEintrag {
  code: string;
  text: string;
  gruppe: string;
}

const G: [string, [string, string][]][] = [
  ['Reanimation', [['131', 'Reanimation laufend / intermittierend'], ['132', 'Reanimation ROSC'], ['133', 'Reanimation Trauma laufend / intermittierend'], ['134', 'Reanimation Hypothermie']]],
  ['ECMO', [['140', 'vvECMO Zuverlegung'], ['141', 'vvECMO Abholung'], ['142', 'vaECMO Zuverlegung'], ['143', 'vaECMO Abholung'], ['144', 'eCPR Zuverlegung'], ['145', 'eCPR Abholung']]],
  ['Verletzung – mehrfach', [['211', 'Trauma Schockraum A mit SHT'], ['212', 'Trauma Schockraum A ohne SHT'], ['213', 'Trauma Schockraum B'], ['214', 'Mehrfachverletzung sonstige'], ['215', 'Mehrfachverletzung mit Augen'], ['219', 'oberflächliche Verletzungen (bel. Lokalisation)']]],
  ['Verletzung – Gesicht / Kopf', [['221', 'SHT offen'], ['222', 'SHT geschlossen'], ['223', 'Gesichtsverletzung'], ['224', 'Kopfverletzung'], ['225', 'Augenverletzung']]],
  ['Verletzung – Thorax', [['231', 'Thorax penetrierend'], ['232', 'Thorax geschlossen / stumpf'], ['233', 'Pneumothorax traumatisch']]],
  ['Verletzung – Abdomen', [['241', 'Abdomen penetrierend'], ['242', 'Abdomen geschlossen / stumpf'], ['243', 'Akutes Abdomen (nicht Trauma)']]],
  ['Verletzung – Wirbelsäule', [['251', 'Verl. der Wirbelsäule mit neurol. Ausfällen'], ['252', 'Verl. der Wirbelsäule ohne neurol. Ausfälle'], ['253', 'Rückenschmerzen, akut mit neurolog. Symptomatik'], ['254', 'Rückenschmerzen nicht traumatisch ohne neurologische Ausfälle'], ['255', 'Lähmung / Querschnitt akut (nicht Stroke)']]],
  ['Verletzung – Becken / Urogenital', [['261', 'Becken offen'], ['262', 'Becken geschlossen'], ['263', 'Urogenitaltrauma (isoliert)']]],
  ['Verletzung – Extremitäten', [['271', 'Fraktur Extremitäten offen'], ['272', 'Fraktur Extremitäten geschlossen'], ['273', 'Hüft- / Schenkelhalsfraktur'], ['274', 'Verl. d. Extrem. mit Gefäß-/Nervenverl.'], ['279', 'Sonstige Extremitätenverletzung']]],
  ['Verletzung – Hand', [['275', 'Handverletzung'], ['276', 'Fingeramputation'], ['277', 'Hand- / Extremitäten Amputation']]],
  ['Verletzung – physikalisch / chemisch', [['281', 'Verbrennung / Verbrühung'], ['282', 'Verätzung'], ['283', 'Hochspannungstrauma (ab 1000 V~)'], ['284', 'Barotrauma / Tauchunfall / Dekompressionskrankheit'], ['285', 'Strahlentrauma'], ['286', 'Hitzeerschöpfung / Hitzschlag'], ['287', 'Unterkühlung / Erfrierung'], ['288', '(Beinahe-) Ertrinken / Badeunfall']]],
  ['Verletzung – Gefäß', [['291', 'Aortenaneurysma'], ['292', 'Extremitätenischämie (akut)'], ['293', 'Aorta ascendens Dissektion (bestätigt)'], ['299', 'Gefäßchirurgischer Notfall, sonstiger']]],
  ['Atmung / Lunge', [['311', 'Atemnot (unklar) / Atembeschwerden / ARI'], ['312', 'Obstruktion (Asthma / COPD)'], ['313', 'Hämoptoe / Hämoptysen'], ['314', '(Bolus-) Aspiration'], ['315', 'Bronchitis / Pneumonie'], ['316', 'Hyperventilation'], ['317', 'Lungenödem (nicht kardial)'], ['318', 'Spontanpneumothorax'], ['319', 'Pneumologischer Notfall, sonstiger']]],
  ['Innere (sonstige)', [['321', 'Anaphylaxie / Unverträglichkeitsreaktion'], ['322', 'Synkope / Kollaps'], ['323', 'Hypotonie'], ['324', 'Thrombose'], ['325', 'Unklares Fieber'], ['326', 'Exsikkose'], ['329', 'Internistischer Notfall, sonstiger']]],
  ['Brustschmerz', [['331', 'Unklarer Brust- / Thoraxschmerz'], ['332', 'STEMI / „OMI“'], ['333', 'NSTEMI, instabile AP']]],
  ['Herz / Kreislauf', [['341', 'Arrhythmie'], ['342', 'Bradykardie'], ['343', 'Tachykardie'], ['344', 'Elektrounfall (bis 1000 V)'], ['345', 'Hypertensiver Notfall / Krise'], ['346', 'Kardiogener Schock'], ['347', 'Herzinsuffizienz'], ['348', 'Lungenembolie'], ['349', 'Kardiologischer Notfall, sonstiger']]],
  ['Abdomen', [['351', 'Obere GI-Blutung'], ['352', 'Untere GI-Blutung'], ['353', 'Bauchschmerzen'], ['354', 'Gastroenteritis'], ['359', 'Gastroenterologischer Notfall, sonstiger']]],
  ['Intoxikationen', [['360', 'Intoxikation Rauchgas / Reizgas (nicht CO)'], ['361', 'Intoxikation Alkohol'], ['362', 'Intoxikation Drogen / Rauschgift'], ['363', 'sonstige Intoxikation'], ['364', 'Intoxikation Lebensmittel'], ['365', 'Intoxikation Medikamente'], ['366', 'Intoxikation Pflanzenschutzmittel'], ['367', 'Intoxikation tierische Gifte'], ['368', 'Intoxikation Giftpflanzen'], ['369', 'Inhalative Intoxikation, sonstige'], ['370', 'Kohlenmonoxid-Vergiftung']]],
  ['Spezielle Infektionen', [['371', 'Meningitis / Enzephalitis'], ['372', 'TBC'], ['373', 'Sepsis (Infekt. + qSOFA mind. 2)'], ['374', 'Septischer Schock'], ['375', 'hochkontagiöse Erkrankung (Sonderiso)'], ['376', 'Covid-19 – SARS-CoV 2 (bestätigt)'], ['377', 'Covid-19 – SARS-CoV 2 (nicht bestätigt)'], ['378', 'aktuelle Infektionskrankheit zur Quarantäne'], ['379', 'Infektiologischer Notfall, sonstige']]],
  ['Sonstige Erkrankungen', [['391', 'Akuter endokrinologischer Notfall'], ['392', 'Hyperglykämie'], ['393', 'Hypoglykämie']]],
  ['Neurologisch', [['411', 'Anhaltender epileptischer Anfall'], ['412', 'epileptischer Anfall (stattgehabt)'], ['413', 'Kopf- / Gesichtsschmerz'], ['414', 'Vigilanzminderung / Koma (ohne Trauma)'], ['415', 'Schwindel'], ['419', 'Neurologischer Notfall, sonstiger'], ['421', 'Schlaganfall / Blutung < 24h oder unklar'], ['423', 'Schlaganfall / Blutung > 24h'], ['425', 'diagnostizierter cerebraler Gefäßverschluss zur Thrombektomie']]],
  ['Psychiatrisch', [['431', 'Suizid, angedroht'], ['432', 'Einweisung, psychiatrische'], ['433', 'Einweisung (nach LandesPsychKG)'], ['434', 'Einweisung (nach LandesPsychKG), mit Fixierung'], ['435', 'Akute Verwirrtheit / Delir']]],
  ['Pädiatrisch', [['511', 'pädiatrisch – Atemnot'], ['512', 'schwerer Husten (Pseudokrupp)'], ['513', 'pädiatrisch – Fieberkrampf'], ['519', 'pädiatrischer Notfall, sonstiger']]],
  ['Geburtshilfe – präklinische Geburt', [['521', '< 16 SSW'], ['522', '16+0 bis 21+6 SSW'], ['523', '22+0 bis 28+6 SSW'], ['524', '29+0 bis 31+6 SSW'], ['525', '32+0 bis 35+6 SSW / Wachstumsstörung'], ['526', 'ab 36+0 SSW'], ['527', 'ab 36+0 SSW bei Diabetes'], ['528', 'Drillinge bis 32+6 SSW'], ['529', 'Drillinge ab 33+0 SSW']]],
  ['Geburtshilfe – einsetzende Geburt', [['530', 'akute fetale Gefährdung'], ['531', '< 16 SSW'], ['532', '16+0 bis 21+6 SSW'], ['533', '22+0 bis 28+6 SSW'], ['534', '29+0 bis 31+6 SSW'], ['535', '32+0 bis 35+6 SSW / Wachstumsstörung'], ['536', 'ab 36+0 SSW'], ['537', 'ab 36+0 SSW bei Diabetes'], ['538', 'Drillinge bis 32+6 SSW'], ['539', 'Drillinge ab 33+0 SSW']]],
  ['Geburtshilfe – Notfall in der Schwangerschaft', [['540', 'akute fetale Gefährdung'], ['541', '< 16 SSW'], ['542', '16+0 bis 21+6 SSW'], ['543', '22+0 bis 28+6 SSW'], ['544', '29+0 bis 31+6 SSW'], ['545', '32+0 bis 35+6 SSW / Wachstumsstörung'], ['546', 'ab 36+0 SSW'], ['547', 'ab 36+0 SSW bei Diabetes'], ['548', 'Drillinge bis 32+6 SSW'], ['549', 'Drillinge ab 33+0 SSW']]],
  ['Gynäkologisch', [['551', 'vaginale Blutung'], ['552', 'Unterbauchschmerzen'], ['553', 'Sexualdelikt'], ['559', 'gynäkologischer Notfall, sonstiger']]],
  ['Transporte', [['601', 'Transport zu definierten Leistungen'], ['602', 'Transport zu geplanter Dialyse'], ['603', 'Transport zu geplantem Herzkatheter'], ['604', 'Transport zu geplantem CT'], ['605', 'Transport zu geplantem MRT']]],
  ['Haut', [['701', 'Haut- und Geschlechtskrankheiten']]],
  ['Urologie', [['711', 'Nieren- / Harnleiterkolik'], ['712', 'Hodenschmerz'], ['713', 'Harnverhalt (akut)'], ['714', 'Hämaturie'], ['715', 'Katheterwechsel (transurethral)'], ['716', 'Katheterwechsel (suprapubisch)'], ['717', 'Katheterverlust / -verstopfung'], ['718', 'Harnwegsinfekt'], ['719', 'urologischer Notfall, sonstiger']]],
  ['Augen', [['721', 'akute Augenerkrankung'], ['729', 'Augennotfall, sonstiger']]],
  ['HNO', [['731', 'Nasenbluten (Epistaxis) unstillbar'], ['732', '(Nach-) Blutung, HNO, akut'], ['733', 'Tracheostoma-Komplikation'], ['739', 'HNO-Notfall, sonstiger']]],
  ['Mund-Kiefer-Gesicht', [['749', 'Mund-Kiefer-Gesicht-Notfall, sonstiger']]],
  ['Geriatrie', [['751', 'geriatrische Einweisung']]],
  ['Unbestimmt', [['779', 'sonstige Notfallsituationen']]],
  ['Allgemeinmedizin', [['801', 'Schmerz / Schwellung Bewegungsapparat nicht Trauma'], ['802', 'Schwellung / Abszess'], ['809', 'Allgemeinmedizin, sonstiger Notfall']]],
];

export const PZC_LISTE: PzcEintrag[] = G.flatMap(([gruppe, l]) => l.map(([code, text]) => ({ code, text, gruppe })));
const BY_CODE = new Map(PZC_LISTE.map((p) => [p.code, p]));

export const DRINGLICHKEIT: Record<string, string> = { '1': 'Notfallversorgung', '2': 'Stationäre Versorgung', '3': 'Ambulante Versorgung' };

/** Fachbereich, den eine Klinik für diesen PZC angemeldet haben muss (Fachbereiche des Simulators) */
export function pzcFachbereich(code: string): string {
  const c = code.slice(0, 3);
  if (['131', '132', '332', '333', '341', '342', '343', '344', '346', '347', '603'].includes(c)) return 'Kardiologie (HKL)';
  if (['421', '423', '425'].includes(c)) return 'Stroke Unit';
  if (c === '281' || c === '282' || c === '283') return 'Verbrennungen';
  if (c.startsWith('51')) return 'Pädiatrie';
  if (c === '133' || /^2[1-3]/.test(c) || ['251', '252', '255', '261', '262', '271', '273', '274', '277'].includes(c)) return 'Unfallchirurgie';
  if (/^2/.test(c) || ['243', '353'].includes(c)) return 'Chirurgie';
  return 'Innere Medizin';
}

export interface PzcInfo {
  pzc: string;
  eintrag?: PzcEintrag;
  alter: number;
  dringlichkeit: string;
  fach: string;
}

/** "345833" -> Hypertensiver Notfall, 83 Jahre, ambulant */
export function decodePzc(pzc: string): PzcInfo | undefined {
  const m = /^(\d{3})(\d{2})([123])$/.exec(pzc.replace(/\s/g, ''));
  if (!m) return undefined;
  return { pzc: m[0], eintrag: BY_CODE.get(m[1]), alter: Number(m[2]), dringlichkeit: m[3], fach: pzcFachbereich(m[1]) };
}

export function pzcText(pzc: string): string {
  const d = decodePzc(pzc);
  if (!d) return pzc;
  const alter = d.alter === 0 ? 'Säugling' : `${d.alter} J.`;
  return `${d.eintrag?.text ?? 'unbekannter Code'}, ${alter}, ${DRINGLICHKEIT[d.dringlichkeit]}`;
}

/** PZC zu einer Patientenbeschreibung des Simulators (erste passende Regel) */
const REGELN: [RegExp, string, 1 | 2 | 3][] = [
  [/reanimation|rosc/i, '132', 1],
  [/schlaganfall|stroke/i, '421', 1],
  [/stemi|herzinfarkt/i, '332', 1],
  [/rhythmus/i, '341', 2],
  [/polytrauma/i, '212', 1],
  [/thoraxtrauma/i, '232', 1],
  [/schenkelhals/i, '273', 2],
  [/wirbelsäule/i, '252', 1],
  [/\bsht\b|schädel/i, '222', 1],
  [/radius|handgelenk/i, '272', 2],
  [/rippe|thoraxprellung/i, '232', 2],
  [/hws/i, '252', 3],
  [/kopfplatzwunde|antikoaguliert/i, '224', 2],
  [/\bhand\b/i, '275', 3],
  [/fraktur/i, '272', 2],
  [/platzwunde|prellung|sprunggelenk/i, '219', 3],
  [/rauchgas/i, '360', 2],
  [/fieberkrampf/i, '513', 2],
  [/krampfanfall/i, '412', 2],
  [/anaphylax|allerg/i, '321', 1],
  [/asthma|copd/i, '312', 2],
  [/hypoglyk/i, '393', 2],
  [/psych|suizid|tabletten/i, '432', 2],
  [/alkohol/i, '361', 3],
  [/exsikk/i, '326', 2],
  [/synkope|kollaps/i, '322', 2],
  [/abdomen|appendizitis|bauch/i, '243', 2],
  [/dialyse/i, '602', 3],
  [/liegendtransport|stationären aufnahme/i, '601', 2],
];

const FALLBACK: Record<string, string> = {
  'Innere Medizin': '329',
  Chirurgie: '279',
  Unfallchirurgie: '214',
  'Kardiologie (HKL)': '349',
  'Stroke Unit': '421',
  Pädiatrie: '519',
  Verbrennungen: '281',
};

export function pzcFuer(desc: string, specialty: string, alter: number, dringend?: boolean): string {
  const r = REGELN.find(([re]) => re.test(desc));
  const code = r?.[1] ?? FALLBACK[specialty] ?? '779';
  const d = dringend && !r ? 1 : (r?.[2] ?? 2);
  const a = String(Math.max(0, Math.min(99, Math.round(alter)))).padStart(2, '0');
  return `${code}${a}${d}`;
}

/** PZC zum Vorlesen: "3 4 5 – 8 3 – 3" */
export function pzcSprech(pzc: string): string {
  return `${pzc.slice(0, 3).split('').join(' ')}, ${pzc.slice(3, 5).split('').join(' ')}, ${pzc.slice(5)}`;
}
