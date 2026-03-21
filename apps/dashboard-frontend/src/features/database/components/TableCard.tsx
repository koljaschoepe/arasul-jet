import { memo } from 'react';
import { Link } from 'react-router-dom';
import { FileText, LayoutGrid } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/shadcn/card';
import { Badge } from '@/components/ui/shadcn/badge';

interface Table {
  id: number;
  name: string;
  slug: string;
  description?: string;
  icon: string;
  color: string;
  row_count?: number;
  field_count?: number;
  updated_at?: string;
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return 'Nie';
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  if (diff < 60000) return 'Gerade eben';
  if (diff < 3600000) return `vor ${Math.floor(diff / 60000)} Min.`;
  if (diff < 86400000) return `vor ${Math.floor(diff / 3600000)} Std.`;
  if (diff < 604800000) return `vor ${Math.floor(diff / 86400000)} Tagen`;

  return date.toLocaleDateString('de-DE');
}

const TableCard = memo(function TableCard({ table }: { table: Table }) {
  return (
    <Link to={`/database/${table.slug}`} className="no-underline text-inherit group">
      <Card className="py-4 gap-3 transition-all duration-150 hover:border-primary hover:-translate-y-0.5 hover:shadow-md">
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-start justify-between">
            <span className="text-2xl" style={{ color: table.color }}>
              {table.icon}
            </span>
            <span className="text-xs text-muted-foreground">{formatDate(table.updated_at)}</span>
          </div>

          <div>
            <h3 className="text-base font-semibold text-foreground m-0 mb-1 group-hover:text-primary transition-colors">
              {table.name}
            </h3>
            {table.description && (
              <p className="text-sm text-muted-foreground m-0 line-clamp-2">{table.description}</p>
            )}
          </div>

          <div className="flex gap-2">
            <Badge variant="secondary" className="gap-1 font-normal">
              <FileText className="size-3" /> {table.row_count || 0} Einträge
            </Badge>
            <Badge variant="secondary" className="gap-1 font-normal">
              <LayoutGrid className="size-3" /> {table.field_count || 0} Felder
            </Badge>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
});

export default TableCard;
