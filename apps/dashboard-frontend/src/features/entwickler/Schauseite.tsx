/**
 * Die Schauseite: jedes Primitiv der Bibliothek in allen seinen Zuständen.
 *
 * WOFÜR SIE DA IST. Eine Komponentenbibliothek hat ein Problem, das keine
 * Abnahme sonst findet: ein Baustein, den heute niemand benutzt, sieht in
 * einem der beiden Themes falsch aus, und es merkt erst der, der ihn in
 * einem halben Jahr zum ersten Mal einsetzt — auf der Seite eines Kunden.
 * Hier stehen sie alle nebeneinander, hell und dunkel, bei 390, 1024 und
 * 1440 px, und `scripts/test/schauseite.mjs` macht davon Bilder.
 *
 * UNTER EINEM ENTWICKLERPFAD und nicht im Menü: `/entwickler/bausteine`.
 * Ein Mitarbeiter hat hier nichts zu suchen, und ein Administrator auch
 * nicht — die Seite ist für den, der eine App baut. Sie hängt trotzdem
 * hinter der Anmeldung, denn sie steht auf einem Gerät im Firmennetz und
 * nicht auf einer Dokumentationsseite im Internet.
 *
 * KEIN THEME-SCHALTER DARAUF. Das Theme gehört seit H1 dem Menschen und
 * steht in `admin_users.theme`; ein zweiter Weg, es umzustellen, wäre eine
 * zweite Wahrheit. Wer die Seite dunkel sehen will, stellt sich dunkel.
 *
 * JEDER ZUSTAND IST EINE ZEILE, KEINE ERZÄHLUNG. Was hier steht, ist die
 * Liste der Varianten und Größen, die das Primitiv wirklich kennt — nicht
 * eine Auswahl der hübschen. Fällt eine Variante weg, fällt sie hier auf.
 */
import { useState } from 'react';
import {
  Bell,
  Check,
  ChevronDown,
  Info,
  Settings,
  Trash2,
  TriangleAlert,
  User,
} from 'lucide-react';
import {
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  AlertTitle,
  Avatar,
  AvatarFallback,
  AvatarImage,
  Badge,
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Checkbox,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
  Input,
  Kopf,
  Label,
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
  Progress,
  RadioGroup,
  RadioGroupItem,
  ScrollArea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  Skeleton,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  Toast,
  ToastClose,
  ToastIcon,
  ToastMessage,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@marken';
import { Schaustueck, Zustand } from './Schaustueck';

const KNOPF_ARTEN = [
  'default',
  'solid',
  'destructive',
  'outline',
  'secondary',
  'ghost',
  'link',
  'success',
  'warning',
  'outline-danger',
  'outline-success',
  'outline-warning',
] as const;

const KNOPF_GROESSEN = [
  'xs',
  'sm',
  'default',
  'lg',
  'icon',
  'icon-xs',
  'icon-sm',
  'icon-lg',
] as const;

const ABZEICHEN_ARTEN = [
  'default',
  'primary',
  'success',
  'warning',
  'destructive',
  'outline',
] as const;

const MELDUNGS_ARTEN = ['info', 'success', 'warning', 'error'] as const;

function Schauseite() {
  const [haken, setHaken] = useState(true);
  const [schalter, setSchalter] = useState(true);
  const [wahl, setWahl] = useState('b');

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-ui-2 p-ui-4">
      <Kopf
        titel="Bausteine"
        beschreibung="Jedes Primitiv aus @marken in allen seinen Zuständen. Diese Seite steht unter einem Entwicklerpfad und in keinem Menü."
      />

      <Schaustueck name="Button" satz="Zwölf Arten, acht Größen, dazu ladend und gesperrt.">
        {KNOPF_ARTEN.map(art => (
          <Zustand key={art} name={art}>
            <Button variant={art}>Knopf</Button>
          </Zustand>
        ))}
        {KNOPF_GROESSEN.map(groesse => (
          <Zustand key={groesse} name={groesse}>
            <Button size={groesse}>{groesse.startsWith('icon') ? <Settings /> : 'Knopf'}</Button>
          </Zustand>
        ))}
        <Zustand name="loading">
          <Button loading>Senden</Button>
        </Zustand>
        <Zustand name="disabled">
          <Button disabled>Knopf</Button>
        </Zustand>
        <Zustand name="mit Symbol">
          <Button variant="destructive">
            <Trash2 />
            Entfernen
          </Button>
        </Zustand>
      </Schaustueck>

      <Schaustueck name="Input" satz="Das Textfeld: leer, gefüllt, gesperrt, ungültig.">
        <Zustand name="placeholder">
          <Input placeholder="E-Mail" className="w-56" />
        </Zustand>
        <Zustand name="gefüllt">
          <Input defaultValue="mia@firma.de" className="w-56" />
        </Zustand>
        <Zustand name="disabled">
          <Input defaultValue="gesperrt" disabled className="w-56" />
        </Zustand>
        <Zustand name="aria-invalid">
          <Input defaultValue="keine Adresse" aria-invalid className="w-56" />
        </Zustand>
        <Zustand name="type=password">
          <Input type="password" defaultValue="geheim" className="w-56" />
        </Zustand>
      </Schaustueck>

      <Schaustueck name="Textarea" satz="Mehrere Zeilen — sonst dasselbe wie das Feld.">
        <Zustand name="placeholder">
          <Textarea placeholder="Begründung" className="w-72" />
        </Zustand>
        <Zustand name="gefüllt">
          <Textarea defaultValue={'Zwei Zeilen,\nund die zweite ist länger.'} className="w-72" />
        </Zustand>
        <Zustand name="disabled">
          <Textarea defaultValue="gesperrt" disabled className="w-72" />
        </Zustand>
      </Schaustueck>

      <Schaustueck
        name="Label"
        satz="Der Name eines Feldes. Klickt man ihn an, hat das Feld den Fokus."
      >
        <Zustand name="mit Feld">
          <div className="flex flex-col gap-1">
            <Label htmlFor="schau-name">Anzeigename</Label>
            <Input id="schau-name" defaultValue="Mia" className="w-56" />
          </div>
        </Zustand>
      </Schaustueck>

      <Schaustueck name="Select" satz="Eine Auswahl aus einer Liste, mit Tastatur bedienbar.">
        <Zustand name="mit Wert">
          <Select defaultValue="live">
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="live">Livestand</SelectItem>
              <SelectItem value="test">Teststand</SelectItem>
            </SelectContent>
          </Select>
        </Zustand>
        <Zustand name="placeholder">
          <Select>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Stand wählen" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="live">Livestand</SelectItem>
              <SelectItem value="test">Teststand</SelectItem>
            </SelectContent>
          </Select>
        </Zustand>
        <Zustand name="disabled">
          <Select disabled>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="gesperrt" />
            </SelectTrigger>
            <SelectContent />
          </Select>
        </Zustand>
      </Schaustueck>

      <Schaustueck name="Checkbox" satz="Wählt etwas aus. Gilt erst mit dem Absenden.">
        <Zustand name="checked">
          <Checkbox
            checked={haken}
            onCheckedChange={an => setHaken(an === true)}
            aria-label="Freigabe"
          />
        </Zustand>
        <Zustand name="unchecked">
          <Checkbox checked={false} aria-label="nicht freigegeben" />
        </Zustand>
        <Zustand name="indeterminate">
          <Checkbox checked="indeterminate" aria-label="teilweise" />
        </Zustand>
        <Zustand name="disabled">
          <Checkbox checked disabled aria-label="gesperrt" />
        </Zustand>
      </Schaustueck>

      <Schaustueck
        name="RadioGroup"
        satz="Eine aus mehreren. Anders als das Häkchen: hier gilt genau eine."
      >
        <Zustand name="drei Möglichkeiten">
          <RadioGroup value={wahl} onValueChange={setWahl} className="flex gap-4">
            {['a', 'b', 'c'].map(w => (
              <span key={w} className="flex items-center gap-2">
                <RadioGroupItem value={w} id={`schau-radio-${w}`} />
                <Label htmlFor={`schau-radio-${w}`}>Wahl {w.toUpperCase()}</Label>
              </span>
            ))}
          </RadioGroup>
        </Zustand>
        <Zustand name="disabled">
          <RadioGroup value="a" disabled className="flex gap-4">
            <RadioGroupItem value="a" aria-label="gesperrt" />
          </RadioGroup>
        </Zustand>
      </Schaustueck>

      <Schaustueck name="Switch" satz="Stellt etwas um, hier und jetzt — ohne Speichern-Knopf.">
        <Zustand name="an">
          <Switch checked={schalter} onCheckedChange={setSchalter} aria-label="Fernzugriff" />
        </Zustand>
        <Zustand name="aus">
          <Switch checked={false} aria-label="aus" />
        </Zustand>
        <Zustand name="disabled">
          <Switch checked disabled aria-label="gesperrt" />
        </Zustand>
      </Schaustueck>

      <Schaustueck
        name="Dialog"
        satz="Ein Fenster über der Seite. Escape schließt, ein Klick daneben auch."
      >
        <Zustand name="offen per Klick">
          <Dialog>
            <DialogTrigger asChild>
              <Button>Dialog öffnen</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Modell umstellen</DialogTitle>
                <DialogDescription>
                  Der Flow läuft ab dem nächsten Start mit dem neuen Modell.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter showCloseButton>
                <Button variant="solid">Übernehmen</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </Zustand>
      </Schaustueck>

      <Schaustueck
        name="AlertDialog"
        satz="Verlangt eine Antwort. Kein Kreuz, kein Wegklicken daneben."
      >
        <Zustand name="offen per Klick">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">App entfernen</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>App wirklich entfernen?</AlertDialogTitle>
                <AlertDialogDescription>
                  Container, Dateien und Freigaben verschwinden mit ihr.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                <AlertDialogAction>Entfernen</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </Zustand>
      </Schaustueck>

      <Schaustueck name="Sheet" satz="Dasselbe wie ein Dialog, nur von einer Kante her.">
        {(['right', 'left', 'top', 'bottom'] as const).map(seite => (
          <Zustand key={seite} name={seite}>
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline">{seite}</Button>
              </SheetTrigger>
              <SheetContent side={seite}>
                <SheetHeader>
                  <SheetTitle>Von {seite}</SheetTitle>
                  <SheetDescription>Ein Blatt für etwas Kurzes.</SheetDescription>
                </SheetHeader>
              </SheetContent>
            </Sheet>
          </Zustand>
        ))}
      </Schaustueck>

      <Schaustueck name="Popover" satz="Ein kleines Feld an einem Knopf, ohne Fokusfalle.">
        <Zustand name="offen per Klick">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost">
                <Info />
                Woher kommt die Zahl?
              </Button>
            </PopoverTrigger>
            <PopoverContent>
              <PopoverHeader>
                <PopoverTitle>KI-Speicher</PopoverTitle>
                <PopoverDescription>
                  Was das geladene Modell belegt, gemessen am Gerät.
                </PopoverDescription>
              </PopoverHeader>
            </PopoverContent>
          </Popover>
        </Zustand>
      </Schaustueck>

      <Schaustueck name="Tooltip" satz="Ergänzt ein Bild. Ersetzt nie einen Namen.">
        <Zustand name="beim Verweilen">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" aria-label="Einstellungen">
                <Settings />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Einstellungen</TooltipContent>
          </Tooltip>
        </Zustand>
      </Schaustueck>

      <Schaustueck name="DropdownMenu" satz="Das Menü an einem Knopf.">
        <Zustand name="offen per Klick">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                Aktionen
                <ChevronDown />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>Stand</DropdownMenuLabel>
              <DropdownMenuItem>
                Live schalten
                <DropdownMenuShortcut>⌘L</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuCheckboxItem checked>Logs anzeigen</DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive">Entfernen</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </Zustand>
      </Schaustueck>

      <Schaustueck name="ContextMenu" satz="Dasselbe Menü, ausgelöst mit der rechten Maustaste.">
        <Zustand name="rechte Maustaste">
          <ContextMenu>
            <ContextMenuTrigger className="rounded-md border border-border px-4 py-2 text-ui-sm">
              Hier rechts klicken
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuLabel>Tab</ContextMenuLabel>
              <ContextMenuItem>Schließen</ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem variant="destructive">Alle schließen</ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        </Zustand>
      </Schaustueck>

      <Schaustueck name="Tabs" satz="Schaltet zwischen Ansichten um. Die aktive ist unterstrichen.">
        <Zustand name="drei Reiter">
          <Tabs defaultValue="stand" className="w-72">
            <TabsList>
              <TabsTrigger value="stand">Stände</TabsTrigger>
              <TabsTrigger value="flows">Flows</TabsTrigger>
              <TabsTrigger value="logs" disabled>
                Logs
              </TabsTrigger>
            </TabsList>
            <TabsContent value="stand" className="text-ui-sm text-muted-foreground">
              Live und Test, je mit Version und Gesundheit.
            </TabsContent>
            <TabsContent value="flows" className="text-ui-sm text-muted-foreground">
              Die Flows dieses Stands mit ihrem Modell.
            </TabsContent>
          </Tabs>
        </Zustand>
      </Schaustueck>

      <Schaustueck name="Card" satz="Ein erhabener Kasten: Kopf, Inhalt, Fuß.">
        <Zustand name="vollständig">
          <Card className="w-72">
            <CardHeader>
              <CardTitle>Urlaubsantrag</CardTitle>
              <CardDescription>Livestand · Version 1.4.0</CardDescription>
            </CardHeader>
            <CardContent className="text-ui-sm text-muted-foreground">
              Zwei Flows, ein Modell, vier Tester.
            </CardContent>
            <CardFooter>
              <Button size="sm">Öffnen</Button>
            </CardFooter>
          </Card>
        </Zustand>
      </Schaustueck>

      <Schaustueck name="Badge" satz="Ein Zustand in zwei Wörtern.">
        {ABZEICHEN_ARTEN.map(art => (
          <Zustand key={art} name={art}>
            <Badge variant={art}>{art}</Badge>
          </Zustand>
        ))}
        <Zustand name="mit Symbol">
          <Badge variant="success">
            <Check />
            gesund
          </Badge>
        </Zustand>
      </Schaustueck>

      <Schaustueck name="Alert" satz="Ein Hinweis im Fluss der Seite — nicht darüber.">
        <Zustand name="default">
          <Alert className="w-80">
            <Info />
            <AlertTitle>Kein Modell geladen</AlertTitle>
            <AlertDescription>Der erste Lauf lädt es nach.</AlertDescription>
          </Alert>
        </Zustand>
        <Zustand name="destructive">
          <Alert variant="destructive" className="w-80">
            <TriangleAlert />
            <AlertTitle>Stand nicht lieferbar</AlertTitle>
            <AlertDescription>Die Dateien der App fehlen am Gerät.</AlertDescription>
          </Alert>
        </Zustand>
      </Schaustueck>

      <Schaustueck name="Toast" satz="Die kurze Meldung, die von selbst wieder geht.">
        {MELDUNGS_ARTEN.map(art => (
          <Zustand key={art} name={art}>
            <Toast art={art} className="w-72">
              <ToastIcon>
                <Bell />
              </ToastIcon>
              <ToastMessage>Sicherung angelegt.</ToastMessage>
              <ToastClose aria-label="Schließen" />
            </Toast>
          </Zustand>
        ))}
      </Schaustueck>

      <Schaustueck
        name="Avatar"
        satz="Das Bild eines Menschen — und was dasteht, wenn es keines gibt."
      >
        <Zustand name="Rückfall">
          <Avatar>
            <AvatarFallback>MK</AvatarFallback>
          </Avatar>
        </Zustand>
        <Zustand name="Bild fehlt">
          <Avatar>
            <AvatarImage src="/gibt-es-nicht.png" alt="" />
            <AvatarFallback>
              <User className="size-4" />
            </AvatarFallback>
          </Avatar>
        </Zustand>
        <Zustand name="groß">
          <Avatar className="size-12">
            <AvatarFallback>AR</AvatarFallback>
          </Avatar>
        </Zustand>
      </Schaustueck>

      <Schaustueck name="Separator" satz="Ein Strich zwischen zwei Dingen.">
        <Zustand name="horizontal">
          <div className="w-56">
            <Separator />
          </div>
        </Zustand>
        <Zustand name="vertical">
          <div className="flex h-8 items-center gap-3">
            <span className="text-ui-sm">links</span>
            <Separator orientation="vertical" />
            <span className="text-ui-sm">rechts</span>
          </div>
        </Zustand>
      </Schaustueck>

      <Schaustueck name="Skeleton" satz="Der Platzhalter, solange die Antwort unterwegs ist.">
        <Zustand name="Zeile">
          <Skeleton width="14rem" />
        </Zustand>
        <Zustand name="Block">
          <Skeleton width="14rem" height="4rem" />
        </Zustand>
        <Zustand name="rund">
          <Skeleton width="2rem" height="2rem" borderRadius="50%" />
        </Zustand>
      </Schaustueck>

      <Schaustueck name="Progress" satz="Wie weit etwas ist — oder dass es unbekannt ist.">
        <Zustand name="0">
          <Progress value={0} className="w-56" />
        </Zustand>
        <Zustand name="42">
          <Progress value={42} className="w-56" />
        </Zustand>
        <Zustand name="100">
          <Progress value={100} className="w-56" />
        </Zustand>
        <Zustand name="unbestimmt">
          <Progress className="w-56" />
        </Zustand>
      </Schaustueck>

      <Schaustueck name="ScrollArea" satz="Ein Rollbereich mit einem Balken, der zum Thema passt.">
        <Zustand name="zwölf Zeilen auf acht Zeilen Höhe">
          <ScrollArea className="h-32 w-56 rounded-md border border-border p-ui-2">
            <ul className="flex flex-col gap-1 text-ui-sm">
              {Array.from({ length: 12 }, (_, i) => (
                <li key={i}>Zeile {i + 1}</li>
              ))}
            </ul>
          </ScrollArea>
        </Zustand>
      </Schaustueck>

      <Schaustueck name="Breadcrumb" satz="Der Weg hierher. Das letzte Glied ist kein Verweis.">
        <Zustand name="mit Auslassung">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="#">Einstellungen</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbEllipsis />
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Urlaubsantrag</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </Zustand>
      </Schaustueck>
    </div>
  );
}

export default Schauseite;
