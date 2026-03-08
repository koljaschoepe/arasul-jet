import { memo } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import ExcelEditor from '../datentabellen/ExcelEditor';

const VALID_SLUG = /^[a-zA-Z0-9_-]+$/;

const DatabaseTable = memo(function DatabaseTable() {
  const { slug } = useParams();
  const navigate = useNavigate();

  if (!slug || !VALID_SLUG.test(slug)) {
    return <Navigate to="/database" replace />;
  }

  const handleClose = () => {
    navigate('/database');
  };

  return <ExcelEditor tableSlug={slug} onClose={handleClose} />;
});

export default DatabaseTable;
