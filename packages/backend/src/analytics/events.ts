export const APP_EVENT_NAMES = [
	"screen_open",
	"screen_close",
	"report_run_started",
	"report_run_success",
	"report_run_failed",
	"open_store_started",
	"open_store_success",
	"open_store_failed",
	"deadstock_save_started",
	"deadstock_save_success",
	"deadstock_save_failed",
	"api_request_failed",
	"telegram_digest_sent",
	"telegram_digest_failed",
	"onec_prices_imported",
	"auth_guest_login",
	"auth_webapp_verified",
] as const;

export type AppEventName = (typeof APP_EVENT_NAMES)[number];
