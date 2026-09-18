import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ProductVariant } from '../catalog/entities/product-variant.orm-entity';
import { CreateMovementDto } from './dto/create-movement.dto';
import { StockMovement } from './entities/stock-movement.orm-entity';
import { MovementReason } from './movement-reason.enum';

export interface MovementView {
  id: number;
  sku: string;
  quantity: number;
  reason: MovementReason;
  resultingStock: number;
  createdAt: Date;
}

export interface StockView {
  sku: string;
  stock: number;
}

@Injectable()
export class StockService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(ProductVariant)
    private readonly variants: Repository<ProductVariant>,
    @InjectRepository(StockMovement)
    private readonly movements: Repository<StockMovement>,
  ) {}

  /**
   * Applies the movement and records it. Both things happen in one transaction,
   * so the stock of the variant and its history can never disagree.
   */
  async registerMovement(dto: CreateMovementDto): Promise<MovementView> {
    return this.dataSource.transaction(async (manager): Promise<MovementView> => {
      const variant = await manager.findOne(ProductVariant, { where: { sku: dto.sku } });

      if (variant === null) {
        throw new NotFoundException(`No existe una variante con el SKU "${dto.sku}"`);
      }

      // Conditional update: the database itself refuses to leave the stock below
      // zero, so two concurrent requests cannot oversell the same variant.
      const result = await manager
        .createQueryBuilder()
        .update(ProductVariant)
        .set({ stock: (): string => 'stock + :quantity' })
        .where('id = :id AND stock + :quantity >= 0')
        .setParameters({ id: variant.id, quantity: dto.quantity })
        .execute();

      // Anything other than exactly one updated row means the movement was not
      // applied, so nothing may be recorded.
      if (result.affected !== 1) {
        const current = await manager.findOneOrFail(ProductVariant, { where: { id: variant.id } });

        throw new ConflictException(
          `Stock insuficiente para el SKU "${dto.sku}": ` +
            `hay ${current.stock} unidades y se intentan sacar ${Math.abs(dto.quantity)}`,
        );
      }

      const updated = await manager.findOneOrFail(ProductVariant, { where: { id: variant.id } });

      // Only the id of the variant is linked: the object read above still holds
      // the old stock and must never be written back.
      const movement = await manager.save(
        manager.create(StockMovement, {
          variant: { id: variant.id },
          quantity: dto.quantity,
          reason: dto.reason,
          resultingStock: updated.stock,
        }),
      );

      return this.toMovementView(movement, variant.sku);
    });
  }

  async getAvailableStock(sku: string): Promise<StockView> {
    const variant = await this.findVariantOrFail(sku);

    return { sku: variant.sku, stock: variant.stock };
  }

  async getHistory(sku: string): Promise<MovementView[]> {
    const variant = await this.findVariantOrFail(sku);

    const movements = await this.movements.find({
      where: { variant: { id: variant.id } },
      order: { id: 'DESC' },
    });

    return movements.map((movement) => this.toMovementView(movement, variant.sku));
  }

  private async findVariantOrFail(sku: string): Promise<ProductVariant> {
    const variant = await this.variants.findOne({ where: { sku } });

    if (variant === null) {
      throw new NotFoundException(`No existe una variante con el SKU "${sku}"`);
    }

    return variant;
  }

  private toMovementView(movement: StockMovement, sku: string): MovementView {
    return {
      id: movement.id,
      sku,
      quantity: movement.quantity,
      reason: movement.reason,
      resultingStock: movement.resultingStock,
      createdAt: movement.createdAt,
    };
  }
}
