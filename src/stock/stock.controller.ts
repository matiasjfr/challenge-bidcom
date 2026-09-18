import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CreateMovementDto } from './dto/create-movement.dto';
import { StockService, type MovementView, type StockView } from './stock.service';

@Controller('stock')
export class StockController {
  constructor(private readonly stockService: StockService) {}

  @Post('movimientos')
  createMovement(@Body() dto: CreateMovementDto): Promise<MovementView> {
    return this.stockService.registerMovement(dto);
  }

  @Get(':sku')
  getStock(@Param('sku') sku: string): Promise<StockView> {
    return this.stockService.getAvailableStock(sku);
  }

  @Get(':sku/movimientos')
  getHistory(@Param('sku') sku: string): Promise<MovementView[]> {
    return this.stockService.getHistory(sku);
  }
}
