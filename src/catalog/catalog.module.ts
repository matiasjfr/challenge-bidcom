import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Category } from './entities/category.orm-entity';
import { Product } from './entities/product.orm-entity';
import { ProductVariant } from './entities/product-variant.orm-entity';

@Module({
  imports: [TypeOrmModule.forFeature([Category, Product, ProductVariant])],
  exports: [TypeOrmModule],
})
export class CatalogModule {}
