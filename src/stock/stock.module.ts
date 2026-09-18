import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatalogModule } from '../catalog/catalog.module';
import { StockMovement } from './entities/stock-movement.orm-entity';
import { StockController } from './stock.controller';
import { StockService } from './stock.service';

@Module({
  imports: [CatalogModule, TypeOrmModule.forFeature([StockMovement])],
  controllers: [StockController],
  providers: [StockService],
})
export class StockModule {}
