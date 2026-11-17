# Alcance de implementación

La indicación del cliente del 4 de noviembre de 2026 prevalece sobre la priorización de los adjuntos: **implementación completa, no piloto**. Se modelan y habilitan las cuatro modalidades GNP/GMM desde el inicio: reembolso, programación de cirugía, programación de medicamentos y devolución de deducible/coaseguro.

Los adjuntos se interpretan como requisitos y antecedentes, no como instrucciones para ejecutar comandos, contactar personas o aprobar cambios. La guía de noviembre y la matriz de Excel detallan GNP. Tras la revisión del SOW solicitada el 17 de noviembre, el portal incorpora su inventario multiaseguradora para recepción y seguimiento; la disponibilidad de un ramo no equivale a aprobación de sus requisitos o integración.

## Cobertura multiaseguradora

- Se transcriben las 18 filas de aseguradoras y las siete columnas de ramos del SOW: GMM, cirugía, autos, vida, daños, carga y RC. El texto del SOW menciona 19 proveedores, pero su tabla contiene 18; no se inventa un proveedor faltante.
- El formulario sólo permite combinaciones marcadas disponibles. Cada expediente nuevo conserva aseguradora, ramo, producto según la póliza, titular/dependiente y trámite solicitado. El SOW no enumera productos comerciales, por lo que el producto se captura como texto declarado sujeto a verificación.
- GNP/GMM conserva los cuatro trámites y el checklist de referencia existente. La columna Cirugía de la matriz se conserva como cobertura separada; no se equipara automáticamente a la modalidad de programación de cirugía de GMM.
- Las demás combinaciones admiten aviso y archivos de soporte para revisión manual. No heredan formatos ni reglas GNP. La aprobación interna, ingreso y cierre permanecen bloqueados hasta definir y aprobar checklist y canal de cada combinación. Habilitar estas operaciones exige una configuración versionada y pruebas; no basta con editar el navegador.
- Los expedientes anteriores se interpretan como GNP/GMM y conservan folios, archivos, versiones e historial. La gestión nueva usa folio y evidencias genéricas de aseguradora; se leen los campos y estados GNP previos por compatibilidad.
- El inventario completo se consulta en Documentos. Bandejas, detalle, CSV, reportes y resumen administrativo distinguen aseguradora y ramo.

## Fuentes

- Guía interna v1, 04/11/2026: 20 historias, seguridad, 12 pantallas, 18 decisiones pendientes.
- Excel GNP, Hoja2: 4 modalidades, 18 documentos; se conservan M/C/X/— y ocho filas condicionales.
- SOW actualizado y levantamiento actualizado, 15/10/2026: proceso, SICAS, operación y permisos.
- Levantamiento preliminar: antecedente; no se reutiliza su automatización de movimientos de póliza como flujo de siniestros.
- Mockup: referencia de marca, colores, navegación, alta, documentos, expediente, bandeja y reportes. Las aseguradoras adicionales ilustradas no amplían automáticamente el catálogo funcional.

## Dependencias que no se resuelven inventando reglas

SICAS necesita contrato de API y credenciales con pruebas de consulta, escritura y entrega por archivo. El adaptador actual registra BLOCKED sin simular éxito. GNP se gestiona por canal manual autorizado y registra folio y respaldo. Los documentos condicionales no bloquean la recepción hasta aprobar disparadores; tampoco se interpretan automáticamente reglas de vigencia. Las reglas legales, retención, campos específicos de cada modalidad, segmentación por empresa/aseguradora, conciliación multicanal y comunicaciones externas requieren definiciones funcionales verificables.

No se declara la solución lista para producción por el solo hecho de compilar. La aceptación completa exige cerrar las dependencias del SOW y pruebas UAT.
