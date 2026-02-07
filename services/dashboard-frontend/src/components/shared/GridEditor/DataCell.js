/**
 * DataCell - Display cell with click-to-edit
 * Shared cell display component for Datentabellen
 */

import React, { memo } from 'react';
import { formatValue } from './FieldTypes';

const DataCell = memo(function DataCell({ value, field, onEdit, readOnly = false }) {
    const fieldType = field.field_type || field.type;

    // Determine cell class based on field type
    const getCellClass = () => {
        const baseClass = 'grid-cell-value';
        switch (fieldType) {
            case 'checkbox':
                return `${baseClass} ${value ? 'grid-cell-check' : 'grid-cell-uncheck'}`;
            case 'email':
                return `${baseClass} grid-cell-email`;
            case 'url':
                return `${baseClass} grid-cell-url`;
            case 'phone':
                return `${baseClass} grid-cell-phone`;
            case 'currency':
                return `${baseClass} grid-cell-currency`;
            case 'number':
                return `${baseClass} grid-cell-number`;
            default:
                return baseClass;
        }
    };

    // Render special content for certain types
    const renderContent = () => {
        const formatted = formatValue(value, fieldType, {
            currency: field.currency || 'EUR'
        });

        if (value && fieldType === 'email') {
            return (
                <span className="grid-cell-with-icon">
                    <span className="grid-cell-icon">✉</span>
                    {formatted}
                </span>
            );
        }

        if (value && fieldType === 'url') {
            return (
                <span className="grid-cell-with-icon">
                    <span className="grid-cell-icon">🔗</span>
                    <span className="grid-cell-link">{formatted}</span>
                </span>
            );
        }

        if (value && fieldType === 'phone') {
            return (
                <span className="grid-cell-with-icon">
                    <span className="grid-cell-icon">📞</span>
                    {formatted}
                </span>
            );
        }

        return formatted;
    };

    const handleClick = () => {
        if (!readOnly && onEdit) {
            onEdit();
        }
    };

    return (
        <div
            className={`grid-cell ${readOnly ? 'grid-cell-readonly' : ''}`}
            onClick={handleClick}
            title={readOnly ? '' : 'Klicken zum Bearbeiten'}
        >
            <span className={getCellClass()}>
                {renderContent()}
            </span>
        </div>
    );
});

export default DataCell;
