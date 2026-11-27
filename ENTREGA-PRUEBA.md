# Entrega automática en modo de prueba

Esta rama usa el Worker `mindtrix-prueba`. El checkout funciona con el Access Token de prueba actual. La entrega se activa cuando estén configurados los dos recursos y las cuatro variables de abajo.

1. Creá una base D1 para pruebas y aplicá `entrega.sql`. Agregá a `wrangler.jsonc` el binding `ENTREGAS` en `d1_databases`, con el nombre y el ID de esa base.
2. Creá un bucket R2 **privado**. Agregá el binding `GUIAS` en `r2_buckets` con el nombre del bucket. Cargá el PDF de Robótica Casera como `robotica-casera.pdf` y el de Ciencia y arte en casa como `ciencia-y-arte-en-casa.pdf`.
3. En Resend, configurá un remitente autorizado. Guardá `RESEND_API_KEY` como secreto. Definí `ENTREGA_FROM` con el remitente y `ENTREGA_ORIGIN` con el origen HTTPS del Worker de prueba, sin ruta.
4. En Mercado Pago Developers, seleccioná **Prueba** en la configuración de **Webhooks**. Elegí el evento **Order (Mercado Pago)** y usá la ruta `/webhooks/mercado-pago` del Worker de prueba. Guardá la firma secreta como `MP_TEST_WEBHOOK_SECRET` en el Worker. Conservá `MP_TEST_ACCESS_TOKEN` como secreto.
5. Desplegá esta rama en el Worker de prueba. Confirmá que el carrito pida el correo y hacé una compra nueva de prueba. Verificá que llegue el mensaje y que el enlace descargue la guía correcta.

Los enlaces vencen a los siete días. Si falla un envío, Mercado Pago puede reenviar el evento. Resend deduplica reintentos del mismo pedido dentro de su ventana de idempotencia. Los pedidos creados antes de instalar esta versión quedan fuera de la entrega automática porque no tienen un correo registrado para este flujo.
