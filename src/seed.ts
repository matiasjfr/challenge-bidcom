import { AppDataSource } from './data-source';
import { Category } from './catalog/entities/category.orm-entity';
import { Product } from './catalog/entities/product.orm-entity';
import { ProductVariant } from './catalog/entities/product-variant.orm-entity';

/**
 * Sample catalog so the stock endpoints can be tried out right away.
 * Running it twice does not duplicate anything.
 */
async function seed(): Promise<void> {
  await AppDataSource.initialize();
  // The app runs with `synchronize: true`, but the seed may run on an empty
  // database before the app has ever started.
  await AppDataSource.synchronize();

  const variants = AppDataSource.getRepository(ProductVariant);

  if ((await variants.count()) > 0) {
    console.log('La base ya tiene datos, no se inserta nada.');
    await AppDataSource.destroy();
    return;
  }

  const category = await AppDataSource.getRepository(Category).save({ name: 'Calzado' });

  const product = await AppDataSource.getRepository(Product).save({
    name: 'Zapatilla Runner',
    description: 'Zapatilla liviana para running en asfalto.',
    priceCents: 8999900,
    category,
  });

  await variants.save([
    { sku: 'ZAP-42-NEG', name: '42 / Negro', stock: 10, product },
    { sku: 'ZAP-43-NEG', name: '43 / Negro', stock: 0, product },
  ]);

  console.log('Datos de ejemplo creados:');
  console.log('  ZAP-42-NEG  stock 10');
  console.log('  ZAP-43-NEG  stock 0   (para probar el caso de stock insuficiente)');

  await AppDataSource.destroy();
}

void seed().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
