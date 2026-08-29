/**
 * Die Dateiablage hat drei Zusagen, und alle drei brechen lautlos.
 *
 * 1. ZIEHEN IST NIE DER EINZIGE WEG. Der Kasten ist ein Knopf; mit der
 *    Tastatur und auf einem Telefon geht es sonst gar nicht.
 * 2. SIE IST GESTEUERT. Die Liste kommt von außen, jede Änderung geht nach
 *    außen — zwei Wahrheiten darüber, was gewählt ist, sind eine zu viel.
 * 3. EINE ZU GROSSE DATEI WIRD ABGEWIESEN, UND ZWAR SICHTBAR. Sie still
 *    wegzulassen wäre der schlimmere Fehler: der Mensch schickt ab und
 *    glaubt, die Datei sei dabei.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dateiablage } from '../muster/Dateiablage';

function datei(name: string, groesse: number) {
  const inhalt = new Uint8Array(groesse);
  return new File([inhalt], name, { type: 'text/plain' });
}

describe('Dateiablage', () => {
  it('ist mit der Tastatur zu bedienen: der Kasten ist ein Knopf', () => {
    render(<Dateiablage dateien={[]} aufDateien={vi.fn()} />);
    expect(screen.getByRole('button', { name: /ziehen oder auswählen/i })).toBeInTheDocument();
  });

  it('meldet gewählte Dateien nach außen, statt sie selbst zu halten', async () => {
    const nutzer = userEvent.setup();
    const gerufen = vi.fn();
    const { container } = render(<Dateiablage dateien={[]} aufDateien={gerufen} />);

    const feld = container.querySelector('input[type="file"]');
    expect(feld).toBeInTheDocument();
    await nutzer.upload(feld as HTMLInputElement, datei('antrag.txt', 10));

    expect(gerufen).toHaveBeenCalledTimes(1);
    expect(gerufen.mock.calls[0]![0]).toHaveLength(1);
  });

  it('weist eine zu große Datei sichtbar ab, statt sie still wegzulassen', async () => {
    const nutzer = userEvent.setup();
    const gerufen = vi.fn();
    const { container } = render(<Dateiablage dateien={[]} aufDateien={gerufen} maxGroesse={4} />);

    await nutzer.upload(
      container.querySelector('input[type="file"]') as HTMLInputElement,
      datei('zugross.txt', 16)
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('zugross.txt');
    expect(gerufen).not.toHaveBeenCalled();
  });

  it('zeigt jede gewählte Datei mit einem Weg, sie wieder loszuwerden', async () => {
    const nutzer = userEvent.setup();
    const gerufen = vi.fn();
    render(<Dateiablage dateien={[datei('antrag.txt', 2048)]} aufDateien={gerufen} />);

    expect(screen.getByText('antrag.txt')).toBeInTheDocument();
    expect(screen.getByText('2.0 kB')).toBeInTheDocument();

    await nutzer.click(screen.getByRole('button', { name: 'antrag.txt entfernen' }));
    expect(gerufen).toHaveBeenCalledWith([]);
  });
});
