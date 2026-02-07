/**
 * DatabaseTable - View and edit data in a single dynamic table
 * Uses the new ExcelEditor for a fullscreen editing experience
 * Part of the Datentabellen feature
 */

import React, { memo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ExcelEditor from './ExcelEditor';

/**
 * DatabaseTable - Wrapper that uses ExcelEditor for fullscreen editing
 */
const DatabaseTable = memo(function DatabaseTable() {
    const { slug } = useParams();
    const navigate = useNavigate();

    const handleClose = () => {
        navigate('/database');
    };

    return (
        <ExcelEditor
            tableSlug={slug}
            onClose={handleClose}
        />
    );
});

export default DatabaseTable;
