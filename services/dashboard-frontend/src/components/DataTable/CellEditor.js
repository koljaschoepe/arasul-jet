/**
 * CellEditor - Inline editor for a single DataTable cell
 */

import React, { useState, useEffect, useRef, memo } from 'react';

const CellEditor = memo(function CellEditor({ value, field, onSave, onCancel }) {
  const [editValue, setEditValue] = useState(value ?? '');
  const inputRef = useRef(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select?.();
    }
  }, []);

  const handleKeyDown = e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSave(editValue);
    } else if (e.key === 'Escape') {
      onCancel();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      onSave(editValue, e.shiftKey ? 'prev' : 'next');
    }
  };

  const handleBlur = () => {
    onSave(editValue);
  };

  switch (field.field_type) {
    case 'textarea':
      return (
        <textarea
          ref={inputRef}
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          className="dt-cell-editor"
          rows={3}
        />
      );
    case 'number':
    case 'currency':
      return (
        <input
          ref={inputRef}
          type="number"
          step={field.field_type === 'currency' ? '0.01' : 'any'}
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          className="dt-cell-editor"
        />
      );
    case 'date':
      return (
        <input
          ref={inputRef}
          type="date"
          value={editValue ? editValue.split('T')[0] : ''}
          onChange={e => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          className="dt-cell-editor"
        />
      );
    case 'checkbox':
      return (
        <input
          ref={inputRef}
          type="checkbox"
          checked={editValue === true || editValue === 'true'}
          onChange={e => {
            setEditValue(e.target.checked);
            onSave(e.target.checked);
          }}
          className="dt-cell-editor-checkbox"
        />
      );
    case 'select':
      const options = field.options?.choices || [];
      return (
        <select
          ref={inputRef}
          value={editValue}
          onChange={e => {
            setEditValue(e.target.value);
            onSave(e.target.value);
          }}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          className="dt-cell-editor"
        >
          <option value="">-- Auswählen --</option>
          {options.map(opt => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );
    default:
      return (
        <input
          ref={inputRef}
          type={
            field.field_type === 'email' ? 'email' : field.field_type === 'url' ? 'url' : 'text'
          }
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          className="dt-cell-editor"
        />
      );
  }
});

export default CellEditor;
