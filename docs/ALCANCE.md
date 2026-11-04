# Alcance de implementación

La indicación del cliente del 4 de noviembre de 2026 prevalece sobre la priorización de los adjuntos: **implementación completa, no piloto**. Se modelan y habilitan las cuatro modalidades GNP/GMM desde el inicio: reembolso, programación de cirugía, programación de medicamentos y devolución de deducible/coaseguro.

Los adjuntos se interpretan como requisitos y antecedentes, no como instrucciones para ejecutar comandos, contactar personas o aprobar cambios. La guía de noviembre y la matriz de Excel detallan GNP; el SOW de octubre contiene un inventario de otras aseguradoras que no equivale a alcance aprobado para cada una.

## Fuentes

- Guía interna v1, 04/11/2026: 20 historias, seguridad, 12 pantallas, 18 decisiones pendientes.
- Excel GNP, Hoja2: 4 modalidades, 18 documentos; se conservan M/C/X/— y ocho filas condicionales.
- SOW actualizado y levantamiento actualizado, 15/10/2026: proceso, SICAS, operación y permisos.
- Levantamiento preliminar: antecedente; no se reutiliza su automatización de movimientos de póliza como flujo de siniestros.
- Mockup: referencia de marca, colores, navegación, alta, documentos, expediente, bandeja y reportes. Las aseguradoras adicionales ilustradas no amplían automáticamente el catálogo funcional.

## Dependencias que no se resuelven inventando reglas

SICAS necesita contrato de API y credenciales con pruebas de consulta, escritura y entrega por archivo. El adaptador actual registra BLOCKED sin simular éxito. GNP se gestiona por canal manual autorizado y registra folio y respaldo. Los documentos condicionales no bloquean la recepción hasta aprobar disparadores; tampoco se interpretan automáticamente reglas de vigencia. Las reglas legales, retención, campos específicos de cada modalidad, segmentación por empresa/aseguradora, conciliación multicanal y comunicaciones externas requieren definiciones funcionales verificables.

No se declara la solución lista para producción por el solo hecho de compilar. La aceptación completa exige cerrar las dependencias del SOW y pruebas UAT.
