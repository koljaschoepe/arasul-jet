import React, { type ReactNode } from 'react';
import { Inbox } from 'lucide-react';

interface EmptyStateProps {
  icon?: ReactNode;
  title?: string;
  description?: string;
  action?: ReactNode;
}

function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div
      className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground"
      role="status"
    >
      <div className="text-5xl mb-4 opacity-50">{icon || <Inbox className="size-12" />}</div>
      {title && <div className="text-xl font-semibold text-secondary-foreground mb-2">{title}</div>}
      {description && <div className="text-sm max-w-96">{description}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export default EmptyState;
