import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';

dotenv.config();

const isSQLite = process.env.DB_TYPE === 'sqlite' || !process.env.DB_TYPE;

export const AppDataSource = new DataSource(
  isSQLite
    ? {
        type: 'sqlite',
        database: process.env.DB_DATABASE ?? 'database.sqlite',
        entities: ['src/**/*.orm-entity.ts'],
        migrations: ['src/**/migrations/*.ts'],
        synchronize: false,
      }
    : {
        type: 'postgres',
        host: process.env.DB_HOST ?? 'localhost',
        port: parseInt(process.env.DB_PORT ?? '5432', 10),
        username: process.env.DB_USERNAME ?? 'postgres',
        password: process.env.DB_PASSWORD ?? 'postgres',
        database: process.env.DB_DATABASE ?? 'ecommerce_challenge',
        entities: ['src/**/*.orm-entity.ts'],
        migrations: ['src/**/migrations/*.ts'],
        synchronize: false,
      },
);
