import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { FilesService } from './files.service.js';

const CLEANUP_INTERVAL_MS = 3_600_000;

/** Remove de hora em hora os arquivos enviados e nunca vinculados (5.3). */
@Injectable()
export class TemporaryFilesCleaner
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(TemporaryFilesCleaner.name);
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<unknown> | undefined;

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly files: FilesService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.env.FILES_CLEANUP_ENABLED) return;
    this.timer = setInterval(() => {
      if (this.running) return;
      this.running = this.files
        .removeExpiredTemporary()
        .then((count) => {
          if (count > 0) this.logger.log(`Temporários removidos: ${count}`);
        })
        .catch((error: unknown) =>
          this.logger.error('Falha ao remover temporários', error as Error),
        )
        .finally(() => (this.running = undefined));
    }, CLEANUP_INTERVAL_MS);
  }

  async onApplicationShutdown(): Promise<void> {
    clearInterval(this.timer);
    await this.running;
  }
}
