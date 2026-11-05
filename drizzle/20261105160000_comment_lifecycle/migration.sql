CREATE TABLE `state_comment_reaction` (
	`user_id` text NOT NULL,
	`repo` text NOT NULL,
	`comment_external_id` text NOT NULL,
	`content` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `state_comment_reaction_pk` PRIMARY KEY(`user_id`, `repo`, `comment_external_id`, `content`)
);
--> statement-breakpoint
ALTER TABLE `mirror_comment` ADD `reactions` text;--> statement-breakpoint
CREATE INDEX `idx_state_comment_reaction_comment` ON `state_comment_reaction` (`repo`,`comment_external_id`);