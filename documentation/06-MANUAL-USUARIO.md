# 06 — Manual de usuario
## Emergency Response System (ERS)

> Guía práctica por rol. Para instalar el sistema, ver el
> [`README.md`](../README.md) de la raíz del proyecto.

---

## Antes de empezar

El sistema se abre en **<http://localhost:4000>**. Necesitas una cuenta; el
administrador las crea. Si eres ciudadano puedes registrarte tú mismo desde la
pantalla de acceso.

Al entrar, cada rol va a una pantalla distinta:

| Rol | Adónde llega | Para qué |
|-----|--------------|----------|
| Ciudadano | Sus reportes | Reportar y hacer seguimiento |
| Personal de emergencia | Sus emergencias asignadas | Atender incidentes |
| Operador | Centro de control | Gestionar y despachar |
| Administrador | Centro de control | Todo lo anterior más administración |

**Consejo para cualquier rol:** el punto verde «En vivo» de la barra superior
indica que la pantalla se está actualizando sola. Si dice «Sin conexión»,
recarga la página.

---

# 👤 Ciudadano

Puedes usar el sistema desde el navegador del computador o, mejor, instalarlo
en el teléfono (ver [Instalar la app](#instalar-la-app-en-el-teléfono)).

## Reportar una emergencia

1. Abre **Reportar** en la barra inferior.
2. Toca el **tipo** de emergencia. Son siete y se distinguen por su icono.
3. Escribe un **título** corto y claro. Ejemplo: *«Choque entre dos motos»*.
   Debe tener al menos 5 caracteres.
4. En **descripción**, cuenta lo que ayuda al personal a prepararse: cuántas
   personas hay, si hay heridos, qué se ve.
5. La **ubicación** se toma sola. Si el recuadro está en rojo, toca
   *«Actualizar mi ubicación»* y acepta el permiso del navegador.
6. Añade **fotografías** si puedes: hasta cinco, desde la cámara o la galería.
7. Elige la **urgencia**. Si dudas, deja la que viene: el operador puede
   cambiarla al revisar el reporte.
8. Toca **Enviar reporte**.

Al enviar, pasas directo a la pantalla de seguimiento.

> **Sobre la ubicación.** Sin ella no se puede enviar el reporte: es lo que
> permite que el personal te encuentre. Si el GPS falla, escribe la dirección
> más exacta que puedas en el campo correspondiente.

## Usar el botón SOS

El botón rojo de la pantalla de inicio es para cuando **no hay tiempo de llenar
un formulario**.

1. **Mantén el dedo pulsado 2 segundos.** Verás una cuenta atrás.
2. Si lo sueltas antes, se cancela y no pasa nada.
3. Al completarse, el sistema toma tu ubicación y envía una alerta de prioridad
   **crítica** al centro de control.
4. Pasas automáticamente a la pantalla de seguimiento.

> **¿Por qué hay que mantenerlo pulsado?** Para que no se dispare solo dentro
> del bolsillo. Un toque accidental enviaría una falsa alarma.

> **Si el GPS falla**, el sistema te pregunta si quieres enviarlo igual y te
> lleva al formulario para que escribas la dirección. Un aviso sin coordenadas
> es mejor que ningún aviso.

## Seguir tu reporte

En **Mis reportes** ves todo lo que has enviado, con su estado. Al abrir uno
encuentras la línea de seguimiento:

```text
✓  Reportada                          01/09/2026, 07:57 p. m.
✓  Recibida en el centro de control   01/09/2026, 07:57 p. m.
●  Personal asignado                  En curso…
○  Personal atendiendo
○  Resuelta
```

La pantalla **se actualiza sola**: cuando el operador asigne personal o cambie
el estado, lo verás sin recargar, y el teléfono vibrará.

Debajo encontrarás el mapa con la ubicación exacta, tus fotografías y el
historial completo.

## Avisos

En **Avisos** está todo lo que ha pasado con tus reportes, aunque tuvieras el
teléfono apagado.

Para recibirlos también con la aplicación cerrada, toca **Activar** en
*«Avisos en el teléfono»*. El navegador te pedirá permiso.

> Si antes bloqueaste las notificaciones, el navegador **no volverá a
> preguntar**. Hay que activarlas en los ajustes del sitio.

## Instalar la app en el teléfono

Abre el sistema en Chrome desde el teléfono y toca **Instalar** en la franja
azul que aparece arriba, o usa el menú del navegador → *«Añadir a pantalla de
inicio»*.

> ⚠️ **Importante para la demostración.** La instalación solo funciona sobre
> HTTPS o `localhost`. Si entras por la dirección de red local
> (`192.168.x.x`), la app se ve pero **no se instala**. La forma más sencilla
> de resolverlo está explicada en el README, apartado *Instalarla en un
> teléfono Android*.

---

# 🚑 Personal de emergencia

## Ver tus emergencias

Al entrar llegas a **Emergencias**, que muestra únicamente **las que te han
asignado**. No verás las del resto de unidades.

Cada fila indica el tipo, la prioridad, el estado y hace cuánto se reportó. Las
que llevan la marca **SOS** en rojo tienen prioridad crítica.

## Atender una emergencia

1. Abre la emergencia desde el listado.
2. Revisa la ubicación en el mapa, las fotografías y el historial.
3. El teléfono del ciudadano aparece en la ficha por si necesitas llamarlo.
4. Cuando llegues al sitio, pulsa **Marcar en proceso**.
5. Usa **Registrar avance** para dejar constancia de lo que va ocurriendo.
   Todo queda en el historial con tu nombre y la hora.
6. Al terminar, pulsa **Resolver** y describe cómo se resolvió. Ese texto lo
   lee el ciudadano.

## Actualizar tu disponibilidad

En **Personal** puedes cambiar tu estado entre **Disponible**, **Ocupado** y
**Fuera de servicio**.

> El sistema **no te deja quedar libre** si tienes una emergencia sin cerrar.
> Primero hay que cerrarla o pedir al operador que retire la asignación.

---

# 👨‍💻 Operador

## El centro de control

El **Dashboard** es tu pantalla principal. Arriba, seis indicadores en vivo:
pendientes, en proceso, SOS activos, resueltas, personal disponible y tiempo
promedio de respuesta.

Debajo, las emergencias activas ordenadas por urgencia y el estado de cada
unidad. **Todo se actualiza solo**: cuando entra una emergencia nueva aparece
sin que recargues, y si es un SOS salta un aviso en rojo.

## Despachar una emergencia

1. Abre la emergencia desde el dashboard, el listado o el mapa.
2. Pulsa **Asignar personal**.
3. El sistema te muestra las unidades **disponibles ordenadas por cercanía** al
   incidente, con la distancia en kilómetros. Puedes filtrar por tipo.
4. Marca una o varias y confirma.

Al asignar, las unidades pasan a **Ocupado**, el ciudadano recibe el aviso y
queda registrado en el historial.

Para **retirar** una unidad, usa la ✕ junto a su nombre en el panel de personal
asignado. Vuelve a quedar libre, salvo que tenga otro incidente abierto.

## Cambiar el estado

El estado sigue un recorrido fijo:

```text
PENDIENTE ──► EN PROCESO ──► RESUELTO
    │              │
    └──────────────┴──────► CANCELADO
```

- **Marcar en proceso**: cuando el personal está atendiendo.
- **Resolver**: exige describir cómo se resolvió.
- **Cancelar**: exige el motivo. Para falsas alarmas o reportes duplicados.

> Si intentas un salto que no corresponde —por ejemplo de PENDIENTE directo a
> RESUELTO— el sistema lo rechaza y te dice qué opciones sí tienes.

Al cerrar una emergencia, sus unidades se liberan automáticamente.

## El mapa

En **Mapa** ves todo sobre la cartografía de Villavicencio:

- **Gotas de color**: emergencias. El color es la prioridad, el símbolo el tipo.
  Las **SOS** llevan un anillo que late y se dibujan encima del resto.
- **Círculos**: unidades. Verde disponible, naranja ocupada, gris fuera de
  servicio.

Puedes apagar cada capa, filtrar por estado, tipo o solo SOS, y pulsar
cualquier elemento de la lista lateral para que el mapa vuele hasta él.

Cuando entra un SOS, **el mapa va solo hasta él y abre su ficha**.

## Buscar y filtrar

En **Emergencias** tienes búsqueda por código, título, dirección o nombre del
ciudadano, más cinco filtros combinables. Los filtros quedan en la dirección
del navegador, así que puedes recargar o compartir el enlace sin perderlos.

## Estadísticas

En **Estadísticas** hay siete gráficos sobre datos reales, con selector de
periodo. El más útil para gestión es **Respuesta frente al objetivo**: cada
prioridad tiene su tiempo objetivo y la barra se pinta verde o roja según se
cumpla.

---

# 👑 Administrador

Tienes todo lo del operador, más lo siguiente.

## Gestionar usuarios

En **Usuarios** puedes buscar, filtrar por rol y estado, y:

- **Crear** un usuario con cualquier rol. La contraseña debe tener al menos 8
  caracteres con mayúscula, minúscula y número.
- **Editar** sus datos o cambiarle el rol.
- **Activar o desactivar** una cuenta. Al desactivarla se cierran sus sesiones
  abiertas de inmediato.
- **Eliminar** una cuenta.

> **Dos cosas que el sistema no te deja hacer**, a propósito:
> - Desactivarte, cambiarte el rol o borrarte **a ti mismo**: quedarías fuera
>   sin poder volver a entrar.
> - Dejar el sistema **sin ningún administrador activo**.
>
> Tampoco podrás borrar un usuario que tenga emergencias reportadas: se
> perdería el historial. Desactívalo en lugar de borrarlo.

## Gestionar personal

En **Personal**, además de cambiar disponibilidad, puedes crear y editar las
fichas de las unidades.

Para crear una unidad hace falta que exista **primero** un usuario con rol
PERSONAL. El sistema solo ofrece los que aún no tienen unidad asignada.

Cada unidad lleva un **código** (`UM-01`, `MB-02`), su tipo, su nombre y la
institución a la que pertenece.

## Auditoría

En **Auditoría** queda registro de las acciones sensibles: accesos correctos y
fallidos, creación y edición de usuarios, cambios de rol, asignaciones y
cambios de estado. Se puede filtrar por usuario, acción y rango de fechas.

## Configuración

En **Configuración** se ajustan parámetros sin tocar archivos ni reiniciar:
nombre del sistema, ciudad, centro y zoom del mapa, prioridad automática del
SOS y máximo de fotografías por emergencia.

---

# Problemas frecuentes

| Lo que ves | Qué pasa | Qué hacer |
|------------|----------|-----------|
| «Correo o contraseña incorrectos» | Las credenciales no coinciden | Verifica el correo. El mensaje es el mismo aunque el correo no exista, por seguridad |
| «Demasiados intentos» | Cinco intentos fallidos seguidos | Espera unos minutos |
| «Tu cuenta está desactivada» | Un administrador la desactivó | Contacta al administrador |
| El punto dice «Sin conexión» | Se perdió el canal en vivo | Recarga la página |
| Te devuelve al acceso de repente | La sesión expiró o se recargaron los datos de demostración | Vuelve a entrar |
| El mapa sale en gris | Sin acceso a internet para las teselas | El resto del sistema sigue funcionando |
| No aparece «Instalar» | No estás en HTTPS ni en `localhost` | Ver el README, apartado de instalación en Android |
| El botón SOS no hace nada | Es de pulsación sostenida | Manténlo pulsado 2 segundos completos |
| «Sin unidades disponibles» | Todas están ocupadas o fuera de servicio | Libera alguna o espera a que cierren su emergencia |

---

# Usuarios de demostración

Todos comparten la contraseña **`Emergencia2026*`**.

| Rol | Correo |
|-----|--------|
| Administrador | `admin@ers.gov.co` |
| Operador | `operador1@ers.gov.co` |
| Ciudadano | `maria.ruiz@example.com` |
| Paramédico | `camilo.ospina@ers.gov.co` |
| Bombero | `oscar.duarte@ers.gov.co` |

> Son credenciales **de demostración**. No deben usarse en un despliegue real.

En la pantalla de acceso, cuando el sistema está en modo desarrollo, aparecen
botones que rellenan estos datos con un clic.
