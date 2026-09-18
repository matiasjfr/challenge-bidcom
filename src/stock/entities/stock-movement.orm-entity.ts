import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ProductVariant } from '../../catalog/entities/product-variant.orm-entity';
import { MovementReason } from '../movement-reason.enum';

/**
 * Append only log of every stock change. Rows are never updated or deleted:
 * the full history of a variant can always be replayed from here.
 */
@Entity('stock_movements')
export class StockMovement {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @ManyToOne(() => ProductVariant, { nullable: false })
  variant!: ProductVariant;

  /** Signed, never zero: positive adds units, negative removes them. */
  @Column({ type: 'int' })
  quantity!: number;

  @Column({ type: 'simple-enum', enum: MovementReason })
  reason!: MovementReason;

  /** Stock of the variant right after this movement was applied. */
  @Column({ type: 'int' })
  resultingStock!: number;

  @CreateDateColumn()
  createdAt!: Date;
}
