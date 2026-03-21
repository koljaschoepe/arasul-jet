import { memo } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import ExcelEditor from '../datentabellen/ExcelEditor';

const VALID_SLUG = /^[a-zA-Z0-9_-]+$/;

const DatabaseTable = memo(function DatabaseTable() {
  const { slug } = useParams();

  if (!slug || !VALID_SLUG.test(slug)) {
    return <Navigate to="/database" replace />;
  }

  return <ExcelEditor tableSlug={slug} />;
});

export default DatabaseTable;
