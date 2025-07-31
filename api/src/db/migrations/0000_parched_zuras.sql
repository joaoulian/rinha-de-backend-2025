CREATE TYPE "public"."processor" AS ENUM('default', 'fallback');--> statement-breakpoint
CREATE TABLE "payments" (
	"correlation_id" text PRIMARY KEY NOT NULL,
	"amount_in_cents" integer NOT NULL,
	"requested_at" timestamp NOT NULL,
	"processor" "processor",
	"created_at" timestamp DEFAULT now() NOT NULL
);
