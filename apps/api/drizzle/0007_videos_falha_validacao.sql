CREATE TABLE "rma_validation_videos" (
	"item_id" uuid PRIMARY KEY NOT NULL,
	"file_id" uuid NOT NULL,
	"recorded_by_account_id" uuid NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "files" DROP CONSTRAINT "files_purpose_valid";--> statement-breakpoint
ALTER TABLE "files" DROP CONSTRAINT "files_content_type_valid";--> statement-breakpoint
ALTER TABLE "rma_items" ADD COLUMN "video_file_id" uuid;--> statement-breakpoint
ALTER TABLE "rma_validation_videos" ADD CONSTRAINT "rma_validation_videos_item_id_rma_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."rma_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rma_validation_videos" ADD CONSTRAINT "rma_validation_videos_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rma_validation_videos" ADD CONSTRAINT "rma_validation_videos_recorded_by_account_id_accounts_id_fk" FOREIGN KEY ("recorded_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "rma_validation_videos_file_key" ON "rma_validation_videos" USING btree ("file_id");--> statement-breakpoint
ALTER TABLE "rma_items" ADD CONSTRAINT "rma_items_video_file_id_files_id_fk" FOREIGN KEY ("video_file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "rma_items_video_file_key" ON "rma_items" USING btree ("video_file_id");--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_purpose_valid" CHECK ("files"."purpose" in ('foto_item', 'video_item', 'video_validacao', 'nota_xml', 'declaracao'));--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_content_type_valid" CHECK ("files"."content_type" in ('image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm', 'application/pdf', 'application/xml'));