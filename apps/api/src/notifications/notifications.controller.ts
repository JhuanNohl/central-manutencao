import {
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  listNotificationsQuerySchema,
  type ListNotificationsQuery,
} from '@central/contracts';
import { validate } from '../common/http/zod-validation.pipe.js';
import type { AuthContext } from '../identity/auth-context.js';
import { CurrentAuth, RequirePermissions } from '../identity/decorators.js';
import { NotificationsService } from './notifications.service.js';

@Controller('admin/notifications')
@RequirePermissions('notifications.manage')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(
    @Query(validate(listNotificationsQuerySchema))
    query: ListNotificationsQuery,
  ) {
    return this.notifications.list(query);
  }

  @Post(':id/retry')
  @HttpCode(200)
  retry(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.notifications.retry(id, auth.account.id);
  }
}
