import { Global, Module } from '@nestjs/common';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { EmailLinks } from './email-links.js';
import { createSmtpTransport, MAIL_TRANSPORT } from './mail-transport.js';
import { NotificationProcessor } from './notification-processor.service.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';

@Global()
@Module({
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationProcessor,
    EmailLinks,
    {
      provide: MAIL_TRANSPORT,
      inject: [ENV],
      useFactory: (env: Env) => createSmtpTransport(env),
    },
  ],
  exports: [NotificationsService, NotificationProcessor, EmailLinks],
})
export class NotificationsModule {}
