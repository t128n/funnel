import { cn } from '#lib/utils';

export type SelectTriggerVariant = 'default' | 'ghost' | 'pill';

/**
 * Canonical trigger geometry for every single/multi select in the app, so the
 * Inspector's attribute strip and the filter toolbars read as one family.
 */
export const selectTriggerBase =
	'flex h-(--size-control-sm) shrink-0 items-center gap-1.5 rounded-sm border px-2 text-body transition-colors outline-none focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:bg-surface-2 disabled:text-fg-disabled';

/** Matches the chevron baked into `Select.Trigger`. */
export const selectTriggerChevron = 'size-4 shrink-0 text-fg-muted';

const variantColors: Record<SelectTriggerVariant, string> = {
	default: 'border-border-strong bg-canvas text-fg-secondary hover:bg-surface',
	ghost:
		'border-transparent bg-transparent text-fg-secondary hover:bg-surface hover:text-fg',
	pill: 'border-border-subtle bg-surface text-fg-secondary hover:bg-surface-2 hover:text-fg'
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
