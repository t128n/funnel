/**
 * Browser notification opt-in (T6). Wave 0 stub: requesting permission throws
 * until T6 implements the native notification bridge.
 */

export async function enableNativeNotifications(): Promise<
	'granted' | 'denied' | 'unsupported'
> {
	throw new Error('T6 not implemented: enableNativeNotifications');
}
