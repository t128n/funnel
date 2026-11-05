CREATE TABLE `state_issue_waiting` (
	`repo` text NOT NULL,
	`number` integer NOT NULL,
	`reason` text NOT NULL,
	`note` text,
	`waiting_since` integer NOT NULL,
	`recheck_on` text,
	`actor_user_id` text,
	CONSTRAINT `state_issue_waiting_pk` PRIMARY KEY(`repo`, `number`)
);
--> statement-breakpoint
CREATE INDEX `idx_state_issue_waiting_since` ON `state_issue_waiting` (`waiting_since`);--> statement-breakpoint
CREATE INDEX `idx_state_issue_waiting_recheck` ON `state_issue_waiting` (`recheck_on`);