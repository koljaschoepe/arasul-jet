/**
 * Die Felder haben bei grobem Zeiger eine Trefferfläche von 44 px (5.11.0).
 *
 * Am Rechner bleiben sie kompakt (32 px), mit dem Finger braucht es 44 px.
 * Bis 5.10.0 hatte das nur der Knopf; Eingabe, Auswahl, Checkbox, Radio und
 * Schalter blieben am Handy so klein wie am Rechner. jsdom kennt keine
 * Medienabfrage, also wird die Klasse geprüft, die Tailwind daraus macht.
 */

import { render, screen } from '@testing-library/react';
import { Input } from '../primitive/input';
import { Checkbox } from '../primitive/checkbox';
import { Switch } from '../primitive/switch';
import { RadioGroup, RadioGroupItem } from '../primitive/radio-group';
import { Select, SelectTrigger, SelectValue } from '../primitive/select';
import { TREFFER, FELD_GROB } from '../primitive/treffer';

describe('Trefferfläche bei grobem Zeiger', () => {
  it('die Eingabe ist am Rechner 32 px und bei grobem Zeiger 44 px hoch', () => {
    render(<Input aria-label="Name" />);
    const feld = screen.getByRole('textbox', { name: 'Name' });
    expect(feld.className).toContain('h-[32px]');
    expect(feld.className).toContain(FELD_GROB);
    expect(FELD_GROB).toBe('pointer-coarse:h-[44px]');
  });

  it('der Auslöser der Auswahl wächst ebenso', () => {
    render(
      <Select>
        <SelectTrigger aria-label="Monat">
          <SelectValue placeholder="Monat" />
        </SelectTrigger>
      </Select>
    );
    const ausloeser = screen.getByRole('combobox', { name: 'Monat' });
    expect(ausloeser.className).toContain('data-[size=default]:h-[32px]');
    expect(ausloeser.className).toContain('pointer-coarse:data-[size=default]:h-[44px]');
  });

  it('Checkbox, Radio und Schalter behalten ihre Größe und bekommen 44 px darüber', () => {
    render(
      <>
        <Checkbox aria-label="Erledigt" />
        <Switch aria-label="An" />
        <RadioGroup aria-label="Art">
          <RadioGroupItem value="a" aria-label="A" />
        </RadioGroup>
      </>
    );
    for (const el of [
      screen.getByRole('checkbox', { name: 'Erledigt' }),
      screen.getByRole('switch', { name: 'An' }),
      screen.getByRole('radio', { name: 'A' }),
    ]) {
      expect(el.className).toContain('pointer-coarse:before:min-h-11');
      expect(el.className).toContain('pointer-coarse:before:min-w-11');
      expect(el.className).toContain('relative');
    }
    expect(TREFFER).toContain("pointer-coarse:before:content-['']");
  });
});
