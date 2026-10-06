import { Module } from '@nestjs/common';
import { CustomersController } from './customers.controller.js';
import { CustomersService } from './customers.service.js';
import { CustomerNotesService } from './customer-notes.service.js';

@Module({
  controllers: [CustomersController],
  providers: [CustomersService, CustomerNotesService],
  exports: [CustomersService],
})
export class CustomersModule {}
