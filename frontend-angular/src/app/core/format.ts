const dateTime = new Intl.DateTimeFormat('es-CO', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

const time = new Intl.DateTimeFormat('es-CO', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

export function formatDateTime(value: string | Date | null | undefined): string {
  return value ? dateTime.format(new Date(value)) : '—';
}

export function formatTime(value: string | Date): string {
  return time.format(new Date(value));
}

/** "hace 5 min", "hace 2 h", "hace 3 d". */
export function timeAgo(value: string | Date | null | undefined, now = Date.now()): string {
  if (!value) return '—';
  const seconds = Math.max(0, Math.round((now - new Date(value).getTime()) / 1000));
  if (seconds < 60) return 'hace un momento';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `hace ${hours} h`;
  return `hace ${Math.round(hours / 24)} d`;
}

export const UNIT_STATUS: Record<string, string> = {
  DISPONIBLE: 'Disponible',
  OCUPADO: 'Ocupado',
  FUERA_DE_SERVICIO: 'Fuera de servicio',
};

export const UNIT_TYPE: Record<string, string> = {
  PARAMEDICO: 'Paramédico',
  BOMBERO: 'Bombero',
  POLICIA: 'Policía',
  RESCATISTA: 'Rescatista',
};
