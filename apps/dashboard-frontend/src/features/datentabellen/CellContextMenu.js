/**
 * CellContextMenu - Right-click context menu for DataTable cells
 */

import React, { useEffect, useRef, memo } from 'react';
import { FiCopy, FiScissors, FiClipboard, FiTrash2, FiPlus } from 'react-icons/fi';

const CellContextMenu = memo(function CellContextMenu({
  position,
  onClose,
  onCopy,
  onPaste,
  onCut,
  onDelete,
  onInsertRowAbove,
  onInsertRowBelow,
  hasClipboard,
}) {
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = e => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
    };
    const handleEscape = e => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  return (
    <div className="dt-context-menu" ref={menuRef} style={{ top: position.y, left: position.x }}>
      <button type="button" className="dt-context-menu-item" onClick={onCopy}>
        <FiCopy /> Kopieren
        <span className="dt-context-shortcut">Strg+C</span>
      </button>
      <button type="button" className="dt-context-menu-item" onClick={onCut}>
        <FiScissors /> Ausschneiden
        <span className="dt-context-shortcut">Strg+X</span>
      </button>
      <button
        type="button"
        className="dt-context-menu-item"
        onClick={onPaste}
        disabled={!hasClipboard}
      >
        <FiClipboard /> Einfügen
        <span className="dt-context-shortcut">Strg+V</span>
      </button>
      <div className="dt-context-menu-divider" />
      <button type="button" className="dt-context-menu-item" onClick={onDelete}>
        <FiTrash2 /> Löschen
        <span className="dt-context-shortcut">Entf</span>
      </button>
      <div className="dt-context-menu-divider" />
      <button type="button" className="dt-context-menu-item" onClick={onInsertRowAbove}>
        <FiPlus /> Zeile oberhalb
      </button>
      <button type="button" className="dt-context-menu-item" onClick={onInsertRowBelow}>
        <FiPlus /> Zeile unterhalb
      </button>
    </div>
  );
});

export default CellContextMenu;
