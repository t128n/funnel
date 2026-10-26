import { triggerChevron, triggerClass } from '#lib/components/primitives/styles';

export type SelectTriggerVariant = 'default' | 'ghost' | 'pill';

/**
 * Canonical trigger geometry for every single/multi select in the app, so the
 * Inspector's attribute strip and the filter toolbars read as one family.
 *
 * Delegates to the primitives recipe: the same `triggerClass` that `Select.Trigger`
 * bakes in, so a call site can never drift from the primitive box.
 */
export const selectTriggerBase = triggerClass('default');

/** Matches the chevron baked into `Select.Trigger`. */
export const selectTriggerChevron = triggerChevron;

/**
 * Compose the shared trigger geometry with a variant's surface colors. Callers
 * add layout (width) and value-dependent state (selected/active) themselves.
 */
export function selectTriggerClass(
	variant: SelectTriggerVariant = 'default',
	className?: string
): string {
	return triggerClass(variant, className);
}
