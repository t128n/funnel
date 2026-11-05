CREATE TABLE `state_saved_view` (
	`id` text PRIMARY KEY,
	`owner_user_id` text NOT NULL,
	`name` text NOT NULL,
	`query` text DEFAULT '' NOT NULL,
	`scope` text NOT NULL,
	`sort` text,
	`direction` text,
	`group` text,
	`shared` integer DEFAULT 0 NOT NULL,
	`pinned` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_state_saved_view_owner_name` ON `state_saved_view` (`owner_user_id`,lower("name"));--> statement-breakpoint
CREATE INDEX `idx_state_saved_view_owner` ON `state_saved_view` (`owner_user_id`);--> statement-breakpoint
CREATE INDEX `idx_state_saved_view_scope_shared` ON `state_saved_view` (`scope`,`shared`);
