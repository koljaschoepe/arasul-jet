/**
 * Automationen-Tab: bettet den n8n-Editor als same-origin-iframe ein
 * (Traefik routet /n8n auf derselben Origin; n8ns `X-Frame-Options:
 * sameorigin` erlaubt genau diese Konstellation). Der n8n-Login bleibt
 * bewusst n8n-eigen (einmalig, Cookie hält) — Lizenz-Kontext siehe
 * docs/legal/N8N_LIZENZ.md.
 */
export default function AutomationenTab() {
  return (
    <iframe
      src="/n8n/"
      title="Automationen (n8n)"
      className="h-full w-full border-0 bg-background"
      data-testid="n8n-frame"
    />
  );
}
