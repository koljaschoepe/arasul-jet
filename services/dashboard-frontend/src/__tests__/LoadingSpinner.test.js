/**
 * LoadingSpinner Component Tests
 *
 * Tests für LoadingSpinner:
 * - Default rendering
 * - Custom message
 * - Fullscreen mode
 * - Ohne message
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import LoadingSpinner from '../components/LoadingSpinner';

describe('LoadingSpinner Component', () => {
  // =====================================================
  // Default Rendering
  // =====================================================
  describe('Default Rendering', () => {
    test('rendert mit Default-Message', () => {
      render(<LoadingSpinner />);

      expect(screen.getByText('Laden...')).toBeInTheDocument();
    });

    test('hat inline Container-Klasse standardmäßig', () => {
      const { container } = render(<LoadingSpinner />);

      expect(container.querySelector('.loading-spinner-inline')).toBeInTheDocument();
    });

    test('zeigt Spinner-Animation', () => {
      const { container } = render(<LoadingSpinner />);

      expect(container.querySelector('.spinner-animation')).toBeInTheDocument();
    });

    test('hat vier Spinner-Ringe', () => {
      const { container } = render(<LoadingSpinner />);

      const rings = container.querySelectorAll('.spinner-ring');
      expect(rings).toHaveLength(4);
    });
  });

  // =====================================================
  // Custom Message
  // =====================================================
  describe('Custom Message', () => {
    test('zeigt custom Message', () => {
      render(<LoadingSpinner message="Bitte warten..." />);

      expect(screen.getByText('Bitte warten...')).toBeInTheDocument();
    });

    test('zeigt andere Message', () => {
      render(<LoadingSpinner message="Daten werden geladen" />);

      expect(screen.getByText('Daten werden geladen')).toBeInTheDocument();
    });

    test('Message hat spinner-message Klasse', () => {
      const { container } = render(<LoadingSpinner message="Test" />);

      expect(container.querySelector('.spinner-message')).toBeInTheDocument();
    });
  });

  // =====================================================
  // Empty Message
  // =====================================================
  describe('Empty Message', () => {
    test('zeigt keine Message wenn leer', () => {
      const { container } = render(<LoadingSpinner message="" />);

      expect(container.querySelector('.spinner-message')).not.toBeInTheDocument();
    });

    test('zeigt keine Message wenn null', () => {
      const { container } = render(<LoadingSpinner message={null} />);

      expect(container.querySelector('.spinner-message')).not.toBeInTheDocument();
    });
  });

  // =====================================================
  // Fullscreen Mode
  // =====================================================
  describe('Fullscreen Mode', () => {
    test('hat fullscreen Klasse wenn fullscreen=true', () => {
      const { container } = render(<LoadingSpinner fullscreen={true} />);

      expect(container.querySelector('.loading-spinner-fullscreen')).toBeInTheDocument();
      expect(container.querySelector('.loading-spinner-inline')).not.toBeInTheDocument();
    });

    test('hat inline Klasse wenn fullscreen=false', () => {
      const { container } = render(<LoadingSpinner fullscreen={false} />);

      expect(container.querySelector('.loading-spinner-inline')).toBeInTheDocument();
      expect(container.querySelector('.loading-spinner-fullscreen')).not.toBeInTheDocument();
    });

    test('fullscreen mit custom Message', () => {
      const { container } = render(
        <LoadingSpinner fullscreen={true} message="Vollbild-Loading" />
      );

      expect(container.querySelector('.loading-spinner-fullscreen')).toBeInTheDocument();
      expect(screen.getByText('Vollbild-Loading')).toBeInTheDocument();
    });
  });

  // =====================================================
  // Props Combinations
  // =====================================================
  describe('Props Combinations', () => {
    test('fullscreen ohne Message', () => {
      const { container } = render(
        <LoadingSpinner fullscreen={true} message="" />
      );

      expect(container.querySelector('.loading-spinner-fullscreen')).toBeInTheDocument();
      expect(container.querySelector('.spinner-message')).not.toBeInTheDocument();
    });

    test('inline mit langer Message', () => {
      const longMessage = 'Dies ist eine sehr lange Nachricht die angezeigt werden soll';
      render(<LoadingSpinner message={longMessage} />);

      expect(screen.getByText(longMessage)).toBeInTheDocument();
    });
  });

  // =====================================================
  // Structure Tests
  // =====================================================
  describe('Component Structure', () => {
    test('hat korrekte DOM-Struktur', () => {
      const { container } = render(<LoadingSpinner />);

      // Outer container
      const outerDiv = container.firstChild;
      expect(outerDiv).toHaveClass('loading-spinner-inline');

      // Animation container
      const animationDiv = outerDiv.querySelector('.spinner-animation');
      expect(animationDiv).toBeInTheDocument();

      // Message paragraph
      const messageParagraph = outerDiv.querySelector('.spinner-message');
      expect(messageParagraph).toBeInTheDocument();
    });
  });
});
