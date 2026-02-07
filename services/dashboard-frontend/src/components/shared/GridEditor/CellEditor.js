/**
 * CellEditor - Inline cell editor component
 * Shared cell editor component for Datentabellen
 */

import React, { useState, useEffect, useRef, memo } from 'react';
import { validateValue } from './FieldTypes';

const CellEditor = memo(function CellEditor({ value, field, onSave, onCancel }) {
    const [editValue, setEditValue] = useState(value ?? '');
    const [validationError, setValidationError] = useState(null);
    const inputRef = useRef(null);

    useEffect(() => {
        if (inputRef.current) {
            inputRef.current.focus();
            if (inputRef.current.select) {
                inputRef.current.select();
            }
        }
    }, []);

    const handleSave = (val) => {
        const fieldType = field.field_type || field.type;
        const error = validateValue(val, fieldType);
        if (error) {
            setValidationError(error);
            return;
        }
        setValidationError(null);
        onSave(val);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSave(editValue);
        } else if (e.key === 'Escape') {
            onCancel();
        }
    };

    const fieldType = field.field_type || field.type;

    const renderInput = () => {
        switch (fieldType) {
            case 'textarea':
                return (
                    <textarea
                        ref={inputRef}
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                        onBlur={() => handleSave(editValue)}
                        className="grid-cell-editor grid-cell-editor-textarea"
                        rows={3}
                    />
                );
            case 'number':
            case 'currency':
                return (
                    <input
                        ref={inputRef}
                        type="number"
                        step={fieldType === 'currency' ? '0.01' : 'any'}
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                        onBlur={() => handleSave(editValue)}
                        className="grid-cell-editor"
                    />
                );
            case 'date':
                return (
                    <input
                        ref={inputRef}
                        type="date"
                        value={editValue ? editValue.split('T')[0] : ''}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                        onBlur={() => handleSave(editValue)}
                        className="grid-cell-editor"
                    />
                );
            case 'datetime':
                return (
                    <input
                        ref={inputRef}
                        type="datetime-local"
                        value={editValue ? editValue.slice(0, 16) : ''}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                        onBlur={() => handleSave(editValue)}
                        className="grid-cell-editor"
                    />
                );
            case 'checkbox':
                return (
                    <input
                        ref={inputRef}
                        type="checkbox"
                        checked={editValue === true || editValue === 'true'}
                        onChange={(e) => {
                            setEditValue(e.target.checked);
                            onSave(e.target.checked);
                        }}
                        className="grid-cell-editor-checkbox"
                    />
                );
            case 'select': {
                // Parse options from field.options
                const options = field.options?.choices || field.options || [];
                return (
                    <select
                        ref={inputRef}
                        value={editValue}
                        onChange={(e) => {
                            setEditValue(e.target.value);
                            onSave(e.target.value);
                        }}
                        onBlur={() => handleSave(editValue)}
                        onKeyDown={handleKeyDown}
                        className="grid-cell-editor grid-cell-editor-select"
                    >
                        <option value="">-- Auswählen --</option>
                        {options.map((opt, idx) => (
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
                        ref={inputRef}
                        type="email"
                        value={editValue}
                        onChange={(e) => {
                            setEditValue(e.target.value);
                            setValidationError(null);
                        }}
                        onKeyDown={handleKeyDown}
                        onBlur={() => handleSave(editValue)}
                        className={`grid-cell-editor ${validationError ? 'grid-cell-editor-invalid' : ''}`}
                        placeholder="name@beispiel.de"
                    />
                );
            case 'url':
                return (
                    <input
                        ref={inputRef}
                        type="url"
                        value={editValue}
                        onChange={(e) => {
                            setEditValue(e.target.value);
                            setValidationError(null);
                        }}
                        onKeyDown={handleKeyDown}
                        onBlur={() => handleSave(editValue)}
                        className={`grid-cell-editor ${validationError ? 'grid-cell-editor-invalid' : ''}`}
                        placeholder="https://..."
                    />
                );
            case 'phone':
                return (
                    <input
                        ref={inputRef}
                        type="tel"
                        value={editValue}
                        onChange={(e) => {
                            setEditValue(e.target.value);
                            setValidationError(null);
                        }}
                        onKeyDown={handleKeyDown}
                        onBlur={() => handleSave(editValue)}
                        className={`grid-cell-editor ${validationError ? 'grid-cell-editor-invalid' : ''}`}
                        placeholder="+49 123 456789"
                    />
                );
            default:
                return (
                    <input
                        ref={inputRef}
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                        onBlur={() => handleSave(editValue)}
                        className="grid-cell-editor"
                    />
                );
        }
    };

    return (
        <div className="grid-cell-editor-wrapper">
            {renderInput()}
            {validationError && (
                <div className="grid-cell-editor-error">
                    {validationError}
                </div>
            )}
        </div>
    );
});

export default CellEditor;
