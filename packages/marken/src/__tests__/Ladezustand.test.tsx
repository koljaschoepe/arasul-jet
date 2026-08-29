/**
 * LoadingSpinner Component Tests
 *
 * Tests für LoadingSpinner:
 * - Default rendering
 * - Custom message
 * - Fullscreen mode
 * - Ohne message
 */

import { render, screen } from '@testing-library/react';
import { Ladezustand } from '../muster/Ladezustand';

describe('Ladezustand Component', () => {
  // =====================================================
  // Default Rendering
  // =====================================================
  describe('Default Rendering', () => {
    test('rendert mit Default-Message', () => {
      render(<Ladezustand />);

      expect(screen.getByText('Laden...')).toBeInTheDocument();
    });

    test('hat inline Container-Klasse standardmäßig', () => {
      const { container } = render(<Ladezustand />);

      expect(container.querySelector('.loading-spinner-inline')).toBeInTheDocument();
    });

    test('zeigt Spinner-Animation', () => {
      const { container } = render(<Ladezustand />);

      expect(container.querySelector('.spinner-animation')).toBeInTheDocument();
    });

    test('hat vier Spinner-Ringe', () => {
      const { container } = render(<Ladezustand />);

      const rings = container.querySelectorAll('.spinner-ring');
      expect(rings).toHaveLength(4);
    });
  });

  // =====================================================
  // Custom Message
  // =====================================================
  describe('Custom Message', () => {
    test('zeigt custom Message', () => {
      render(<Ladezustand meldung="Bitte warten..." />);

      expect(screen.getByText('Bitte warten...')).toBeInTheDocument();
    });

    test('zeigt andere Message', () => {
      render(<Ladezustand meldung="Daten werden geladen" />);

      expect(screen.getByText('Daten werden geladen')).toBeInTheDocument();
    });

    test('Message hat spinner-message Klasse', () => {
      const { container } = render(<Ladezustand meldung="Test" />);

      expect(container.querySelector('.spinner-message')).toBeInTheDocument();
    });
  });

  // =====================================================
  // Empty Message
  // =====================================================
  describe('Empty Message', () => {
    test('zeigt keine Message wenn leer', () => {
      const { container } = render(<Ladezustand meldung="" />);

      expect(container.querySelector('.spinner-message')).not.toBeInTheDocument();
    });

    test('zeigt keine Message wenn null', () => {
      const { container } = render(<Ladezustand meldung={null} />);

      expect(container.querySelector('.spinner-message')).not.toBeInTheDocument();
    });
  });

  // =====================================================
  // Fullscreen Mode
  // =====================================================
  describe('Fullscreen Mode', () => {
    test('hat fullscreen Klasse wenn fullscreen=true', () => {
      const { container } = render(<Ladezustand ganzeSeite={true} />);

      expect(container.querySelector('.loading-spinner-fullscreen')).toBeInTheDocument();
      expect(container.querySelector('.loading-spinner-inline')).not.toBeInTheDocument();
    });

    test('hat inline Klasse wenn fullscreen=false', () => {
      const { container } = render(<Ladezustand ganzeSeite={false} />);

      expect(container.querySelector('.loading-spinner-inline')).toBeInTheDocument();
      expect(container.querySelector('.loading-spinner-fullscreen')).not.toBeInTheDocument();
    });

    test('fullscreen mit custom Message', () => {
      const { container } = render(<Ladezustand ganzeSeite={true} meldung="Vollbild-Loading" />);

      expect(container.querySelector('.loading-spinner-fullscreen')).toBeInTheDocument();
      expect(screen.getByText('Vollbild-Loading')).toBeInTheDocument();
    });
  });

  // =====================================================
  // Props Combinations
  // =====================================================
  describe('Props Combinations', () => {
    test('fullscreen ohne Message', () => {
      const { container } = render(<Ladezustand ganzeSeite={true} meldung="" />);

      expect(container.querySelector('.loading-spinner-fullscreen')).toBeInTheDocument();
      expect(container.querySelector('.spinner-message')).not.toBeInTheDocument();
    });

    test('inline mit langer Message', () => {
      const longMessage = 'Dies ist eine sehr lange Nachricht die angezeigt werden soll';
      render(<Ladezustand meldung={longMessage} />);

      expect(screen.getByText(longMessage)).toBeInTheDocument();
    });
  });

  // =====================================================
  // Structure Tests
  // =====================================================
  describe('Component Structure', () => {
    test('hat korrekte DOM-Struktur', () => {
      const { container } = render(<Ladezustand />);

      // Outer container (firstElementChild = the component's root div)
      const outerDiv = container.firstElementChild;
      expect(outerDiv).toHaveClass('loading-spinner-inline');
      // toHaveClass above already failed the test if outerDiv were null;
      // the throw only narrows the type for the queries below.
      if (!outerDiv) throw new Error('LoadingSpinner rendered no root element');

      // Animation container
      const animationDiv = outerDiv.querySelector('.spinner-animation');
      expect(animationDiv).toBeInTheDocument();

      // Message paragraph
      const messageParagraph = outerDiv.querySelector('.spinner-message');
      expect(messageParagraph).toBeInTheDocument();
    });
  });
});
