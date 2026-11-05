CREATE TABLE `state_webhook_delivery` (
	`id` text PRIMARY KEY,
	`event` text NOT NULL,
	`action` text,
	`repo` text,
	`received_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_state_webhook_delivery_received` ON `state_webhook_delivery` (`received_at`);
