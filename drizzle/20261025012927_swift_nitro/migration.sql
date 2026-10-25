CREATE TABLE `state_calendar_feed` (
	`user_id` text PRIMARY KEY,
	`token_hash` text NOT NULL UNIQUE,
	`token_hint` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_state_calendar_feed_user_id_auth_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `auth_user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `state_day_block` (
	`id` text PRIMARY KEY,
	`user_id` text NOT NULL,
	`date` text NOT NULL,
	`start_minute` integer NOT NULL,
	`minutes` integer NOT NULL,
	`kind` text NOT NULL,
	`org` text,
	`name` text,
	`issue_number` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_state_day_block_user_id_auth_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `auth_user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `state_unavailable_window` (
	`id` text PRIMARY KEY,
	`user_id` text NOT NULL,
	`label` text NOT NULL,
	`weekday` integer,
	`date` text,
	`start_minute` integer NOT NULL,
	`end_minute` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_state_unavailable_window_user_id_auth_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `auth_user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `state_work_hours` (
	`user_id` text PRIMARY KEY,
	`timezone` text NOT NULL,
	`start_minute` integer NOT NULL,
	`end_minute` integer NOT NULL,
	`work_days` text NOT NULL,
	`buffer_percent` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_state_work_hours_user_id_auth_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `auth_user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `idx_state_day_block_user_date` ON `state_day_block` (`user_id`,`date`);--> statement-breakpoint
CREATE INDEX `idx_state_unavailable_window_user` ON `state_unavailable_window` (`user_id`);