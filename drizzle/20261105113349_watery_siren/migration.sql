CREATE TABLE `state_snooze` (
	`key` text PRIMARY KEY,
	`submission_id` text,
	`repo` text,
	`number` integer,
	`snoozed_until` integer NOT NULL,
	`created_at` integer NOT NULL,
	`actor_user_id` text
);
--> statement-breakpoint
CREATE INDEX `idx_state_snooze_until` ON `state_snooze` (`snoozed_until`);--> statement-breakpoint
CREATE INDEX `idx_state_snooze_submission` ON `state_snooze` (`submission_id`);--> statement-breakpoint
CREATE INDEX `idx_state_snooze_issue` ON `state_snooze` (`repo`,`number`);