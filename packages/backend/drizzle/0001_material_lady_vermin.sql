CREATE TABLE `ai_insights_cache` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`cache_key` text NOT NULL,
	`shop_uuid` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`insights` text NOT NULL,
	`anomalies` text NOT NULL,
	`patterns` text NOT NULL,
	`documents_count` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_insights_cache_cache_key_unique` ON `ai_insights_cache` (`cache_key`);