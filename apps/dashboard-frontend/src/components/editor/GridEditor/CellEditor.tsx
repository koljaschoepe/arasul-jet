import React, { useState, useEffect, useRef, memo } from 'react';
import { validateValue } from './FieldTypes';

interface FieldOption {
  value: string;
  label: string;
}

interface FieldDefinition {
  field_type?: string;
  type?: string;
  options?: { choices?: (string | FieldOption)[] } | (string | FieldOption)[];
}

type CellValue = string | number | boolean | null;

interface CellEditorProps {
  value: CellValue;
  field: FieldDefinition;
  onSave: (value: CellValue, direction?: 'prev' | 'next') => void;
  onCancel: () => void;
  validate?: boolean;
  classPrefix?: string;
}

const CellEditor = memo(function CellEditor({
  value,
  field,
  onSave,
  onCancel,
  validate = true,
  classPrefix = 'grid',
}: CellEditorProps) {
  const [editValue, setEditValue] = useState<CellValue>(value ?? '');
  const [validationError, setValidationError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(null);

  const cls = `${classPrefix}-cell-editor`;

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      if ('select' in inputRef.current && typeof inputRef.current.select === 'function') {
        (inputRef.current as HTMLInputElement).select();
      }
    }
  }, []);

  const handleSave = (val: CellValue, direction?: 'prev' | 'next') => {
    if (validate) {
      const fieldType = field.field_type || field.type;
      const error = validateValue(val, fieldType || 'text');
      if (error) {
        setValidationError(error);
        return;
      }
      setValidationError(null);
    }
    onSave(val, direction);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSave(editValue);
    } else if (e.key === 'Escape') {
      onCancel();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      handleSave(editValue, e.shiftKey ? 'prev' : 'next');
    }
  };

  const fieldType = field.field_type || field.type;

  const renderInput = () => {
    switch (fieldType) {
      case 'textarea':
        return (
          <textarea
            ref={inputRef as React.RefObject<HTMLTextAreaElement>}
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => handleSave(editValue)}
            className={`${cls} ${cls}-textarea`}
            rows={3}
          />
        );
      case 'number':
      case 'currency':
        return (
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            type="number"
            step={fieldType === 'currency' ? '0.01' : 'any'}
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => handleSave(editValue)}
            className={cls}
          />
        );
      case 'date':
        return (
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            type="date"
            value={editValue ? String(editValue).split('T')[0] : ''}
            onChange={e => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => handleSave(editValue)}
            className={cls}
          />
        );
      case 'datetime':
        return (
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            type="datetime-local"
            value={editValue ? String(editValue).slice(0, 16) : ''}
            onChange={e => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => handleSave(editValue)}
            className={cls}
          />
        );
      case 'checkbox':
        return (
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            type="checkbox"
            checked={editValue === true || editValue === 'true'}
            onChange={e => {
              setEditValue(e.target.checked);
              onSave(e.target.checked);
            }}
            className={`${cls}-checkbox`}
          />
        );
      case 'select': {
        const rawOptions = field.options;
        const options: (string | FieldOption)[] = Array.isArray(rawOptions)
          ? rawOptions
          : (rawOptions && 'choices' in rawOptions ? rawOptions.choices : undefined) || [];
        return (
          <select
            ref={inputRef as React.RefObject<HTMLSelectElement>}
            value={editValue}
            onChange={e => {
              setEditValue(e.target.value);
              onSave(e.target.value);
            }}
            onBlur={() => handleSave(editValue)}
            onKeyDown={handleKeyDown}
            className={`${cls} ${cls}-select`}
          >
            <option value="">-- Auswählen --</option>
            {options.map((opt: string | FieldOption, idx: number) => (
              <option key={idx} value={typeof opt === 'string' ? opt : opt.value}>
                {typeof opt === 'string' ? opt : opt.label}
              </option>
            ))}
          </select>
        );
      }
      case 'email':
        return (
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            type="email"
            value={editValue}
            onChange={e => {
              setEditValue(e.target.value);
              setValidationError(null);
            }}
            onKeyDown={handleKeyDown}
            onBlur={() => handleSave(editValue)}
            className={`${cls} ${validationError ? `${cls}-invalid` : ''}`}
            placeholder="name@beispiel.de"
          />
        );
      case 'url':
        return (
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            type="url"
            value={editValue}
            onChange={e => {
              setEditValue(e.target.value);
              setValidationError(null);
            }}
            onKeyDown={handleKeyDown}
            onBlur={() => handleSave(editValue)}
            className={`${cls} ${validationError ? `${cls}-invalid` : ''}`}
            placeholder="https://..."
          />
        );
      case 'phone':
        return (
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            type="tel"
            value={editValue}
            onChange={e => {
              setEditValue(e.target.value);
              setValidationError(null);
            }}
            onKeyDown={handleKeyDown}
            onBlur={() => handleSave(editValue)}
            className={`${cls} ${validationError ? `${cls}-invalid` : ''}`}
            placeholder="+49 123 456789"
          />
        );
      default:
        return (
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            type="text"
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => handleSave(editValue)}
            className={cls}
          />
        );
    }
  };

  return (
    <div className={`${cls}-wrapper`}>
      {renderInput()}
      {validate && validationError && <div className={`${cls}-error`}>{validationError}</div>}
    </div>
  );
});

export default CellEditor;
