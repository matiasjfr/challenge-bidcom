# Diseño de la solución

Este documento explica cómo entendí el problema, cómo quedó armado el sistema y por qué tomé cada
decisión. Para correr y probar la solución está [pruebas.md](pruebas.md).

## Cómo entendí el problema

El enunciado pide un solo endpoint obligatorio, `POST /stock/movimientos`, pero lo que realmente
define la solución son tres reglas que están entre líneas:

1. **La variante es la unidad que tiene stock**, no el producto. Un producto agrupa variantes que
   comparten nombre, descripción y precio; cada variante tiene su propio SKU y su propio stock.
2. **Todo cambio de stock queda registrado.** No alcanza con guardar un número: hay que poder decir
   cuándo se movió, cuánto y por qué. Eso es un registro histórico que solo crece.
3. **El stock nunca puede quedar en negativo.** Si una salida no tiene respaldo en unidades
   disponibles, la operación no se hace.

La tercera regla es la más delicada, porque no es solo una validación: si dos pedidos llegan al
mismo tiempo sobre la última unidad, los dos pueden ver "hay stock" y los dos pueden descontar. La
solución tiene que impedir eso, y más abajo explico cómo lo resolví y cómo lo probé.

## Modelo de datos

```
Category  1 ──── n  Product  1 ──── n  ProductVariant  1 ──── n  StockMovement
```

| Tabla | Campos |
| --- | --- |
| `categories` | `id`, `name` |
| `products` | `id`, `name`, `description`, `priceCents`, `categoryId` |
| `product_variants` | `id`, `sku` (único), `name`, `stock`, `productId` |
| `stock_movements` | `id`, `variantId`, `quantity`, `reason`, `resultingStock`, `createdAt` |

Los archivos están en [src/catalog/entities/](../src/catalog/entities/) y
[src/stock/entities/](../src/stock/entities/).

La separación en dos módulos sigue la división natural del dominio: `catalog` es dueño de qué se
vende, `stock` es dueño de cuánto hay y de la historia de cómo llegó a ese número. `catalog` no
conoce a `stock`; la dependencia va en una sola dirección.

## Qué base de datos uso

**Elijo PostgreSQL.** El enunciado deja elegir entre PostgreSQL y SQLite, y el boilerplate venía
preparado para las dos; dejé una sola, para que el proyecto no tenga dos caminos que mantener.

La razón de la elección es el dominio, no el gusto. El problema central acá es que dos personas
pueden pelearse por la misma unidad al mismo tiempo, y toda la solución está pensada alrededor de
eso. SQLite no lo aguanta: su driver abre una sola conexión, así que dos movimientos simultáneos
chocan entre ellos y el segundo falla con `cannot start a transaction within a transaction`. Lo
probé antes de decidir: con SQLite, de diez pedidos a la vez uno moría con error `500` en lugar de
recibir su respuesta. Los datos quedaban bien —la transacción los protege igual— pero es una base
que no soporta el caso que este sistema tiene que resolver todos los días.

Elegir la base que no puede correr la prueba más importante del diseño no tenía sentido, así que la
elección es PostgreSQL, que además ya venía listo en el `docker-compose.yml` del repo. El costo es
que hace falta Docker para levantarlo, y es un comando.

## Endpoints

### `POST /stock/movimientos`

Registra un movimiento y deja el stock de la variante actualizado.

```json
{ "sku": "ZAP-42-NEG", "quantity": -2, "reason": "PURCHASE" }
```

Responde `201` con el movimiento registrado y el stock que quedó:

```json
{
  "id": 7,
  "sku": "ZAP-42-NEG",
  "quantity": -2,
  "reason": "PURCHASE",
  "resultingStock": 8,
  "createdAt": "2026-09-18T20:32:15.000Z"
}
```

Errores:

| Situación | Código |
| --- | --- |
| El body no cumple las reglas (cantidad cero, motivo inválido, campo de más) | `400` |
| El SKU no existe | `404` |
| La salida deja el stock en negativo | `409` |

### `GET /stock/:sku`

Devuelve el stock disponible: `{ "sku": "ZAP-42-NEG", "stock": 8 }`. El enunciado dice que el
sistema siempre tiene que poder responder cuánto stock hay, así que me pareció necesario que esa
respuesta exista como endpoint y no solo como dato interno.

### `GET /stock/:sku/movimientos`

Devuelve el historial de la variante, del más nuevo al más viejo. No lo pide el enunciado, pero es
lo que hace visible que el registro de movimientos existe y sirve para revisar que el stock y su
historia coinciden.

## Decisiones

### La cantidad lleva signo

El body tiene un solo campo `quantity`: positivo suma unidades, negativo las resta. Cero no se
acepta porque no es un movimiento.

Las otras dos formas que consideré:

- **Cantidad siempre positiva más un campo `type` (entrada / salida).** Es más explícito de leer,
  pero agrega un campo que hay que validar contra el motivo: nada impide mandar "entrada" con motivo
  "compra del cliente", así que aparece una regla de coherencia extra que hay que escribir y
  mantener.
- **Que el motivo defina la dirección** (compra resta, devolución suma). Funciona hasta que aparece
  el ajuste manual, que tiene que poder ir en las dos direcciones. Ese motivo quedaría como una
  excepción a la regla, y las excepciones a la regla son las que después generan bugs.

Con el signo en la cantidad, el motivo es solo una etiqueta del porqué y el ajuste manual no
necesita ningún tratamiento especial. Además el stock queda definido de forma muy simple: es la
suma de todos los movimientos de la variante, y esa propiedad se puede verificar en cualquier
momento (lo uso como chequeo final en [pruebas.md](pruebas.md)).

Los motivos aceptados están en [movement-reason.enum.ts](../src/stock/movement-reason.enum.ts):
`PURCHASE` (compra del cliente), `RETURN` (devolución), `RESTOCK` (llegó mercadería) y `ADJUSTMENT`
(corrección manual, por ejemplo después de un conteo físico).

### El stock vive en una columna, no se calcula cada vez

La variante tiene una columna `stock` que se actualiza en la misma transacción que inserta el
movimiento.

La alternativa era no guardarlo y calcularlo siempre con una suma sobre los movimientos. Tiene una
ventaja real: es imposible que el número se desincronice, porque no hay dos lugares donde viva la
verdad. Pero cada consulta de stock pasa a costar una agregación que crece con el historial, y la
consulta de stock es justamente la más frecuente de todas: se hace cada vez que alguien mira un
producto o intenta agregarlo al carrito.

Guardarlo en una columna hace que leer el stock sea una consulta directa, y el riesgo de que se
desincronice se elimina con la transacción: el movimiento y el descuento se guardan juntos o no se
guarda ninguno de los dos.

### El stock negativo lo impide la base, no un `if`

Esta es la parte más importante. La forma intuitiva de resolverlo sería:

```ts
if (variant.stock + quantity < 0) throw new ConflictException();
variant.stock += quantity;
await repository.save(variant);
```

Eso está mal cuando hay pedidos simultáneos. Dos pedidos por la última unidad pueden leer el mismo
stock, los dos pasan el `if`, y los dos descuentan. El resultado es stock negativo o una unidad
vendida dos veces.

Lo resolví con un update condicional, en
[stock.service.ts](../src/stock/stock.service.ts):

```sql
UPDATE product_variants
   SET stock = stock + :quantity
 WHERE id = :id AND stock + :quantity >= 0
```

La condición y el descuento son una sola operación de la base, así que no hay hueco entre leer y
escribir. Si la fila no se actualizó (`affected === 0`), es porque no había stock suficiente, y ahí
devuelvo `409`. La variante ya se buscó antes, así que ese es el único motivo posible.

Consideré también el bloqueo pesimista (`SELECT ... FOR UPDATE`), que resuelve lo mismo. Lo descarté
porque el update condicional hace el trabajo con una sola consulta, no necesita configuración extra
y mantiene la fila bloqueada menos tiempo: el bloqueo dura lo que dura el update, en vez de
extenderse desde la lectura hasta el final de la transacción.

**Cómo lo probé.** Con PostgreSQL, sobre una variante con 10 unidades, mandé 10 pedidos simultáneos
de 2 unidades cada uno. El resultado fue exactamente 5 respuestas `201` y 5 respuestas `409`, stock
final 0, y 5 movimientos en el historial que suman -10. Sin esta decisión, el resultado habría sido
stock negativo. El paso a paso está en [pruebas.md](pruebas.md).

### Todo el movimiento pasa por una transacción

`registerMovement` corre dentro de `dataSource.transaction(...)`: busca la variante, aplica el
update condicional, relee el stock resultante e inserta el movimiento. Si algo falla en el medio, no
queda ni el descuento ni el registro.

El flujo entero vive en un solo servicio porque es una sola responsabilidad: registrar un
movimiento. Partirlo en un servicio de catálogo más uno de stock obligaría a pasar el objeto de la
transacción entre servicios para que las dos escrituras sigan siendo atómicas, que es más código
para exactamente el mismo resultado.

### El movimiento guarda el stock que quedó

`resultingStock` guarda cuánto stock quedó después de aplicar ese movimiento. El valor ya está
disponible dentro de la transacción, así que no cuesta nada, y hace que el historial se lea solo sin
tener que ir sumando fila por fila. Para una tabla de auditoría es información que se agradece.

### Detalles más chicos

- **El precio se guarda en centavos** (`priceCents`, entero). TypeORM devuelve las columnas
  `decimal` de PostgreSQL como texto, así que el código terminaría convirtiendo de un lado a otro, y
  los decimales traen redondeo. Con enteros las dos cosas desaparecen.
- **La variante tiene un `name` libre** ("42 / Negro") en lugar de columnas `size` y `color`. El
  enunciado usa zapatillas como ejemplo, pero un ecommerce vende cosas que se diferencian por otras
  cosas. Si más adelante hace falta filtrar por talle, el paso siguiente es una columna de atributos
  en JSON, no columnas fijas.
- **El id del movimiento es un número secuencial**, mientras que el resto usa UUID. Es a propósito:
  dos movimientos pueden compartir la marca de tiempo, así que ordenar por fecha no garantiza un
  orden estable. El id secuencial ordena el historial sin ambigüedad y no depende de la precisión
  del reloj, que es lo que uno espera de un registro que solo crece.
- **El motivo se guarda como enum de PostgreSQL**, que deja la lista de valores en la base y no solo
  en el código.
- **La validación del body** está en [create-movement.dto.ts](../src/stock/dto/create-movement.dto.ts)
  con `class-validator`. El `ValidationPipe` global ya venía configurado con `whitelist` y
  `forbidNonWhitelisted`, así que un campo de más también se rechaza.
- **La cantidad tiene un tope de un millón de unidades** por movimiento. No es un número de negocio
  elegido al azar: la columna `stock` es un entero de 4 bytes, que en PostgreSQL no pasa de
  2.147.483.647. Sin el tope, una cantidad más grande que eso fallaba dentro de la base y salía como
  `500`, cuando en realidad es un dato inválido que se tiene que rechazar antes de tocar la base.
  Un millón deja muchísimo margen para cualquier movimiento real y mantiene los números lejos del
  límite técnico. Lo encontré probando casos borde, no leyendo el código.

## Sobre las migraciones

La aplicación arranca con `synchronize: true`, que es como viene el boilerplate: TypeORM crea las
tablas a partir de las entidades. Para un challenge es lo cómodo, porque `npm run seed` y
`npm run start:dev` funcionan sobre una base vacía sin pasos previos.

En un proyecto real esto no va a producción: se apaga `synchronize` y se generan migraciones, cuyos
scripts ya están en el `package.json` (`migration:generate`, `migration:run`, `migration:revert`) y
apuntan a [data-source.ts](../src/data-source.ts), que ya tiene `synchronize: false`. Preferí no
agregar la migración inicial para no tener dos mecanismos haciendo lo mismo en un repo de este
tamaño.

## Qué dejé afuera y por qué

- **ABM de catálogo por HTTP.** Para probar el endpoint hace falta que existan variantes, pero eso
  se resuelve con el script de datos de ejemplo. Un CRUD completo de categorías, productos y
  variantes es bastante código que el enunciado no pide y que no agrega nada sobre el problema de
  stock.
- **Carrito.** El enunciado lo menciona como contexto: "cuando un cliente intenta agregar una
  variante al carrito, el sistema verifica si hay stock disponible". Esa verificación es exactamente
  la regla que ya está implementada y que devuelve `409`. Modelar el carrito en sí es otro dominio.
- **Reserva de stock.** En un ecommerce de verdad, agregar al carrito no descuenta stock: lo
  reserva por un rato y lo libera si la compra no se concreta. Eso implica un estado intermedio y un
  proceso que vence reservas. Es el paso siguiente natural, pero es un problema aparte del que pide
  el enunciado.
- **Tests automatizados.** Decisión explícita de alcance. En [pruebas.md](pruebas.md) está cada caso
  con el comando para reproducirlo a mano, incluida la prueba de concurrencia. Si esto siguiera, lo
  primero que escribiría es un test de integración del endpoint con los cuatro casos, y muy
  especialmente el de pedidos simultáneos, porque es el que se rompe sin que nadie se dé cuenta.
