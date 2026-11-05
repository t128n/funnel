CREATE TABLE `state_triage_event` (
	`id` text PRIMARY KEY,
	`submission_id` text NOT NULL,
	`action` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`repo` text,
	`number` integer,
	`reason` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `state_intake_submission` ADD `archived_at` integer;--> statement-breakpoint
ALTER TABLE `state_intake_submission` ADD `dismiss_reason` text;--> statement-breakpoint
ALTER TABLE `state_intake_submission` ADD `duplicate_repo` text;--> statement-breakpoint
ALTER TABLE `state_intake_submission` ADD `duplicate_number` integer;--> statement-breakpoint
CREATE INDEX `idx_state_triage_event_submission` ON `state_triage_event` (`submission_id`,`created_at`);