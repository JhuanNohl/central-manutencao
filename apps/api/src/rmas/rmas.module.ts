import { Module } from '@nestjs/common';
import { RmasController } from './rmas.controller.js';
import { RmasService } from './rmas.service.js';

/** Atendimentos: RMAs, itens e notas fiscais. */
@Module({
  controllers: [RmasController],
  providers: [RmasService],
})
export class RmasModule {}
