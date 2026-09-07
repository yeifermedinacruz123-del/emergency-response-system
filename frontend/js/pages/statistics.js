/**
 * statistics.js - Página de estadísticas con Chart.js.
 *
 * Todos los datos vienen de la API, que a su vez los calcula con SQL sobre la
 * base de datos. No hay ni un número escrito a mano en este archivo.
 *
 * Los colores tampoco se inventan aquí: llegan en la respuesta, porque están
 * guardados en los catálogos de la base. Así el rojo de "crítica" es el mismo
 * en el gráfico, en la tabla y en el marcador del mapa.
 */

import { ROLES, SOCKET_EVENTS } from '../core/config.js';
import { requireAuth } from '../core/auth.js';
import { api } from '../core/api.js';
import { realtime } from '../core/socket.js';
import { mountLayout, setSubtitle } from '../components/layout.js';
import { notifyApiError, notify } from '../core/ui.js';
import { $, escapeHtml, formatDuration, debounce } from '../core/utils.js';

/** Instancias de Chart.js, para poder destruirlas antes de repintar. */
const charts = new Map();

const state = { days: 30 };

/* ==========================================================================
   Configuración común
   ========================================================================== */

/** Lee un color del tema para que los gráficos sigan el modo claro/oscuro. */
function themeColor(name, fallback) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

/** Opciones compartidas por todos los gráficos. */
function baseOptions() {
  const grid = themeColor('--border-soft', '#e2e8f0');
  const text = themeColor('--text-muted', '#64748b');

  return {
    responsive: true,
    // Obligatorio: el contenedor define la altura (ver .chart-box en charts.css).
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: { color: text, font: { size: 12 }, usePointStyle: true, boxWidth: 8 },
      },
      tooltip: {
        backgroundColor: themeColor('--brand-800', '#101a2e'),
        titleFont: { size: 13 },
        bodyFont: { size: 12 },
        padding: 10,
        cornerRadius: 6,
        displayColors: true,
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: text, font: { size: 11 } },
      },
      y: {
        beginAtZero: true,
        grid: { color: grid },
        ticks: { color: text, font: { size: 11 }, precision: 0 },
      },
    },
  };
}

/**
 * Crea o reemplaza un gráfico.
 * Chart.js no permite dos instancias sobre el mismo lienzo: hay que destruir
 * la anterior o el gráfico queda "fantasma" y los tooltips se duplican.
 */
function render(id, config) {
  const previous = charts.get(id);
  if (previous) previous.destroy();

  const canvas = document.getElementById(id);
  if (!canvas) return null;

  const chart = new window.Chart(canvas, config);
  charts.set(id, chart);
  return chart;
}

/** Mensaje cuando una serie no tiene datos que mostrar. */
function showEmpty(canvasId, message) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const previous = charts.get(canvasId);
  if (previous) {
    previous.destroy();
    charts.delete(canvasId);
  }

  canvas.parentElement.innerHTML = `
    <div class="chart-empty">
      <span class="chart-empty__icon" aria-hidden="true">📉</span>
      <p class="chart-empty__text">${escapeHtml(message)}</p>
    </div>`;
}

/* ==========================================================================
   Indicadores de resumen
   ========================================================================== */

function renderSummary(dashboard, responseTime) {
  const counters = dashboard.counters;
  const summary = responseTime.summary;

  const set = (key, value) => {
    const node = document.querySelector(`[data-kpi="${key}"]`);
    if (node) node.textContent = value;
  };

  set('total', counters.total);

  // La tasa se calcula sobre las cerradas, no sobre el total: incluir las
  // abiertas en el denominador la haría bajar solo por haber trabajo en curso.
  const cerradas = counters.resueltas + counters.canceladas;
  const tasa = cerradas > 0 ? Math.round((counters.resueltas / cerradas) * 100) : 0;

  set('tasa', `${tasa}%`);
  $('#tasa-hint').textContent = `${counters.resueltas} resueltas de ${cerradas} cerradas`;

  set('asignacion', summary.avg_response_minutes === null
    ? 'sin datos'
    : formatDuration(summary.avg_response_minutes));

  set('resolucion', summary.avg_resolution_minutes === null
    ? 'sin datos'
    : formatDuration(summary.avg_resolution_minutes));

  set('sos', counters.sos_total);
  const porcentajeSos = counters.total > 0
    ? Math.round((counters.sos_total / counters.total) * 100)
    : 0;
  $('#sos-hint').textContent = `${porcentajeSos}% del total · ${counters.sos_activas} activas`;
}

/* ==========================================================================
   Gráficos
   ========================================================================== */

function renderPorDia(byDay) {
  const options = baseOptions();
  options.plugins.legend.position = 'top';
  options.interaction = { mode: 'index', intersect: false };

  render('chart-dia', {
    type: 'line',
    data: {
      labels: byDay.map((d) => d.label),
      datasets: [
        {
          label: 'Total reportadas',
          data: byDay.map((d) => d.total),
          borderColor: themeColor('--brand-500', '#274270'),
          backgroundColor: 'rgba(39, 66, 112, 0.12)',
          fill: true,
          tension: 0.3,
          borderWidth: 2,
          pointRadius: 3,
          pointHoverRadius: 5,
        },
        {
          label: 'De ellas, SOS',
          data: byDay.map((d) => d.sos),
          borderColor: themeColor('--accent-500', '#dc2626'),
          backgroundColor: 'rgba(220, 38, 38, 0.12)',
          fill: true,
          tension: 0.3,
          borderWidth: 2,
          pointRadius: 3,
          pointHoverRadius: 5,
        },
      ],
    },
    options,
  });
}

function renderPorTipo(byType) {
  const conDatos = byType.filter((t) => t.total > 0);

  if (conDatos.length === 0) {
    showEmpty('chart-tipo', 'Todavía no hay emergencias registradas.');
    return;
  }

  const options = baseOptions();
  options.indexAxis = 'y';           // barras horizontales: los nombres son largos
  options.plugins.legend.display = false;
  options.scales.x.beginAtZero = true;
  options.scales.x.grid = { color: themeColor('--border-soft', '#e2e8f0') };
  options.scales.y.grid = { display: false };

  render('chart-tipo', {
    type: 'bar',
    data: {
      labels: conDatos.map((t) => `${t.icon || ''} ${t.label}`.trim()),
      datasets: [{
        label: 'Emergencias',
        data: conDatos.map((t) => t.total),
        backgroundColor: conDatos.map((t) => t.color || '#64748b'),
        borderRadius: 4,
        borderWidth: 0,
      }],
    },
    options,
  });
}

function renderPorEstado(byStatus) {
  const conDatos = byStatus.filter((s) => s.total > 0);

  if (conDatos.length === 0) {
    showEmpty('chart-estado', 'Todavía no hay emergencias registradas.');
    return;
  }

  const options = baseOptions();
  delete options.scales;             // las donas no tienen ejes
  options.plugins.legend.position = 'bottom';
  options.cutout = '58%';

  render('chart-estado', {
    type: 'doughnut',
    data: {
      labels: conDatos.map((s) => s.label),
      datasets: [{
        data: conDatos.map((s) => s.total),
        backgroundColor: conDatos.map((s) => s.color || '#64748b'),
        borderColor: themeColor('--surface-card', '#ffffff'),
        borderWidth: 3,
      }],
    },
    options,
  });
}

function renderPorPrioridad(byPriority) {
  const options = baseOptions();
  options.plugins.legend.display = false;

  render('chart-prioridad', {
    type: 'bar',
    data: {
      labels: byPriority.map((p) => p.label),
      datasets: [{
        label: 'Emergencias',
        data: byPriority.map((p) => p.total),
        backgroundColor: byPriority.map((p) => p.color || '#64748b'),
        borderRadius: 4,
        borderWidth: 0,
      }],
    },
    options,
  });
}

function renderPorZona(byZone) {
  const conDatos = byZone.filter((z) => z.total > 0);

  if (conDatos.length === 0) {
    showEmpty('chart-zona', 'Todavía no hay emergencias con zona asignada.');
    return;
  }

  const options = baseOptions();
  options.indexAxis = 'y';
  options.plugins.legend.display = false;
  options.scales.x.grid = { color: themeColor('--border-soft', '#e2e8f0') };
  options.scales.y.grid = { display: false };

  render('chart-zona', {
    type: 'bar',
    data: {
      labels: conDatos.map((z) => z.label),
      datasets: [{
        label: 'Emergencias',
        data: conDatos.map((z) => z.total),
        backgroundColor: themeColor('--brand-400', '#3a5c94'),
        borderRadius: 4,
        borderWidth: 0,
      }],
    },
    options,
  });
}

function renderTiempoPorDia(byDay) {
  // Los días sin emergencias asignadas llegan como null: Chart.js los deja
  // como hueco en la línea, que es lo correcto — no son un cero.
  const tieneDatos = byDay.some((d) => d.avg_response_minutes !== null);

  if (!tieneDatos) {
    showEmpty('chart-tiempo', 'Aún no hay emergencias con personal asignado en este periodo.');
    return;
  }

  const options = baseOptions();
  options.plugins.legend.display = false;
  options.scales.y.title = {
    display: true,
    text: 'minutos',
    color: themeColor('--text-muted', '#64748b'),
    font: { size: 11 },
  };
  options.plugins.tooltip.callbacks = {
    label: (context) => `${context.parsed.y} minutos hasta la asignación`,
  };

  render('chart-tiempo', {
    type: 'line',
    data: {
      labels: byDay.map((d) => d.label),
      datasets: [{
        label: 'Minutos hasta la asignación',
        data: byDay.map((d) => d.avg_response_minutes),
        borderColor: themeColor('--info', '#2563eb'),
        backgroundColor: 'rgba(37, 99, 235, 0.12)',
        fill: true,
        tension: 0.3,
        borderWidth: 2,
        pointRadius: 3,
        pointHoverRadius: 5,
        spanGaps: true,
      }],
    },
    options,
  });
}

/**
 * Comparación del tiempo real con el objetivo de cada prioridad.
 *
 * No se usa un gráfico: lo que importa es si se cumple o no el objetivo, y eso
 * se lee mejor en una barra con una marca que en un eje numérico.
 */
function renderObjetivos(byPriority) {
  const lista = $('#objetivo-lista');
  const conDatos = byPriority.filter((p) => p.avg_response_minutes !== null);

  if (conDatos.length === 0) {
    lista.innerHTML = `
      <div class="chart-empty" style="height: 200px;">
        <span class="chart-empty__icon" aria-hidden="true">⏱️</span>
        <p class="chart-empty__text">Aún no hay emergencias asignadas para comparar.</p>
      </div>`;
    return;
  }

  // La escala común es el mayor entre el peor promedio y el mayor objetivo,
  // para que todas las barras sean comparables entre sí.
  const escala = Math.max(
    ...conDatos.map((p) => Math.max(Number(p.avg_response_minutes), Number(p.target_minutes || 0)))
  ) * 1.15;

  lista.innerHTML = conDatos.map((p) => {
    const promedio = Number(p.avg_response_minutes);
    const objetivo = Number(p.target_minutes || 0);
    const cumple = objetivo === 0 || promedio <= objetivo;

    const anchoBarra = Math.min(100, (promedio / escala) * 100);
    const posicionObjetivo = Math.min(100, (objetivo / escala) * 100);

    return `
      <div class="target-row">
        <span class="target-row__label" style="color: ${escapeHtml(p.color || '#64748b')}">
          ${escapeHtml(p.label)}
        </span>
        <div class="target-bar" role="img"
             aria-label="${escapeHtml(p.label)}: ${promedio} minutos, objetivo ${objetivo} minutos">
          <div class="target-bar__fill"
               style="width: ${anchoBarra}%; background: ${cumple ? 'var(--success)' : 'var(--danger)'}"></div>
          ${objetivo > 0 ? `<div class="target-bar__goal" style="left: ${posicionObjetivo}%"></div>` : ''}
        </div>
        <span class="target-row__value">
          ${promedio} / ${objetivo} min
        </span>
      </div>`;
  }).join('');
}

function renderCarga(workload) {
  const conDatos = workload.filter((u) => u.total > 0);

  if (conDatos.length === 0) {
    showEmpty('chart-carga', 'Ninguna unidad tiene emergencias asignadas todavía.');
    return;
  }

  const options = baseOptions();
  options.plugins.legend.position = 'bottom';
  options.scales.x.stacked = true;
  options.scales.y.stacked = true;

  render('chart-carga', {
    type: 'bar',
    data: {
      labels: conDatos.map((u) => u.label),
      datasets: [
        {
          label: 'Completadas',
          data: conDatos.map((u) => u.completadas),
          backgroundColor: themeColor('--success', '#16a34a'),
          borderRadius: 4,
        },
        {
          label: 'En curso',
          data: conDatos.map((u) => u.activas),
          backgroundColor: themeColor('--warning', '#f59e0b'),
          borderRadius: 4,
        },
      ],
    },
    options,
  });
}

/* ==========================================================================
   Carga de datos
   ========================================================================== */

async function loadAll() {
  try {
    // Tres peticiones independientes: en paralelo.
    const [dashboard, emergencies, responseTime] = await Promise.all([
      api.get('/statistics/dashboard'),
      api.get('/statistics/emergencies', { days: state.days }),
      api.get('/statistics/response-time', { days: state.days }),
    ]);

    renderSummary(dashboard, responseTime);

    renderPorDia(emergencies.byDay);
    renderPorTipo(emergencies.byType);
    renderPorEstado(emergencies.byStatus);
    renderPorPrioridad(emergencies.byPriority);
    renderPorZona(emergencies.byZone);

    renderTiempoPorDia(responseTime.byDay);
    renderObjetivos(responseTime.byPriority);
    renderCarga(responseTime.workload);

    setSubtitle(
      `${dashboard.counters.total} emergencias · últimos ${state.days} días · ` +
      `actualizado ${new Date().toLocaleTimeString('es-CO')}`
    );
  } catch (error) {
    notifyApiError(error, 'No se pudieron cargar las estadísticas');
  }
}

/* ==========================================================================
   Interacción
   ========================================================================== */

function setupControls() {
  $('#f-days').addEventListener('change', (event) => {
    state.days = Number.parseInt(event.target.value, 10);
    loadAll();
  });

  $('#btn-refresh').addEventListener('click', () => {
    loadAll();
    notify.info('Estadísticas actualizadas');
  });

  /*
   * Al cambiar el tema hay que repintar: los colores de ejes y leyendas se
   * leen una sola vez, al construir cada gráfico.
   */
  const themeButton = $('#btn-theme');
  if (themeButton) {
    themeButton.addEventListener('click', () => setTimeout(() => loadAll(), 60));
  }
}

/** El tiempo real solo dispara una recarga: los cálculos los hace SQL. */
function setupRealtime() {
  const refresh = debounce(() => loadAll(), 1500);

  [
    SOCKET_EVENTS.EMERGENCY_NEW,
    SOCKET_EVENTS.EMERGENCY_STATUS,
    SOCKET_EVENTS.EMERGENCY_ASSIGNED,
    SOCKET_EVENTS.STATS_UPDATE,
  ].forEach((event) => realtime.on(event, refresh));
}

/* -------------------------------------------------------------------------- */

async function init() {
  const user = await requireAuth([ROLES.OPERADOR, ROLES.ADMINISTRADOR]);
  if (!user) return;

  await mountLayout({ user, title: 'Estadísticas' });

  if (!window.Chart) {
    notify.error('No se pudo cargar la librería de gráficos. Comprueba frontend/vendor/chartjs.');
    return;
  }

  // Tipografía por defecto de todos los gráficos.
  window.Chart.defaults.font.family =
    getComputedStyle(document.body).fontFamily || 'system-ui, sans-serif';
  window.Chart.defaults.font.size = 12;

  setupControls();
  setupRealtime();

  await loadAll();
}

init();
