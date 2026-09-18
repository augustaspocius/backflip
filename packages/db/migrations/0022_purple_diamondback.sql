CREATE TABLE "card_state" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"cardId" text NOT NULL,
	"due" timestamp NOT NULL,
	"stability" real NOT NULL,
	"difficulty" real NOT NULL,
	"scheduledDays" integer NOT NULL,
	"learningSteps" integer DEFAULT 0 NOT NULL,
	"reps" integer DEFAULT 0 NOT NULL,
	"lapses" integer DEFAULT 0 NOT NULL,
	"state" integer DEFAULT 0 NOT NULL,
	"lastReviewAt" timestamp
);
--> statement-breakpoint
CREATE TABLE "review_log" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"cardId" text NOT NULL,
	"rating" integer NOT NULL,
	"state" integer NOT NULL,
	"stability" real NOT NULL,
	"difficulty" real NOT NULL,
	"scheduledDays" integer NOT NULL,
	"reviewedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "card_state" ADD CONSTRAINT "card_state_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_state" ADD CONSTRAINT "card_state_cardId_card_id_fk" FOREIGN KEY ("cardId") REFERENCES "public"."card"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_log" ADD CONSTRAINT "review_log_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_log" ADD CONSTRAINT "review_log_cardId_card_id_fk" FOREIGN KEY ("cardId") REFERENCES "public"."card"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "card_state_user_card_idx" ON "card_state" USING btree ("userId","cardId");--> statement-breakpoint
CREATE INDEX "card_state_user_due_idx" ON "card_state" USING btree ("userId","due");--> statement-breakpoint
CREATE INDEX "review_log_user_reviewed_idx" ON "review_log" USING btree ("userId","reviewedAt");