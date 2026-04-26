import { useState } from 'react';
import { Zap, ChevronDown, ChevronUp, Cpu, Binary, Globe, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

type Section = 'llm' | 'embeddings' | 'documents' | 'http';

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="bg-muted/30 border border-border rounded p-3 font-mono text-xs overflow-x-auto whitespace-pre">
      {children}
    </pre>
  );
}

function CredentialRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-3 py-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <code className="text-xs font-mono font-medium text-foreground bg-muted/50 px-1.5 py-0.5 rounded">
        {value}
      </code>
    </div>
  );
}

function SectionButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 px-3 py-2 text-xs rounded-md transition-colors',
        active
          ? 'bg-muted text-foreground font-semibold'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
      )}
    >
      {icon}
      <span className="text-nowrap">{label}</span>
    </button>
  );
}

export function N8nIntegrationGuide() {
  const [open, setOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<Section>('llm');

  return (
    <div className="border-t border-border pt-6 mt-2">
      {/* Header — always visible */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-start justify-between gap-4 group text-left"
      >
        <div className="flex items-start gap-3">
          <Zap className="size-5 text-primary shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
              n8n KI-Integration
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              So nutzt du die lokalen KI-Services in deinen n8n-Workflows
            </p>
          </div>
        </div>
        <div className="shrink-0 text-muted-foreground group-hover:text-foreground transition-colors mt-0.5">
          {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </div>
      </button>

      {/* Collapsible content */}
      {open && (
        <div className="mt-5 space-y-5 animate-in fade-in">
          {/* Section tabs */}
          <div className="flex gap-1 overflow-x-auto scrollbar-none">
            <SectionButton
              active={activeSection === 'llm'}
              icon={<Cpu className="size-3.5" />}
              label="Arasul LLM Node"
              onClick={() => setActiveSection('llm')}
            />
            <SectionButton
              active={activeSection === 'embeddings'}
              icon={<Binary className="size-3.5" />}
              label="Arasul Embeddings Node"
              onClick={() => setActiveSection('embeddings')}
            />
            <SectionButton
              active={activeSection === 'documents'}
              icon={<FileText className="size-3.5" />}
              label="Arasul Documents Node"
              onClick={() => setActiveSection('documents')}
            />
            <SectionButton
              active={activeSection === 'http'}
              icon={<Globe className="size-3.5" />}
              label="HTTP Request (Direkt)"
              onClick={() => setActiveSection('http')}
            />
          </div>

          {/* Section A: Arasul LLM Node */}
          {activeSection === 'llm' && (
            <div className="space-y-4">
              <div className="border-l-2 border-primary/30 pl-4">
                <p className="text-xs text-muted-foreground">
                  Der <strong className="text-foreground">Arasul LLM</strong> Node ist in n8n
                  vorinstalliert und bietet direkten Zugriff auf das lokale KI-Modell. Dies ist der
                  einfachste Weg, KI in deine Workflows einzubauen.
                </p>
              </div>

              {/* Credentials */}
              <div>
                <h4 className="text-xs font-semibold text-foreground mb-2">
                  1. Credentials einrichten
                </h4>
                <p className="text-xs text-muted-foreground mb-2">
                  Erstelle in n8n unter{' '}
                  <strong>Settings &gt; Credentials &gt; Add Credential</strong> eine neue{' '}
                  <strong>Arasul LLM API</strong> Credential mit diesen Werten:
                </p>
                <div className="border border-border/50 rounded-lg divide-y divide-border/50">
                  <CredentialRow label="Host" value="llm-service" />
                  <CredentialRow label="Port" value="11434" />
                  <CredentialRow label="Use HTTPS" value="Aus" />
                  <CredentialRow label="API Key" value="(leer lassen)" />
                </div>
              </div>

              {/* Node config */}
              <div>
                <h4 className="text-xs font-semibold text-foreground mb-2">
                  2. Node konfigurieren
                </h4>
                <p className="text-xs text-muted-foreground mb-2">
                  Füge den <strong>Arasul LLM</strong> Node zu deinem Workflow hinzu. Verfügbare
                  Ressourcen und Parameter:
                </p>
                <div className="space-y-2">
                  <div className="border border-border/50 rounded-lg p-3 space-y-2">
                    <span className="text-xs font-semibold text-foreground">
                      Resource: Chat &gt; Send Message
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Model Name</span>
                        <span className="font-mono text-foreground">gemma4:26b-q4</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Temperature</span>
                        <span className="font-mono text-foreground">0.7</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Max Tokens</span>
                        <span className="font-mono text-foreground">2048</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">System Prompt</span>
                        <span className="text-foreground italic">optional</span>
                      </div>
                    </div>
                  </div>

                  <div className="border border-border/50 rounded-lg p-3 space-y-2">
                    <span className="text-xs font-semibold text-foreground">
                      Resource: Generate &gt; Generate Completion
                    </span>
                    <p className="text-xs text-muted-foreground">
                      Für einfache Textvervollständigung ohne Chat-Format. Parameter: Model, Prompt,
                      Stream.
                    </p>
                  </div>

                  <div className="border border-border/50 rounded-lg p-3 space-y-2">
                    <span className="text-xs font-semibold text-foreground">
                      Resource: Model &gt; List Models / Show Model Info
                    </span>
                    <p className="text-xs text-muted-foreground">
                      Listet verfügbare Modelle auf oder zeigt Details zu einem bestimmten Modell.
                    </p>
                  </div>
                </div>
              </div>

              {/* Example output */}
              <div>
                <h4 className="text-xs font-semibold text-foreground mb-2">3. Beispiel-Ausgabe</h4>
                <CodeBlock>
                  {`{
  "model": "gemma4:26b-q4",
  "message": {
    "role": "assistant",
    "content": "Die Antwort des KI-Modells..."
  },
  "done": true,
  "total_duration": 2841000000,
  "eval_count": 128
}`}
                </CodeBlock>
              </div>
            </div>
          )}

          {/* Section B: Arasul Embeddings Node */}
          {activeSection === 'embeddings' && (
            <div className="space-y-4">
              <div className="border-l-2 border-primary/30 pl-4">
                <p className="text-xs text-muted-foreground">
                  Der <strong className="text-foreground">Arasul Embeddings</strong> Node erzeugt
                  Vektoren aus Text — nützlich für semantische Suche, Ähnlichkeitsvergleiche oder
                  eigene RAG-Pipelines in n8n.
                </p>
              </div>

              {/* Credentials */}
              <div>
                <h4 className="text-xs font-semibold text-foreground mb-2">
                  1. Credentials einrichten
                </h4>
                <p className="text-xs text-muted-foreground mb-2">
                  Erstelle eine <strong>Arasul Embeddings API</strong> Credential:
                </p>
                <div className="border border-border/50 rounded-lg divide-y divide-border/50">
                  <CredentialRow label="Host" value="embedding-service" />
                  <CredentialRow label="Port" value="11435" />
                  <CredentialRow label="Use HTTPS" value="Aus" />
                  <CredentialRow label="API Key" value="(leer lassen)" />
                </div>
              </div>

              {/* Operations */}
              <div>
                <h4 className="text-xs font-semibold text-foreground mb-2">2. Operationen</h4>
                <div className="space-y-2">
                  <div className="border border-border/50 rounded-lg p-3">
                    <span className="text-xs font-semibold text-foreground">
                      Generate Embedding
                    </span>
                    <p className="text-xs text-muted-foreground mt-1">
                      Erzeugt einen 1024-dimensionalen Vektor (BGE-M3 Modell) für einen einzelnen
                      Text.
                    </p>
                  </div>
                  <div className="border border-border/50 rounded-lg p-3">
                    <span className="text-xs font-semibold text-foreground">Batch Generate</span>
                    <p className="text-xs text-muted-foreground mt-1">
                      Erzeugt Vektoren für mehrere Texte gleichzeitig (max. 500 pro Anfrage).
                    </p>
                  </div>
                  <div className="border border-border/50 rounded-lg p-3">
                    <span className="text-xs font-semibold text-foreground">Get Model Info</span>
                    <p className="text-xs text-muted-foreground mt-1">
                      Gibt Informationen zum Embedding-Modell zurück (Modellname, Vektordimension,
                      GPU-Status).
                    </p>
                  </div>
                </div>
              </div>

              {/* Example output */}
              <div>
                <h4 className="text-xs font-semibold text-foreground mb-2">3. Beispiel-Ausgabe</h4>
                <CodeBlock>
                  {`{
  "vectors": [[0.0234, -0.0891, 0.0412, ...]],
  "dimension": 1024,
  "count": 1,
  "latency_ms": 45
}`}
                </CodeBlock>
              </div>
            </div>
          )}

          {/* Section C: Arasul Documents Node */}
          {activeSection === 'documents' && (
            <div className="space-y-4">
              <div className="border-l-2 border-primary/30 pl-4">
                <p className="text-xs text-muted-foreground">
                  Der <strong className="text-foreground">Arasul Documents</strong> Node extrahiert
                  Text aus Dokumenten (PDF, DOCX, Bilder mit OCR) und kann sie optional per KI
                  analysieren. Ideal für Rechnungsverarbeitung, E-Mail-Anhänge und
                  Formularextraktion.
                </p>
              </div>

              {/* Credentials */}
              <div>
                <h4 className="text-xs font-semibold text-foreground mb-2">
                  1. Credentials einrichten
                </h4>
                <p className="text-xs text-muted-foreground mb-2">
                  Erstelle eine <strong>Arasul Documents API</strong> Credential. Du benötigst einen
                  API-Key (erstellen unter <strong>Sicherheit &gt; API-Keys</strong>):
                </p>
                <div className="border border-border/50 rounded-lg divide-y divide-border/50">
                  <CredentialRow
                    label="API Base URL"
                    value="http://dashboard-backend:3001/api/v1/external"
                  />
                  <CredentialRow label="API Key" value="aras_DEIN_API_KEY" />
                </div>
              </div>

              {/* Operations */}
              <div>
                <h4 className="text-xs font-semibold text-foreground mb-2">2. Operationen</h4>
                <div className="space-y-2">
                  <div className="border border-border/50 rounded-lg p-3 space-y-2">
                    <span className="text-xs font-semibold text-foreground">Extract Text</span>
                    <p className="text-xs text-muted-foreground">
                      Extrahiert Text aus einem Dokument. Nutzt automatisch OCR für Bilder und
                      gescannte PDFs. Unterstützt: PDF, DOCX, TXT, MD, PNG, JPG, TIFF, BMP.
                    </p>
                  </div>
                  <div className="border border-border/50 rounded-lg p-3 space-y-2">
                    <span className="text-xs font-semibold text-foreground">Analyze</span>
                    <p className="text-xs text-muted-foreground">
                      Extrahiert Text und analysiert ihn mit dem KI-Modell. Gib einen Prompt ein
                      (z.B. &quot;Fasse zusammen&quot;) oder lass das Feld leer für eine
                      automatische Zusammenfassung.
                    </p>
                  </div>
                  <div className="border border-border/50 rounded-lg p-3 space-y-2">
                    <span className="text-xs font-semibold text-foreground">
                      Extract Structured
                    </span>
                    <p className="text-xs text-muted-foreground">
                      Extrahiert strukturierte JSON-Daten nach einem Schema. Perfekt für Rechnungen,
                      Formulare und Bestellungen. Gib ein JSON-Schema vor und erhalte strukturierte
                      Daten zurück.
                    </p>
                  </div>
                </div>
              </div>

              {/* Invoice example */}
              <div>
                <h4 className="text-xs font-semibold text-foreground mb-2">
                  3. Beispiel: Rechnungsverarbeitung
                </h4>
                <p className="text-xs text-muted-foreground mb-2">
                  Workflow: <strong>E-Mail empfangen</strong> &rarr;{' '}
                  <strong>Arasul Documents (Extract Structured)</strong> &rarr;{' '}
                  <strong>Datentabelle/ERP</strong>
                </p>
                <p className="text-xs text-muted-foreground mb-2">Schema-Beispiel:</p>
                <CodeBlock>
                  {`{
  "invoice_number": "",
  "date": "",
  "vendor": "",
  "total_gross": 0,
  "total_net": 0,
  "tax_rate": 0,
  "items": [
    { "description": "", "quantity": 0, "unit_price": 0 }
  ]
}`}
                </CodeBlock>
              </div>

              {/* Example output */}
              <div>
                <h4 className="text-xs font-semibold text-foreground mb-2">4. Beispiel-Ausgabe</h4>
                <CodeBlock>
                  {`{
  "success": true,
  "data": {
    "invoice_number": "RE-2026-0412",
    "date": "2026-04-01",
    "vendor": "Muster GmbH",
    "total_gross": 1190.00,
    "total_net": 1000.00,
    "tax_rate": 19,
    "items": [
      { "description": "Beratung April", "quantity": 10, "unit_price": 100 }
    ]
  },
  "filename": "rechnung_april.pdf",
  "processing_time_ms": 4521
}`}
                </CodeBlock>
              </div>
            </div>
          )}

          {/* Section D: HTTP Request (Direct API) */}
          {activeSection === 'http' && (
            <div className="space-y-4">
              <div className="border-l-2 border-primary/30 pl-4">
                <p className="text-xs text-muted-foreground">
                  Für maximale Flexibilität kannst du die APIs auch direkt per{' '}
                  <strong className="text-foreground">HTTP Request</strong> Node ansprechen. Alle
                  Services sind intern über das Docker-Netzwerk erreichbar.
                </p>
              </div>

              {/* Service overview */}
              <div>
                <h4 className="text-xs font-semibold text-foreground mb-2">
                  Interne Service-Adressen
                </h4>
                <div className="border border-border/50 rounded-lg divide-y divide-border/50">
                  <div className="flex items-center justify-between px-3 py-2">
                    <span className="text-xs text-muted-foreground">Ollama (LLM)</span>
                    <code className="text-xs font-mono text-foreground">
                      http://llm-service:11434
                    </code>
                  </div>
                  <div className="flex items-center justify-between px-3 py-2">
                    <span className="text-xs text-muted-foreground">Embeddings</span>
                    <code className="text-xs font-mono text-foreground">
                      http://embedding-service:11435
                    </code>
                  </div>
                  <div className="flex items-center justify-between px-3 py-2">
                    <span className="text-xs text-muted-foreground">Qdrant (Vektoren)</span>
                    <code className="text-xs font-mono text-foreground">http://qdrant:6333</code>
                  </div>
                  <div className="flex items-center justify-between px-3 py-2">
                    <span className="text-xs text-muted-foreground">Dashboard API</span>
                    <code className="text-xs font-mono text-foreground">
                      http://dashboard-backend:3001
                    </code>
                  </div>
                </div>
              </div>

              {/* Ollama Chat */}
              <div>
                <h4 className="text-xs font-semibold text-foreground mb-2">Ollama Chat-Anfrage</h4>
                <p className="text-xs text-muted-foreground mb-2">
                  HTTP Request Node: <strong>POST</strong>{' '}
                  <code className="font-mono bg-muted/50 px-1 py-0.5 rounded">
                    http://llm-service:11434/api/chat
                  </code>
                </p>
                <CodeBlock>
                  {`{
  "model": "gemma4:26b-q4",
  "messages": [
    { "role": "system", "content": "Du bist ein hilfreicher Assistent." },
    { "role": "user", "content": "{{ $json.message }}" }
  ],
  "stream": false,
  "options": {
    "temperature": 0.7,
    "num_predict": 2048
  }
}`}
                </CodeBlock>
              </div>

              {/* External API with RAG */}
              <div>
                <h4 className="text-xs font-semibold text-foreground mb-2">
                  External API (mit Dokumentensuche)
                </h4>
                <p className="text-xs text-muted-foreground mb-2">
                  Nutzt die Dashboard-API mit integrierter RAG-Pipeline. Benötigt einen API-Key
                  (erstellen unter <strong>Sicherheit &gt; API-Keys</strong>).
                </p>
                <p className="text-xs text-muted-foreground mb-2">
                  HTTP Request Node: <strong>POST</strong>{' '}
                  <code className="font-mono bg-muted/50 px-1 py-0.5 rounded">
                    http://dashboard-backend:3001/api/v1/external/llm/chat
                  </code>
                </p>
                <p className="text-xs text-muted-foreground mb-2">
                  Header:{' '}
                  <code className="font-mono bg-muted/50 px-1 py-0.5 rounded">
                    X-API-Key: aras_DEIN_API_KEY
                  </code>
                </p>
                <CodeBlock>
                  {`{
  "prompt": "{{ $json.frage }}",
  "model": "gemma4:26b-q4",
  "temperature": 0.7,
  "max_tokens": 2048,
  "wait_for_result": true,
  "timeout_seconds": 300
}`}
                </CodeBlock>
              </div>

              {/* Embedding API */}
              <div>
                <h4 className="text-xs font-semibold text-foreground mb-2">Embedding-Anfrage</h4>
                <p className="text-xs text-muted-foreground mb-2">
                  HTTP Request Node: <strong>POST</strong>{' '}
                  <code className="font-mono bg-muted/50 px-1 py-0.5 rounded">
                    http://embedding-service:11435/embed
                  </code>
                </p>
                <CodeBlock>
                  {`{
  "texts": ["Dein Text für die Vektorisierung"]
}`}
                </CodeBlock>
              </div>

              {/* Qdrant search */}
              <div>
                <h4 className="text-xs font-semibold text-foreground mb-2">Qdrant Vektor-Suche</h4>
                <p className="text-xs text-muted-foreground mb-2">
                  Suche in indexierten Dokumenten per Vektor. Kombiniere mit dem Embedding-Endpunkt
                  für eine eigene Suchpipeline.
                </p>
                <p className="text-xs text-muted-foreground mb-2">
                  HTTP Request Node: <strong>POST</strong>{' '}
                  <code className="font-mono bg-muted/50 px-1 py-0.5 rounded">
                    http://qdrant:6333/collections/documents/points/search
                  </code>
                </p>
                <CodeBlock>
                  {`{
  "vector": {
    "name": "dense",
    "vector": [0.0234, -0.0891, 0.0412, ...]
  },
  "limit": 5,
  "with_payload": true
}`}
                </CodeBlock>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
