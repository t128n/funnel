import { cn } from '#lib/utils';

export type SelectTriggerVariant = 'default' | 'ghost' | 'pill';

/**
 * Canonical trigger geometry for every single/multi select in the app, so the
 * Inspector's attribute strip and the filter toolbars read as one family.
 *
 * These are the values shadcn's `Select.Trigger` resolves to for `size="sm"`,
 * which keeps that primitive the implicit reference for `SingleSelect` while
 * giving `MultiSelect` an identical box to mirror.
 */
export const selectTriggerBase =
	'flex h-7 shrink-0 items-center gap-1.5 rounded-[min(var(--radius-md),10px)] border pr-2 pl-2.5 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-1 disabled:pointer-events-none disabled:opacity-50';

/** Matches the chevron baked into `Select.Trigger`. */
export const selectTriggerChevron = 'size-4 shrink-0 text-muted-foreground';

const variantColors: Record<SelectTriggerVariant, string> = {
	default: 'bg-background border-input text-muted-foreground hover:bg-muted',
	ghost:
		'border-transparent bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground',
	pill: 'border-border bg-muted/50 text-muted-foreground hover:bg-accent hover:text-foreground'
};

/**
 * Compose the shared trigger geometry with a variant's surface colors. Callers
 * add layout (width) and value-dependent state (selected/active) themselves.
 */
export function selectTriggerClass(
	variant: SelectTriggerVariant = 'default',
	className?: string
): string {
	return cn(selectTriggerBase, variantColors[variant], className);
}
