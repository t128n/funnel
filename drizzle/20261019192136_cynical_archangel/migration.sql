CREATE TABLE `state_issue_watch` (
	`user_id` text NOT NULL,
	`org` text NOT NULL,
	`name` text NOT NULL,
	`issue_number` integer NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `state_issue_watch_pk` PRIMARY KEY(`user_id`, `org`, `name`, `issue_number`)
);
--> statement-breakpoint
CREATE TABLE `state_notification` (
	`id` text PRIMARY KEY,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`dedupe_key` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`url` text DEFAULT '' NOT NULL,
	`actor_login` text,
	`actor_avatar_url` text,
	`created_at` integer NOT NULL,
	`read_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_state_issue_watch_issue` ON `state_issue_watch` (`org`,`name`,`issue_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_state_notification_dedupe` ON `state_notification` (`dedupe_key`);--> statement-breakpoint
CREATE INDEX `idx_state_notification_user_created` ON `state_notification` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_state_notification_user_read` ON `state_notification` (`user_id`,`read_at`);