ALTER TABLE `auth_session` ADD `impersonatedBy` text;--> statement-breakpoint
ALTER TABLE `auth_user` ADD `role` text;--> statement-breakpoint
ALTER TABLE `auth_user` ADD `banned` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `auth_user` ADD `banReason` text;--> statement-breakpoint
ALTER TABLE `auth_user` ADD `banExpires` integer;--> statement-breakpoint
UPDATE `auth_user` SET `role` = 'read' WHERE `role` IS NULL;--> statement-breakpoint
UPDATE `auth_user` SET `role` = 'admin' WHERE `id` = (SELECT `id` FROM `auth_user` ORDER BY `createdAt` ASC LIMIT 1);