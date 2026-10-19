CREATE TABLE `state_github_app` (
	`id` text PRIMARY KEY,
	`app_id` integer NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`owner_login` text DEFAULT '' NOT NULL,
	`owner_type` text DEFAULT '' NOT NULL,
	`html_url` text DEFAULT '' NOT NULL,
	`base_url` text DEFAULT '' NOT NULL,
	`client_id` text NOT NULL,
	`client_secret_enc` text NOT NULL,
	`webhook_secret_enc` text,
	`private_key_enc` text NOT NULL,
	`installation_id` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
