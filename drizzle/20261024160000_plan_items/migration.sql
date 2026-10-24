CREATE TABLE `state_plan_item` (
	`org` text NOT NULL,
	`name` text NOT NULL,
	`issue_number` integer NOT NULL,
	`week_start` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `state_plan_item_pk` PRIMARY KEY(`org`, `name`, `issue_number`)
);
--> statement-breakpoint
CREATE INDEX `idx_state_plan_item_week` ON `state_plan_item` (`week_start`);