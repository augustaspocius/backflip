CREATE INDEX "card_state_card_idx" ON "card_state" USING btree ("cardId");--> statement-breakpoint
CREATE INDEX "review_log_card_idx" ON "review_log" USING btree ("cardId");