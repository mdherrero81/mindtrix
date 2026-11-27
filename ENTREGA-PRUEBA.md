# Descarga directa en modo de prueba

1. Configurá los bindings `ENTREGAS` (D1) y `GUIAS` (R2 privado) en el Worker `mindtrix-prueba`. Aplicá `entrega.sql` a D1.
2. En R2 cargá `robotica-casera.pdf` y `ciencia-y-arte-en-casa.pdf`.
3. Conservá el Access Token de prueba como secreto `MP_TEST_ACCESS_TOKEN` y desplegá esta rama en el Worker de prueba.
4. Iniciá una compra simulada, volvé al carrito y comprobá que aparezca el botón de descarga cuando Mercado Pago acredite el pedido.

Mindtrix verifica el pedido con la API de Mercado Pago. Los enlaces vencen siete días después de la primera confirmación en la tienda. El navegador conserva las descargas del último pedido. Un comprador puede guardar sus enlaces antes de cerrar la pestaña.
