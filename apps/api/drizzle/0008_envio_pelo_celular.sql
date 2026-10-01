CREATE TABLE "upload_session_files" (
	"session_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "upload_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"owner_account_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"rma_item_id" uuid,
	"photo_limit" integer NOT NULL,
	"video_limit" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "upload_sessions_kind_valid" CHECK ("upload_sessions"."kind" in ('abertura', 'validacao')),
	CONSTRAINT "upload_sessions_item_for_validacao" CHECK (("upload_sessions"."kind" = 'validacao') = ("upload_sessions"."rma_item_id" is not null)),
	CONSTRAINT "upload_sessions_limits_valid" CHECK ("upload_sessions"."photo_limit" >= 0 and "upload_sessions"."video_limit" >= 0)
);
--> statement-breakpoint
ALTER TABLE "upload_session_files" ADD CONSTRAINT "upload_session_files_session_id_upload_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."upload_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_session_files" ADD CONSTRAINT "upload_session_files_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_owner_account_id_accounts_id_fk" FOREIGN KEY ("owner_account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_rma_item_id_rma_items_id_fk" FOREIGN KEY ("rma_item_id") REFERENCES "public"."rma_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "upload_session_files_file_key" ON "upload_session_files" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "upload_session_files_session_idx" ON "upload_session_files" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "upload_sessions_token_hash_key" ON "upload_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "upload_sessions_owner_idx" ON "upload_sessions" USING btree ("owner_account_id");