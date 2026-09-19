import { Column, Entity, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Category } from './category.orm-entity';
import { ProductVariant } from './product-variant.orm-entity';

@Entity('products')
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  name!: string;

  @Column({ type: 'text' })
  description!: string;

  /** Price in cents: a `decimal` column comes back as a string and brings rounding along. */
  @Column({ type: 'int' })
  priceCents!: number;

  @ManyToOne(() => Category, (category) => category.products, { nullable: false })
  category!: Category;

  @OneToMany(() => ProductVariant, (variant) => variant.product)
  variants!: ProductVariant[];
}
