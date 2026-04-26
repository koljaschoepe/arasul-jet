import { memo } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Database } from 'lucide-react';

interface BreadcrumbProps {
  tableName: string;
}

const Breadcrumb = memo(function Breadcrumb({ tableName }: BreadcrumbProps) {
  return (
    <nav className="flex items-center gap-1.5 text-sm" aria-label="Breadcrumb">
      <Link
        to="/data"
        className="flex items-center gap-1.5 text-muted-foreground hover:text-primary transition-colors no-underline"
      >
        <Database className="size-4" />
        Daten
      </Link>
      <ChevronRight className="size-3.5 text-muted-foreground/60" />
      <span className="text-foreground font-medium">{tableName}</span>
    </nav>
  );
});

export default Breadcrumb;
