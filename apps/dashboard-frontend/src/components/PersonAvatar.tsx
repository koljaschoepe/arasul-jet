/**
 * Das Bild einer Person, und ohne Bild ihre Initialen (M5).
 *
 * `bild` ist die Adresse, nur gesetzt, wenn die Person eins hat: ohne Adresse
 * lädt der Browser nichts und die Initialen stehen sofort da.
 */
import { Avatar, AvatarFallback, AvatarImage, cn } from '@marken';

function initialen(name: string): string {
  const teile = name.trim().split(/\s+/).filter(Boolean);
  if (teile.length === 0) return '?';
  const erste = teile[0]?.charAt(0) ?? '';
  const letzte = teile.length > 1 ? (teile[teile.length - 1]?.charAt(0) ?? '') : '';
  return (erste + letzte).toUpperCase();
}

export function PersonAvatar({
  name,
  bild,
  className,
}: {
  name: string;
  bild?: string | null;
  className?: string;
}) {
  return (
    <Avatar className={cn('size-8', className)}>
      {bild && <AvatarImage src={bild} alt="" />}
      <AvatarFallback className="bg-muted text-ui-xs font-medium text-muted-foreground">
        {initialen(name)}
      </AvatarFallback>
    </Avatar>
  );
}
