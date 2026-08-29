/**
 * Die Primitive (Phase H3, 29.08.2026).
 *
 * Fuenfundzwanzig Grundbausteine auf Radix und Tailwind, aus denen eine
 * Oberflaeche besteht: Knoepfe, Felder, Dialoge, Menues, Reiter, Abzeichen.
 * Sie standen bis H3 in `apps/dashboard-frontend/src/components/ui/shadcn/`
 * und gehoerten damit der Shell allein -- eine App, die einen Knopf brauchte,
 * baute ihren eigenen, und der sah anders aus.
 *
 * WOFUER SIE NICHT DA SIND. Ein Primitiv weiss nichts von Arasul: es kennt
 * keine Route, keinen Endpunkt, keinen Benutzer. Was eine Zusammensetzung
 * aus mehreren von ihnen ist und dabei etwas ueber dieses Geraet weiss --
 * `Modal`, `Section`, `FilterBar`, `AuthCard` --, bleibt in der Shell.
 *
 * ZWEI LAUFZEITEN, UND DAS IST DER UNTERSCHIED ZU DEN SECHS BAUSTEINEN
 * DANEBEN. Die Primitive sind auf Tailwind geschrieben; sie brauchen einen
 * Bau und die Tokens aus `theme.css`. Die sechs Bausteine aus D7 (Kopf,
 * Liste, Karte, Formular, Meldung, Menue) sind auf reinem CSS geschrieben und
 * laufen in einer App OHNE Bau, die nur `browser/marken.js` und `marken.css`
 * laedt. Wer einen Bau hat, nimmt die Primitive.
 */

export { Alert, AlertTitle, AlertDescription } from './alert';
export {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogOverlay,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from './alert-dialog';
export { Avatar, AvatarImage, AvatarFallback } from './avatar';
export { Badge, badgeVariants } from './badge';
export {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
  BreadcrumbEllipsis,
} from './breadcrumb';
export { Button, buttonVariants } from './button';
export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
} from './card';
export { Checkbox } from './checkbox';
export {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuGroup,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
} from './context-menu';
export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from './dialog';
export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuGroup,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from './dropdown-menu';
export { Input } from './input';
export { Label } from './label';
export {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverAnchor,
  PopoverHeader,
  PopoverTitle,
  PopoverDescription,
} from './popover';
export { Progress } from './progress';
export { RadioGroup, RadioGroupItem } from './radio-group';
export { ScrollArea, ScrollBar } from './scroll-area';
export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from './select';
export { Separator } from './separator';
export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetOverlay,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
} from './sheet';
export { Skeleton } from './skeleton';
export type { SkeletonProps } from './skeleton';
export { Switch } from './switch';
export { Tabs, TabsList, TabsTrigger, TabsContent } from './tabs';
export { Textarea } from './textarea';
export { Toast, ToastViewport, ToastIcon, ToastMessage, ToastClose, toastVariants } from './toast';
export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from './tooltip';
