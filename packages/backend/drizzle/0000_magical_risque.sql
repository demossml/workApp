CREATE TABLE `accessories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP',
	`updated_at` text DEFAULT 'CURRENT_TIMESTAMP'
);
--> statement-breakpoint
CREATE TABLE `deadStocks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`shop_uuid` text NOT NULL,
	`name` text NOT NULL,
	`quantity` integer NOT NULL,
	`sold` integer NOT NULL,
	`mark` text,
	`lastSaleDate` text,
	`moveCount` integer,
	`moveToStore` text,
	`document_number` text NOT NULL,
	`document_date` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `deadStocks_shop_uuid_idx` ON `deadStocks` (`shop_uuid`);--> statement-breakpoint
CREATE INDEX `deadStocks_document_number_idx` ON `deadStocks` (`document_number`);--> statement-breakpoint
CREATE INDEX `deadStocks_document_date_idx` ON `deadStocks` (`document_date`);--> statement-breakpoint
CREATE TABLE `index_documents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`number` text NOT NULL,
	`shop_id` text NOT NULL,
	`close_date` text,
	`open_user_uuid` text,
	`type` text,
	`transactions` text
);
--> statement-breakpoint
CREATE INDEX `idx_index_documents_shop_id` ON `index_documents` (`shop_id`);--> statement-breakpoint
CREATE INDEX `idx_index_documents_number` ON `index_documents` (`number`);--> statement-breakpoint
CREATE INDEX `idx_index_documents_type` ON `index_documents` (`type`);--> statement-breakpoint
CREATE UNIQUE INDEX `index_documents_number_shop_id_unique` ON `index_documents` (`number`,`shop_id`);--> statement-breakpoint
CREATE TABLE `openShops` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text,
	`location_lat` real,
	`location_lon` real,
	`photoCashRegisterPhoto` text,
	`photoCabinetsPhoto` text,
	`photoShowcasePhoto1` text,
	`photoShowcasePhoto2` text,
	`photoShowcasePhoto3` text,
	`photoTerritory1` text,
	`photoTerritory2` text,
	`countingMoney` real,
	`CountingMoneyMessage` text,
	`userId` text,
	`shopUuid` text,
	`dateTime` text
);
--> statement-breakpoint
CREATE TABLE `openStors` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`userId` text NOT NULL,
	`cash` real,
	`sign` text,
	`ok` integer
);
--> statement-breakpoint
CREATE INDEX `openStors_userId_idx` ON `openStors` (`userId`);--> statement-breakpoint
CREATE INDEX `openStors_date_idx` ON `openStors` (`date`);--> statement-breakpoint
CREATE TABLE `plan` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`shopUuid` text NOT NULL,
	`sum` real NOT NULL
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text,
	`group_x` integer NOT NULL,
	`parentUuid` text
);
--> statement-breakpoint
CREATE TABLE `salary_bonus` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text DEFAULT 'CURRENT_TIMESTAMP',
	`salary` integer NOT NULL,
	`bonus` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `salaryData` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`shopUuid` text NOT NULL,
	`employeeUuid` text NOT NULL,
	`bonusAccessories` integer NOT NULL,
	`dataPlan` integer NOT NULL,
	`salesDataVape` integer NOT NULL,
	`bonusPlan` integer NOT NULL,
	`totalBonus` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `schedule` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`shopUuid` text NOT NULL,
	`employeeUuid` text,
	`date` text NOT NULL,
	`shiftType` text
);
--> statement-breakpoint
CREATE INDEX `idx_schedule_shopUuid` ON `schedule` (`shopUuid`);--> statement-breakpoint
CREATE INDEX `idx_schedule_date` ON `schedule` (`date`);--> statement-breakpoint
CREATE TABLE `shopProduct` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`shopId` text NOT NULL,
	`uuid` text NOT NULL,
	`product_group` integer NOT NULL,
	`parentUuid` text,
	`name` text
);
--> statement-breakpoint
CREATE INDEX `idx_shopProduct_shopId` ON `shopProduct` (`shopId`);--> statement-breakpoint
CREATE INDEX `idx_shopProduct_uuid` ON `shopProduct` (`uuid`);