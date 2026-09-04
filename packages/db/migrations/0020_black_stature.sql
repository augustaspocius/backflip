CREATE TYPE "public"."school_role" AS ENUM('teacher', 'student');--> statement-breakpoint
CREATE TABLE "school_member" (
	"id" text PRIMARY KEY NOT NULL,
	"schoolId" text NOT NULL,
	"userId" text NOT NULL,
	"role" "school_role" NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "school" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "school_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "school_member" ADD CONSTRAINT "school_member_schoolId_school_id_fk" FOREIGN KEY ("schoolId") REFERENCES "public"."school"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_member" ADD CONSTRAINT "school_member_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "school_member_school_user_idx" ON "school_member" USING btree ("schoolId","userId");--> statement-breakpoint
CREATE INDEX "school_member_user_idx" ON "school_member" USING btree ("userId");
--> statement-breakpoint
INSERT INTO "school" ("id", "name", "slug")
VALUES (gen_random_uuid()::text, 'Default School', 'default')
ON CONFLICT ("slug") DO NOTHING;
