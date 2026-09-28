/**
 * Mirror Node REST API service layer.
 * All reads from Hedera (topic messages, schedules, transactions, accounts) live in `@sh/core/mirror`;
 * this module re-exports it so existing imports keep working.
 */
export * from "@sh/core/mirror";
