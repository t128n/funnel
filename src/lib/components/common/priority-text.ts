/**
 * One non-duplicated spoken form for a priority: the P1–P3 token plus the
 * level name exactly once. Visible rendering stays "P1 High".
 */
export function prioritySpokenLabel(priority: string, name: string): string {
	return `${priority}, ${name.toLowerCase()} priority`;
}
