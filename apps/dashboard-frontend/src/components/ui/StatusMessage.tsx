import { Check, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/shadcn/alert';

export interface StatusMessageData {
  type: 'success' | 'error';
  text: string;
}

interface StatusMessageProps {
  /** Pass `null` or `undefined` to render nothing. */
  message: StatusMessageData | null | undefined;
  /** Optional className applied to the wrapping <Alert>. */
  className?: string;
}

/**
 * StatusMessage — Compact success/error banner used in forms and
 * settings sections. Wraps shadcn `<Alert>` with the success/error icon
 * and `{ type, text }` shape that's repeated across the app.
 *
 * Renders nothing when `message` is null/undefined so callers can place
 * it unconditionally:
 *
 *   <StatusMessage message={mySaveMessage} />
 */
export default function StatusMessage({ message, className }: StatusMessageProps) {
  if (!message) return null;
  return (
    <Alert variant={message.type === 'error' ? 'destructive' : 'default'} className={className}>
      {message.type === 'success' ? (
        <Check className="size-4" />
      ) : (
        <AlertCircle className="size-4" />
      )}
      <AlertDescription>{message.text}</AlertDescription>
    </Alert>
  );
}
