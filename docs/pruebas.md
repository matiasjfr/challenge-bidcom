# Cómo correr y probar

Las decisiones de diseño están explicadas en [diseno.md](diseno.md).

## Levantar el proyecto

```bash
npm install
cp .env.example .env
npm run seed        # crea los datos de ejemplo
npm run start:dev
```

El seed crea una categoría, un producto y dos variantes:

| SKU | Stock inicial | Para qué sirve |
| --- | --- | --- |
| `ZAP-42-NEG` | 10 | probar entradas y salidas |
| `ZAP-43-NEG` | 0 | probar el caso de stock insuficiente |

Correr el seed dos veces no duplica nada. Para empezar de cero, borrar `database.sqlite` y volver a
correrlo.

Verificar que la aplicación levantó:

```bash
curl http://localhost:3000/health
# {"status":"ok"}
```

## Los casos del endpoint

### Entrada de mercadería

```bash
curl -X POST localhost:3000/stock/movimientos -H 'Content-Type: application/json' \
  -d '{"sku":"ZAP-42-NEG","quantity":5,"reason":"RESTOCK"}'
```

```json
{"id":1,"sku":"ZAP-42-NEG","quantity":5,"reason":"RESTOCK","resultingStock":15,"createdAt":"..."}
```

### Salida por una compra

```bash
curl -X POST localhost:3000/stock/movimientos -H 'Content-Type: application/json' \
  -d '{"sku":"ZAP-42-NEG","quantity":-2,"reason":"PURCHASE"}'
```

```json
{"id":2,"sku":"ZAP-42-NEG","quantity":-2,"reason":"PURCHASE","resultingStock":13,"createdAt":"..."}
```

### Stock insuficiente → 409

```bash
curl -i -X POST localhost:3000/stock/movimientos -H 'Content-Type: application/json' \
  -d '{"sku":"ZAP-43-NEG","quantity":-1,"reason":"PURCHASE"}'
```

```json
{"message":"Stock insuficiente para el SKU \"ZAP-43-NEG\": hay 0 unidades y se intentan sacar 1",
 "error":"Conflict","statusCode":409}
```

El movimiento no se registra y el stock queda intacto.

### SKU que no existe → 404

```bash
curl -i -X POST localhost:3000/stock/movimientos -H 'Content-Type: application/json' \
  -d '{"sku":"NO-EXISTE","quantity":1,"reason":"RESTOCK"}'
```

```json
{"message":"No existe una variante con el SKU \"NO-EXISTE\"","error":"Not Found","statusCode":404}
```

### Body inválido → 400

Cantidad cero y motivo que no existe:

```bash
curl -i -X POST localhost:3000/stock/movimientos -H 'Content-Type: application/json' \
  -d '{"sku":"ZAP-42-NEG","quantity":0,"reason":"OTRO"}'
```

```json
{"message":["quantity should not be equal to 0",
            "reason must be one of the following values: PURCHASE, RETURN, RESTOCK, ADJUSTMENT"],
 "error":"Bad Request","statusCode":400}
```

Un campo que no está en el contrato también se rechaza:

```bash
curl -i -X POST localhost:3000/stock/movimientos -H 'Content-Type: application/json' \
  -d '{"sku":"ZAP-42-NEG","quantity":1,"reason":"RESTOCK","otro":"x"}'
# {"message":["property otro should not exist"],"error":"Bad Request","statusCode":400}
```

## Consultar el estado

```bash
curl localhost:3000/stock/ZAP-42-NEG
# {"sku":"ZAP-42-NEG","stock":13}

curl localhost:3000/stock/ZAP-42-NEG/movimientos
# historial completo, del más nuevo al más viejo
```

## Chequeo de coherencia

El stock de una variante tiene que ser siempre igual a la suma de sus movimientos. Con el servidor
arriba:

```bash
curl -s localhost:3000/stock/ZAP-42-NEG/movimientos | \
  node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log('suma:',JSON.parse(d).reduce((a,m)=>a+m.quantity,0)))"

curl -s localhost:3000/stock/ZAP-42-NEG
```

La suma más el stock inicial del seed (10) tiene que dar el stock actual. Si no da, el stock y su
historia se desincronizaron, que es exactamente lo que la transacción evita.

## Prueba de pedidos simultáneos

Esta es la prueba que justifica cómo se descuenta el stock, y **hay que hacerla contra
PostgreSQL**: el driver de SQLite usa una sola conexión y no soporta transacciones en paralelo (está
explicado en [diseno.md](diseno.md#limitación-conocida-de-sqlite)).

Levantar PostgreSQL:

```bash
docker compose up -d
```

Cambiar el `.env`:

```env
DB_TYPE=postgres
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_DATABASE=ecommerce_challenge
```

Sembrar y arrancar:

```bash
npm run seed
npm run start:dev
```

Con `ZAP-42-NEG` en 10 unidades, mandar 10 pedidos de 2 unidades al mismo tiempo. Solo 5 pueden
entrar:

```bash
for i in $(seq 1 10); do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST localhost:3000/stock/movimientos \
    -H 'Content-Type: application/json' \
    -d '{"sku":"ZAP-42-NEG","quantity":-2,"reason":"PURCHASE"}' &
done
wait

curl -s localhost:3000/stock/ZAP-42-NEG
```

Resultado esperado, y el que se obtiene:

```
201 201 201 201 201 409 409 409 409 409
{"sku":"ZAP-42-NEG","stock":0}
```

Cinco movimientos en el historial que suman -10, stock final 0 y ninguna unidad vendida de más. Sin
el update condicional, varios pedidos leerían el mismo stock y el número final quedaría en negativo.

## Antes de entregar

```bash
npm run typecheck
npm run lint
npm run build
```
