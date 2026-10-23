ALTER TABLE `mirror_thread` ADD `priority_rank` integer DEFAULT 3 NOT NULL;--> statement-breakpoint
UPDATE `mirror_thread` SET `priority_rank` = CASE `priority` WHEN 'P1' THEN 0 WHEN 'P2' THEN 1 WHEN 'P3' THEN 2 ELSE 3 END;--> statement-breakpoint
CREATE INDEX `idx_mirror_thread_priority_rank_updated` ON `mirror_thread` (`priority_rank`,"updated_at" desc);--> statement-breakpoint
CREATE INDEX `idx_mirror_thread_blocked_state` ON `mirror_thread` (`blocked`,`state`);--> statement-breakpoint
CREATE INDEX `idx_mirror_user_login_nocase` ON `mirror_user` ("login" COLLATE NOCASE);