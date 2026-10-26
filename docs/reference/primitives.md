# Primitives

This page is the reference for Funnel's component primitives: thin wrappers over
bits-ui that carry the behaviour, focus handling and ARIA, plus the Bugzilla
chrome defined in [DESIGN.md](../DESIGN.md). Import every family from its barrel
under `#lib/components/primitives`; never import a `.svelte` file directly.

```ts
import { Button } from "#lib/components/primitives/button";
import * as Card from "#lib/components/primitives/card";
```

Barrels export both the short name (`Button`) and the dotted form call sites use
(`Card.Root`, `Card.Header`, `Select.Trigger`). Variant helpers and their types
are exported alongside the components (`buttonVariants`, `ButtonVariant`).

## Ground rules

- Style recipes live in `src/lib/components/primitives/styles.ts`: `focusRing`,
  `control`, `panel`, `menuItem`, `labelText`, `triggerClass` and
  `triggerChevron`. Compose them; do not re-create their utilities at call sites.
- Radius follows DESIGN.md: `rounded-none` for cells and menu rows,
  `rounded-xs` (2px) for controls, `rounded-lg` (4px) for panels, and
  `rounded-full` only for avatars.
- Colour comes from tokens (`--primary`, `--muted`, `--border`, `--input`,
  `--destructive`). There is one accent, no gradients, no blur, and no `dark:`
  utilities inside primitives — the `.dark` class flips the tokens.
- `cn` from `#lib/utils` merges conflicting classes, so a caller may override a
  primitive default when layout demands it. Layout, spacing and positioning
  classes belong at the call site; colour, radius, border, shadow and font
  utilities do not.

## Families

| Family | Import | Exports | Notes |
| :--- | :--- | :--- | :--- |
| Alert | `#lib/components/primitives/alert` | `Alert`, `AlertTitle`, `AlertDescription` | `default`, `destructive` (2px left rule). |
| Avatar | `#lib/components/primitives/avatar` | `Avatar`, `AvatarImage`, `AvatarFallback` | `rounded-full` is the one round surface. |
| Badge | `#lib/components/primitives/badge` | `Badge` | `default`, `secondary`, `outline`, `destructive`; mono 10px uppercase on `--muted`. |
| Bubble | `#lib/components/primitives/bubble` | `Bubble`, `BubbleContent` | `default`, `muted`; flat bordered box. |
| Button | `#lib/components/primitives/button` | `Button`, `buttonVariants`, `ButtonVariant`, `ButtonSize` | `default`, `outline`, `ghost`, `secondary`, `destructive`; `default`, `sm`, `xs`, `lg`, `icon`, `icon-sm`, `icon-xs`; renders `<a>` with `href`. |
| Card | `#lib/components/primitives/card` | `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`, `CardAction` | Flat 4px panel, `p-3`, no tinted shell. |
| CodeBlock | `#lib/components/primitives/code-block` | `CodeBlock`, `CodeBlockHeader`, `CodeBlockTitle`, `CodeBlockActions`, `CodeBlockCopyButton`, `CodeBlockContent`, `CodeBlockLine` | Mono 13px, bordered, copy action. |
| Collapsible | `#lib/components/primitives/collapsible` | `Collapsible`, `CollapsibleTrigger`, `CollapsibleContent` | Behaviour only; no visual chrome. |
| Command | `#lib/components/primitives/command` | `Command`, `CommandInput`, `CommandList`, `CommandEmpty`, `CommandGroup`, `CommandItem`, `CommandSeparator` | Borderless input, `max-h-72` scroll list, flat rows. |
| Dialog | `#lib/components/primitives/dialog` | `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter`, `DialogOverlay`, `DialogPortal`, `DialogClose` | 4px panel, `text-xl` title, overlay `bg-foreground/25`; open the root with `bind:open` from a button. |
| DropdownMenu | `#lib/components/primitives/dropdown-menu` | `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuPortal`, `DropdownMenuItem`, `DropdownMenuLabel`, `DropdownMenuRadioGroup`, `DropdownMenuRadioItem`, `DropdownMenuSeparator` | Flat `rounded-none` rows, `data-[highlighted]` fill. |
| Empty | `#lib/components/primitives/empty` | `Empty`, `EmptyHeader`, `EmptyMedia`, `EmptyTitle`, `EmptyDescription` | Muted media, no illustration chrome. |
| Field | `#lib/components/primitives/field` | `Field`, `FieldSet`, `FieldLegend`, `FieldGroup`, `FieldLabel`, `FieldDescription` | Label is `text-xs font-semibold`; layout only. |
| Input | `#lib/components/primitives/input` | `Input`, `InputVariant` | `default`, `ghost` (borderless inline editor). |
| InputGroup | `#lib/components/primitives/input-group` | `InputGroup`, `InputGroupAddon`, `InputGroupInput`, `InputGroupTextarea` | One 1px shell around a ghost field. |
| Item | `#lib/components/primitives/item` | `Item`, `ItemContent`, `ItemTitle`, `ItemDescription`, `ItemActions` | `default`, `outline`; hover `bg-muted`, flat rows. |
| Kbd | `#lib/components/primitives/kbd` | `Kbd`, `KbdGroup` | Mono 10px on `--muted`. |
| Label | `#lib/components/primitives/label` | `Label` | Binds to a field; `text-xs` semibold via `labelText`. |
| Message | `#lib/components/primitives/message` | `Message`, `MessageAvatar`, `MessageHeader`, `MessageContent` | Flat bordered discussion block. |
| NativeSelect | `#lib/components/primitives/native-select` | `NativeSelect`, `NativeSelectOption`, `NativeSelectOptGroup` | Flat native chevron; `size` `default` or `sm`. |
| Popover | `#lib/components/primitives/popover` | `Popover`, `PopoverTrigger`, `PopoverContent`, `PopoverPortal`, `PopoverHeader`, `PopoverTitle`, `PopoverDescription` | 4px panel; the only shadowed surface besides dialogs. |
| Select | `#lib/components/primitives/select` | `Select`, `SelectTrigger`, `SelectContent`, `SelectItem`, `SelectValue`, `SelectGroup`, `SelectSeparator`, `SelectScrollUpButton`, `SelectScrollDownButton`, `SelectPortal` | `SelectTrigger` takes `variant` `default`, `ghost`, `pill`; content is a `p-1` panel. |
| Separator | `#lib/components/primitives/separator` | `Separator` | 1px `--border` rule. |
| Sheet | `#lib/components/primitives/sheet` | `Sheet`, `SheetContent`, `SheetOverlay`, `SheetPortal`, `SheetHeader`, `SheetTitle`, `SheetDescription` | Bordered mobile panel, no blur. |
| Sidebar | `#lib/components/primitives/sidebar` | `Sidebar`, `SidebarProvider`, `SidebarTrigger`, `SidebarRail`, `SidebarInset`, `SidebarHeader`, `SidebarFooter`, `SidebarContent`, `SidebarGroup`, `SidebarGroupContent`, `SidebarMenu`, `SidebarMenuItem`, `SidebarMenuButton`, `SidebarMenuBadge`, `useSidebar` | Cookie-backed open state, mobile sheet; active row is 600 in `--sidebar-primary` with a 3px rule. |
| Sonner | `#lib/components/primitives/sonner` | `Toaster` | Mount once in the root layout; popover tokens. |
| Spinner | `#lib/components/primitives/spinner` | `Spinner` | `size-4` animated Lucide loader. |
| Textarea | `#lib/components/primitives/textarea` | `Textarea`, `TextareaVariant` | `default`, `ghost`; grows with content. |
| Toggle | `#lib/components/primitives/toggle` | `Toggle`, `toggleClass`, `ToggleVariant`, `ToggleSize` | `outline` only; flat segmented surface. |
| ToggleGroup | `#lib/components/primitives/toggle-group` | `ToggleGroup`, `ToggleGroupItem` | One bordered control; `data-[state=on]:bg-accent`. |
| Tooltip | `#lib/components/primitives/tooltip` | `Tooltip`, `TooltipTrigger`, `TooltipContent`, `TooltipProvider`, `TooltipPortal` | Inverted flat panel, 4px radius, no animation. |

## Common compositions

```svelte
<Field>
  <FieldLabel for="summary">Summary</FieldLabel>
  <Input id="summary" variant="ghost" bind:value={summary} />
  <FieldDescription>Rendered as plain text when not editing.</FieldDescription>
</Field>

<Select.Root type="single" bind:value={status}>
  <Select.Trigger variant="pill"><Select.Value placeholder="Status" /></Select.Trigger>
  <Select.Content>
    <Select.Item value="open">Open</Select.Item>
    <Select.Item value="closed">Closed</Select.Item>
  </Select.Content>
</Select.Root>

<DropdownMenu.Root>
  <DropdownMenu.Trigger child={(props) => <Button {...props} variant="ghost" />}>Actions</DropdownMenu.Trigger>
  <DropdownMenu.Content>
    <DropdownMenuItem onSelect={edit}>Edit</DropdownMenuItem>
    <DropdownMenuSeparator />
    <DropdownMenuItem onSelect={remove}>Delete</DropdownMenuItem>
  </DropdownMenu.Content>
</DropdownMenu.Root>
```

Use `variant="ghost"` for inline editors and `Trigger variant="pill"` for
toolbar tokens. Keep `class="rounded-full"` on avatars only, and keep a semantic
`text-lg`/`text-xl` when an editor is genuinely the page heading.
