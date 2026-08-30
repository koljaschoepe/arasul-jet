/**
 * Die Schaustücke der zwanzig Primitive aus Phase H4.
 *
 * Sie stehen in einer eigenen Datei und nicht in `Schauseite.tsx`: die Seite
 * wäre sonst über tausend Zeilen lang, und wer ein einzelnes Stück sucht,
 * scrollt. Die Seite bleibt das Inhaltsverzeichnis, hier steht der Inhalt.
 *
 * Jedes Stück trägt seinen Zustand selbst, wenn es einen braucht — die Seite
 * darüber hält keinen Zustand für Stücke, die sie nicht kennt.
 */
import { useState } from 'react';
import {
  Bold,
  CalendarDays,
  ChartLine,
  FileText,
  Italic,
  LayoutDashboard,
  Package,
  Settings,
  Underline,
  Users,
} from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  AspectRatio,
  Button,
  Calendar,
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  Chart,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
  DatePicker,
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
  Input,
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarShortcut,
  MenubarTrigger,
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  Slider,
  Sparkline,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Toggle,
  ToggleGroup,
  ToggleGroupItem,
} from '@marken';
import { useForm } from 'react-hook-form';
import { Schaustueck, Zustand } from './Schaustueck';

/** Ein Verlauf, an dem man eine Linie sehen kann. Feste Zahlen, kein Zufall. */
const VERLAUF = [
  { t: 1, RAM: 38, Swap: 4 },
  { t: 2, RAM: 44, Swap: 5 },
  { t: 3, RAM: 41, Swap: 5 },
  { t: 4, RAM: 52, Swap: 7 },
  { t: 5, RAM: 47, Swap: 6 },
  { t: 6, RAM: 55, Swap: 8 },
];

const REIHEN = [
  { key: 'RAM', name: 'Arbeitsspeicher', unit: '%' },
  { key: 'Swap', name: 'Auslagerung', unit: '%' },
];

const MODELLE = [
  { wert: 'qwen', name: 'Qwen3.8 27B', hinweis: 'hf.co/unsloth/Qwen3.8-27B-GGUF:IQ4_XS' },
  { wert: 'gemma', name: 'Gemma4 e4b', hinweis: 'klein und schnell' },
  { wert: 'nomic', name: 'Nomic Embed Text', hinweis: 'für Einbettungen' },
  { wert: 'llava', name: 'LLaVA-Phi3', hinweis: 'Bilder und eingescannter Text' },
];

/** Ein Beispielformular, damit `Form` etwas zu verwalten hat. */
function FormularStueck() {
  const formular = useForm<{ anzeigename: string }>({
    defaultValues: { anzeigename: '' },
    mode: 'onChange',
  });

  return (
    <Form {...formular}>
      <form className="w-64 space-y-3" onSubmit={formular.handleSubmit(() => undefined)}>
        <FormField
          control={formular.control}
          name="anzeigename"
          rules={{ required: 'Ohne Namen geht es nicht.' }}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Anzeigename</FormLabel>
              <FormControl>
                <Input placeholder="Mia Kern" {...field} />
              </FormControl>
              <FormDescription>So steht der Mensch in der Liste.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" size="sm" variant="solid">
          Übernehmen
        </Button>
      </form>
    </Form>
  );
}

export function SchaustueckeH4() {
  const [datum, setDatum] = useState<Date | undefined>(new Date(2026, 8, 4));
  const [schieber, setSchieber] = useState([40]);
  const [bereich, setBereich] = useState([20, 70]);
  const [schrift, setSchrift] = useState<string[]>(['fett']);
  const [code, setCode] = useState('');

  return (
    <>
      <Schaustueck
        name="Accordion"
        satz="Eine Liste, von der ein Stück offen steht. Der Inhalt steht darunter, nicht daneben."
      >
        <Zustand name="ein Stück offen">
          <Accordion type="single" collapsible defaultValue="a" className="w-72">
            <AccordionItem value="a">
              <AccordionTrigger>Was ist ein Stand?</AccordionTrigger>
              <AccordionContent>
                Je App gibt es einen Test- und einen Livestand. Der Teststand gehört den Testern.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="b">
              <AccordionTrigger>Wer gibt frei?</AccordionTrigger>
              <AccordionContent>
                Wer die App freigegeben hat, entscheidet die Anfrage.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </Zustand>
      </Schaustueck>

      <Schaustueck name="AspectRatio" satz="Ein Kasten, der sein Seitenverhältnis hält.">
        <Zustand name="16 zu 9">
          <div className="w-64">
            <AspectRatio ratio={16 / 9}>
              <div className="flex size-full items-center justify-center rounded-md border border-border bg-muted text-ui-sm text-muted-foreground">
                16 : 9
              </div>
            </AspectRatio>
          </div>
        </Zustand>
        <Zustand name="1 zu 1">
          <div className="w-32">
            <AspectRatio ratio={1}>
              <div className="flex size-full items-center justify-center rounded-md border border-border bg-muted text-ui-sm text-muted-foreground">
                1 : 1
              </div>
            </AspectRatio>
          </div>
        </Zustand>
      </Schaustueck>

      <Schaustueck name="Calendar" satz="Ein Datum aus einem Monat. Deutsch, Woche ab Montag.">
        <Zustand name="ein Tag gewählt">
          <Calendar
            mode="single"
            selected={datum}
            onSelect={setDatum}
            defaultMonth={new Date(2026, 8, 1)}
            className="rounded-md border border-border"
          />
        </Zustand>
      </Schaustueck>

      <Schaustueck name="Carousel" satz="Ein Band von Karten. Pfeiltasten blättern.">
        <Zustand name="drei Stücke">
          {/* Der Rand hält die Knöpfe innen: sie sitzen bei -3rem, und
              draußen wären sie bei 390 px nicht mehr auf der Seite. */}
          <div className="w-72 px-12">
            <Carousel>
              <CarouselContent>
                {['Antrag', 'Prüfung', 'Bescheid'].map(schritt => (
                  <CarouselItem key={schritt}>
                    <div className="flex h-24 items-center justify-center rounded-md border border-border text-ui-sm">
                      {schritt}
                    </div>
                  </CarouselItem>
                ))}
              </CarouselContent>
              <CarouselPrevious />
              <CarouselNext />
            </Carousel>
          </div>
        </Zustand>
      </Schaustueck>

      <Schaustueck name="Chart" satz="Der Verlauf: nur Blau nach Grau, ohne eigene Karte.">
        <Zustand name="zwei Reihen">
          <div className="w-72">
            <Chart
              data={VERLAUF}
              series={REIHEN}
              xKey="t"
              formatX={wert => `${wert} h`}
              formatY={wert => `${wert}%`}
              yDomain={[0, 100]}
              height={180}
              label="Auslastung der letzten sechs Stunden"
            />
          </div>
        </Zustand>
        <Zustand name="Sparkline">
          <div className="w-32">
            <Sparkline values={VERLAUF.map(punkt => punkt.RAM)} />
          </div>
        </Zustand>
      </Schaustueck>

      <Schaustueck name="Collapsible" satz="Ein Stück, das auf- und zugeht. Ohne eigenes Aussehen.">
        <Zustand name="zu, per Klick auf">
          <Collapsible className="w-72">
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm">
                Rohdaten zeigen
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <pre className="mt-2 rounded-md border border-border p-ui-2 font-mono text-ui-xs">
                {'{ "stand": "live", "version": "1.4.0" }'}
              </pre>
            </CollapsibleContent>
          </Collapsible>
        </Zustand>
      </Schaustueck>

      <Schaustueck name="Command" satz="Tippen, und was übrig bleibt, steht da.">
        <Zustand name="in der Seite">
          <Command className="w-72 rounded-md border border-border">
            <CommandInput placeholder="Modell suchen …" />
            <CommandList>
              <CommandEmpty>Nichts gefunden.</CommandEmpty>
              <CommandGroup heading="Kurzliste">
                {MODELLE.map(modell => (
                  <CommandItem key={modell.wert}>
                    <Package />
                    {modell.name}
                    <CommandShortcut>⌘{modell.name[0]}</CommandShortcut>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </Zustand>
      </Schaustueck>

      <Schaustueck name="DatePicker" satz="Der Knopf, der den Kalender aufmacht.">
        <Zustand name="mit Datum">
          <DatePicker wert={datum} aufWert={setDatum} />
        </Zustand>
        <Zustand name="leer">
          <DatePicker aufWert={() => undefined} />
        </Zustand>
        <Zustand name="disabled">
          <DatePicker wert={datum} disabled />
        </Zustand>
      </Schaustueck>

      <Schaustueck name="Form" satz="Feld, Name, Hinweis und Fehler, richtig verdrahtet.">
        <Zustand name="mit Pflichtfeld">
          <FormularStueck />
        </Zustand>
      </Schaustueck>

      <Schaustueck name="HoverCard" satz="Eine Vorschau beim Verweilen. Mehr als ein Tooltip.">
        <Zustand name="beim Verweilen">
          <HoverCard openDelay={100}>
            <HoverCardTrigger asChild>
              <Button variant="link">Urlaubsantrag</Button>
            </HoverCardTrigger>
            <HoverCardContent>
              <p className="font-medium text-foreground">Urlaubsantrag</p>
              <p className="text-muted-foreground">Livestand 1.4.0 · zwei Flows · vier Tester</p>
            </HoverCardContent>
          </HoverCard>
        </Zustand>
      </Schaustueck>

      <Schaustueck name="InputOTP" satz="Sechs Kästen, ein Feld. Einfügen verteilt sich.">
        <Zustand name="sechs Stellen">
          <InputOTP maxLength={6} value={code} onChange={setCode}>
            <InputOTPGroup>
              <InputOTPSlot index={0} />
              <InputOTPSlot index={1} />
              <InputOTPSlot index={2} />
            </InputOTPGroup>
            <InputOTPSeparator />
            <InputOTPGroup>
              <InputOTPSlot index={3} />
              <InputOTPSlot index={4} />
              <InputOTPSlot index={5} />
            </InputOTPGroup>
          </InputOTP>
        </Zustand>
      </Schaustueck>

      <Schaustueck name="Menubar" satz="Die Menüleiste eines Programms: Befehle, nicht Ziele.">
        <Zustand name="zwei Menüs">
          <Menubar>
            <MenubarMenu>
              <MenubarTrigger>Stand</MenubarTrigger>
              <MenubarContent>
                <MenubarItem>
                  Live schalten <MenubarShortcut>⌘L</MenubarShortcut>
                </MenubarItem>
                <MenubarItem>Zurücknehmen</MenubarItem>
                <MenubarSeparator />
                <MenubarItem variant="destructive">App entfernen</MenubarItem>
              </MenubarContent>
            </MenubarMenu>
            <MenubarMenu>
              <MenubarTrigger>Ansicht</MenubarTrigger>
              <MenubarContent>
                <MenubarItem>Logs</MenubarItem>
                <MenubarItem>Läufe</MenubarItem>
              </MenubarContent>
            </MenubarMenu>
          </Menubar>
        </Zustand>
      </Schaustueck>

      <Schaustueck name="NavigationMenu" satz="Die Navigation: Ziele, nicht Befehle.">
        <Zustand name="ein Menü mit Zielen">
          <NavigationMenu>
            <NavigationMenuList>
              <NavigationMenuItem>
                <NavigationMenuTrigger>Verwaltung</NavigationMenuTrigger>
                <NavigationMenuContent>
                  <ul className="w-56 p-1">
                    <li>
                      <NavigationMenuLink href="#">
                        <span className="font-medium">Mitarbeiter</span>
                        <span className="text-muted-foreground">Menschen und Freigaben</span>
                      </NavigationMenuLink>
                    </li>
                    <li>
                      <NavigationMenuLink href="#">
                        <span className="font-medium">Apps</span>
                        <span className="text-muted-foreground">Stände, Flows, Läufe</span>
                      </NavigationMenuLink>
                    </li>
                  </ul>
                </NavigationMenuContent>
              </NavigationMenuItem>
            </NavigationMenuList>
          </NavigationMenu>
        </Zustand>
      </Schaustueck>

      <Schaustueck
        name="Pagination"
        satz="Blättern. Jede Seite hat eine Adresse, also sind es Verweise."
      >
        <Zustand name="Seite 2 von vielen">
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious href="#" />
              </PaginationItem>
              <PaginationItem>
                <PaginationLink href="#">1</PaginationLink>
              </PaginationItem>
              <PaginationItem>
                <PaginationLink href="#" aktiv>
                  2
                </PaginationLink>
              </PaginationItem>
              <PaginationItem>
                <PaginationEllipsis />
              </PaginationItem>
              <PaginationItem>
                <PaginationNext href="#" />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </Zustand>
      </Schaustueck>

      <Schaustueck name="Resizable" satz="Spalten, deren Breite der Mensch selbst zieht.">
        <Zustand name="zwei Spalten">
          <ResizablePanelGroup
            orientation="horizontal"
            className="h-32 w-72 rounded-md border border-border"
          >
            <ResizablePanel id="schau-links" defaultSize="40%" minSize="20%">
              <div className="flex h-full items-center justify-center text-ui-sm">Liste</div>
            </ResizablePanel>
            <ResizableHandle mitGriff />
            <ResizablePanel id="schau-rechts" minSize="20%">
              <div className="flex h-full items-center justify-center text-ui-sm">Detail</div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </Zustand>
      </Schaustueck>

      <Schaustueck
        name="Sidebar"
        satz="Die Mechanik einer Seitenleiste: auf, zu, und unter 900 px ein Blatt."
      >
        <Zustand name="eingebettet, offen">
          {/* Dieselbe Breite und derselbe Grund wie beim Muster `Seitenleiste`
              (J31): im 18rem-Kasten blieb neben der 16rem breiten Leiste ein
              Rest, in dem kein Wort mehr ganz stand, und ein Schaustueck ohne
              die Flaeche daneben zeigt von dieser Mechanik die Haelfte. */}
          <SidebarProvider eingebettet className="h-48 w-[30rem] rounded-md border border-border">
            <Sidebar einklappen="symbole">
              <SidebarContent>
                <SidebarGroup>
                  <SidebarGroupLabel>Bereiche</SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      <SidebarMenuItem>
                        <SidebarMenuButton aktiv>
                          <LayoutDashboard />
                          <span>Übersicht</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                      <SidebarMenuItem>
                        <SidebarMenuButton>
                          <Users />
                          <span>Mitarbeiter</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              </SidebarContent>
            </Sidebar>
            <SidebarInset>
              <div className="flex items-center gap-2 p-ui-2 text-ui-sm">
                <SidebarTrigger />
                Inhalt
              </div>
            </SidebarInset>
          </SidebarProvider>
        </Zustand>
      </Schaustueck>

      <Schaustueck
        name="Slider"
        satz="Ein Wert auf einer Strecke. Für Größenordnungen, nicht für Zahlen."
      >
        <Zustand name={`ein Griff (${schieber[0]})`}>
          <Slider
            value={schieber}
            onValueChange={setSchieber}
            aria-label="Schwelle"
            className="w-56"
          />
        </Zustand>
        <Zustand name={`zwei Griffe (${bereich[0]}–${bereich[1]})`}>
          <Slider value={bereich} onValueChange={setBereich} className="w-56" />
        </Zustand>
        <Zustand name="disabled">
          <Slider defaultValue={[30]} disabled className="w-56" />
        </Zustand>
      </Schaustueck>

      <Schaustueck name="Table" satz="Die Tabelle und der Rollkasten, in dem sie steht.">
        <Zustand name="drei Zeilen">
          <div className="w-72">
            <Table>
              <TableCaption>Die Stände zweier Apps</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>App</TableHead>
                  <TableHead>Stand</TableHead>
                  <TableHead className="text-right">Version</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[
                  ['Urlaubsantrag', 'live', '1.4.0'],
                  ['Urlaubsantrag', 'test', '1.5.0-rc1'],
                  ['Angebot', 'live', '0.9.2'],
                ].map(([app, stand, version]) => (
                  <TableRow key={`${app}-${stand}`}>
                    <TableCell>{app}</TableCell>
                    <TableCell>{stand}</TableCell>
                    <TableCell className="text-right">{version}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Zustand>
      </Schaustueck>

      <Schaustueck name="Toggle" satz="Ein Knopf, der gedrückt bleibt.">
        <Zustand name="an">
          <Toggle pressed aria-label="Fett">
            <Bold />
          </Toggle>
        </Zustand>
        <Zustand name="aus">
          <Toggle aria-label="Kursiv">
            <Italic />
          </Toggle>
        </Zustand>
        <Zustand name="outline">
          <Toggle variant="outline" aria-label="Unterstrichen">
            <Underline />
          </Toggle>
        </Zustand>
        <Zustand name="disabled">
          <Toggle disabled aria-label="gesperrt">
            <Settings />
          </Toggle>
        </Zustand>
      </Schaustueck>

      <Schaustueck
        name="ToggleGroup"
        satz="Mehrere Toggles als eine Leiste. Art und Größe an der Gruppe."
      >
        <Zustand name="mehrere zugleich">
          <ToggleGroup type="multiple" value={schrift} onValueChange={setSchrift} variant="outline">
            <ToggleGroupItem value="fett" aria-label="Fett">
              <Bold />
            </ToggleGroupItem>
            <ToggleGroupItem value="kursiv" aria-label="Kursiv">
              <Italic />
            </ToggleGroupItem>
            <ToggleGroupItem value="unterstrichen" aria-label="Unterstrichen">
              <Underline />
            </ToggleGroupItem>
          </ToggleGroup>
        </Zustand>
        <Zustand name="genau eine">
          <ToggleGroup type="single" defaultValue="tag">
            <ToggleGroupItem value="tag" aria-label="Tag">
              <CalendarDays />
            </ToggleGroupItem>
            <ToggleGroupItem value="verlauf" aria-label="Verlauf">
              <ChartLine />
            </ToggleGroupItem>
            <ToggleGroupItem value="liste" aria-label="Liste">
              <FileText />
            </ToggleGroupItem>
          </ToggleGroup>
        </Zustand>
      </Schaustueck>
    </>
  );
}
