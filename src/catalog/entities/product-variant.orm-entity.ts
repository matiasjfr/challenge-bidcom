import { Column, Entity, Index, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Product } from './product.orm-entity';

/**
 * The unit that actually holds stock: a specific size/colour of a product.
 * `stock` is kept up to date by the stock module, always inside the same
 * transaction that records the movement.
 */
@Entity('product_variants')
export class ProductVariant {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column()
  sku!: string;

  /** Human readable description of the variant, e.g. "42 / Negro". */
  @Column()
  name!: string;

  @Column({ type: 'int', default: 0 })
  stock!: number;

  @ManyToOne(() => Product, (product) => product.variants, { nullable: false })
  product!: Product;
}
