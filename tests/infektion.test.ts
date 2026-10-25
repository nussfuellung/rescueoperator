import { describe, expect, it } from 'vitest';
import { infektionstransport, pzcFuer } from '../shared/pzc';

describe('Infektionstransport', () => {
  it('erkennt infektiöse Patienten am PZC', () => {
    expect(infektionstransport(pzcFuer('Liegendtransport, Noro-Infektion, isolationspflichtig', 'Innere Medizin', 85))).toBe(true);
    expect(infektionstransport(pzcFuer('V. a. Meningitis, hohes Fieber und Nackensteife', 'Innere Medizin', 20))).toBe(true);
    expect(infektionstransport(pzcFuer('Liegendtransport zur stationären Aufnahme', 'Innere Medizin', 85))).toBe(false);
    expect(infektionstransport(undefined)).toBe(false);
  });
});
